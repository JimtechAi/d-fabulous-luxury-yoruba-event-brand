# Stage 4 installation runbook (staging only)

**Status: PREPARED, NOT EXECUTED.** Nothing in this package has been run against any database. The SQL was exercised only in an in-memory simulation (PGlite, PostgreSQL 18.x); see `STAGE4_SECURITY_TEST_MATRIX.md` for what that does and does not prove.

| | |
|---|---|
| Target | `dfabulous-staging`, project ref `qwoxxroszmwobnzqgndr`, region eu-west-1, PostgreSQL 17.11 (stated by the owner, to be confirmed in step 0) |
| Source of truth | `supabase/staging/source/production_public_schema.sql`, SHA-256 `f41bf2fee49c315b0b6806552f512960381c635907cc88a73004b1f708f2ad50`, 52,351 bytes, **unchanged** |
| Data | Schema only. No Auth users, Storage objects, customer or business records, roles, extensions or `pg_cron` |
| Run as | the `postgres` login, in the Supabase SQL editor or `psql`, **staging project only** |

## 0. Before anything runs (you decide; none of this was done)

1. **Approve** the assumptions in `STAGE4_READINESS_REPORT.md` section 8.
2. **Read-only inspection of staging** (needs your approval, connects to staging): confirm `SHOW server_version` is 17.x; `public` is empty; whether `public.rls_auto_enable()` and a database event trigger already exist; default privileges (`\ddp` or `pg_default_acl`); sign-ups are **disabled** in Auth settings; no traffic is pointed at the project. The existing `supabase/proposals/20261112_00_inspect_readonly.sql` and `supabase/staging/source/auth_inspection_request_READONLY_NOT_EXECUTED.sql` are read-only and can be used.
3. **Read-only inspection of production** (needs your approval, connects to production) for the facts a public-only dump cannot show: the trigger on `auth.users` that calls `handle_new_user()`, `cron.job`, publications, event triggers. Phase 1 does not depend on the answers, but they decide whether to recreate the Auth trigger on staging (not part of this package).
4. Do **not** run anything under `supabase/staging/legacy_install/`, `08 Development/`, or `supabase/proposals/` on a project that received this package.

### The guard (every script)

Every script refuses to run unless the session is armed with the staging project reference. Run this in the **same session, immediately before** the script text:

```sql
SELECT set_config('dfabulous.confirm_project', 'qwoxxroszmwobnzqgndr', false);
```

This is a deliberate acknowledgement, **not proof of the target**: SQL cannot know which Supabase project it is connected to. The real protections are structural: `01` aborts if `public` is not empty (production is not), and every later script aborts unless the marker row that only `01` creates (`dfabulous_stage4.install_marker`) exists, so none of them can run on production. Paste each script **whole** and run it in one go; on any error the script's own transaction rolls back and you stop.

## 1. Phase 1: production-equivalent baseline, then least privilege

| Step | File | What it does | You must see |
|---|---|---|---|
| 1.1 | `supabase/staging/install/01_production_schema.sql` | Restores the 12 tables, sequence, 12 functions, 10 triggers, 35 policies, indexes and constraints from the export (removals R1-R3 only, see its header), creates the install marker and the snapshot tables, captures the pre-install schema/default privileges | no error; post-condition block passes (tables 12, RLS 12, forced 0, triggers 10, policies 35, indexes 42, functions 12). A NOTICE `rls_auto_enable() already exists` is normal on some projects |
| 1.2 | `supabase/staging/install/02_privilege_normalisation.sql` | Replaces the additive default privileges with the least-privilege matrix; captures the pre-state once; fixes default privileges of `postgres`/`supabase_admin` | no error; NOTICEs about `supabase_admin` default privileges mean the `postgres` login may not change them (see risks) |
| 1.3 | `supabase/staging/install/03_validate_baseline.sql` | Read-only verification | last row `ZZ  PASS`, every row `PASS` |
| 1.4 (optional) | `supabase/migrations/20261110120000_api_rate_limits.sql`, then `20261111090000_api_rate_limits_cleanup_hardening.sql` | Rate-limit table and functions (service_role only) that the Edge Function needs; **not** in production's export | run `03` again: still `PASS` |

**Stop condition:** any `FAIL` in `03`. Do not continue to Phase 2. Use the rollback guide.
**Between 1.1 and 1.2 the project is more open than production.** Run them back to back, with no traffic.

Phase 1 acceptance tests on staging itself (real Supabase, staging keys, you run them): public services page loads for anonymous visitors; an administrator logs in and lists bookings/payments; a booking submission works through the backend; **role change and user deletion through the backend are still expected to fail at this point** (production defects S1/S8: role change is fixed by proposal B; deletion needs the `DELETE` grant that `02` adds, so deletion should already work, but the audit entry still needs the code correction below).

## 2. Phase 2: security remediation (each step independently reversible)

| Step | File | Requires | Effect |
|---|---|---|---|
| 2.1 | `supabase/staging/install/04_security_A.sql` | Phase 1 | Profile UPDATE policies removed; `user_permissions` read-only for browser roles (+ own-row read); RESTRICTIVE denies on identity tables and payment DELETE; **payments: active administrators may edit 7 columns** (column-level grant + RESTRICTIVE active-admin policy `stage4_require_active_admin_update` + guard trigger `trg_stage4_payments_guard` + audit trigger `trg_stage4_payments_audit`); privileges revoked; audit log append-only for `service_role` |
| 2.2 | `supabase/staging/install/05_security_B.sql` | Phase 1 | `prevent_role_escalation()`: service_role path explicit; no self-role change; owner only on others' rows; SECURITY INVOKER, empty search_path |
| 2.3 | `supabase/staging/install/06_security_C.sql` | Phase 1 **and 2.2** | `is_admin()`/`is_owner()` require `is_active IS TRUE` (closes 26 policies at once) |
| 2.4 | `supabase/staging/install/07_validate_hardened.sql` | 2.1-2.3 | Read-only; last row `ZZ  PASS`. Rows `HA*`, `HB*`, `HC*` report A, B and C individually |

A and B are independent of each other (any order, either alone). C requires B. **Recommended order: A, B, C**, validating after each.

### Application code corrections (in the repository, not deployed)

Deploy these to the **staging** backend only, after Phase 2 is validated:

* `server.ts` and `supabase/functions/dfabulous-api/routes/admin-users.ts`: the `user.deleted` audit entry stores the removed id in `metadata.deleted_user_id` and leaves `target_user_id` null (the foreign key to the deleted profile would otherwise reject the entry; verified by simulation and by the new Deno test).
* `server.ts` and `supabase/functions/dfabulous-api/lib/audit.ts`: a rejected audit write is now logged instead of silently ignored.
* The Edge Function stays **unactivated**; nothing is deployed by this package.

### Staging tests on the real project (required; the simulation cannot replace them)

1. As the Owner through the staging API: change a staff member's role (proposal B path through the service key), create an administrator, delete a staff user (profile row gone, bookings/payments/audit rows kept, Auth user still present), suspend an administrator.
2. As a suspended administrator/owner: every administrative endpoint refuses (API) and a direct REST call with the user's token returns no rows (proposal C).
3. With an administrator's token directly against PostgREST: `PATCH profiles`, `POST user_permissions` are refused (proposal A); `PATCH payments` with `amount`/`status`/etc. **plus `metadata.adjustment_reason`** succeeds for an active administrator and writes a `payment.updated` row (with the reason) to `audit_logs`; the same PATCH **without** a reason is refused (23514); `PATCH payments` with `booking_id`, `gateway_reference`, `provider` or `customer_email` is refused; `DELETE payments` is refused; a suspended administrator and an ordinary user get no rows updated.
3a. Delete a staff user who has a payment recorded: the profile goes, the payment keeps its row with `user_id` null, and one `payment.user_unlinked` audit row (context `profile_deletion`, no actor) records that change.
4. Confirm PostgREST really runs requests as `service_role` for the service key (the trigger in B depends on `current_user`).
5. Anonymous: services readable, everything else refused, `rpc/purge_archived_bookings` refused.

## 3a. Final decisions (approved) and what they changed

| Decision | Policy applied | Where |
|---|---|---|
| **A: inactive Owner** | `is_owner()` and `is_admin()` require `is_active IS TRUE` (proposal C, unchanged in design). An inactive Owner/administrator loses every administrative policy at once; the account, role and `user_permissions` rows are untouched, so the backend setting `is_active = true` restores authority with no reconstruction. | `06_security_C.sql`, tests `decision A` |
| **B: browser profile updates** | No browser role can write any column of `profiles` (no privilege, no permissive policy, RESTRICTIVE deny). **User-editable in the database: none.** Self-service changes (display name in user metadata, password) go through Supabase Auth (`src/lib/auth.ts` `auth.updateUser`), not through `public.profiles`. **Require backend authorisation (service key, after `requireAdminAccess` and hierarchy checks):** `role`, `is_active`, `full_name`, `email`, creation and deletion of a profile, and every `user_permissions` row. The browser-token Supabase client in `server.ts`/Edge Function only reads `profiles`; a new static test fails if it ever writes. | `04`, `05`; tests `decision B`, `stage4-package` |
| **C: payments** | Active administrators/Owner edit payments directly; nobody deletes. Editable columns: `amount`, `currency`, `payment_type`, `status`, `payment_method`, `metadata`, `paid_at`. Protected for every role: `id`, `booking_id`, `user_id` (may only become NULL, which the profile-deletion foreign key does), `provider`, `gateway_reference`, `gateway_transaction_id`, `customer_email`, `created_at`. Every effective change appends `audit_logs` action `payment.updated` (actor, payment, booking, changed fields, before, after; the DB clock stamps `created_at`). | `04`, tests `decision C` |

The application has **no endpoint that edits a payment** today (`POST /api/bookings/:id/payments` inserts only). Direct edits therefore happen through the Supabase REST API with an administrator's token, or through a future endpoint; adding an endpoint and UI is out of scope and must use the user's token (not the service key), so the active-admin policy and audit trigger apply.

## 3b. Payment edits: reason, audit events and gateway reconciliation (final review)

**Reason (database-enforced).** Every effective edit of a payment by an API role (`anon`/`authenticated`) must include `metadata.adjustment_reason`: a JSON string, 1 to 500 characters after trimming. The `BEFORE UPDATE` trigger `stage4_payments_guard()` rejects the statement with SQLSTATE `23514` otherwise, whatever the client. It removes the key from the stored row (so a payer who may read their own payment never sees it) and passes it to the audit trigger through a transaction-local setting. A save that changes nothing needs no reason and writes no audit row. Edits by the database owner in the SQL editor are not API edits: they need no reason and are recorded with context `database_session`; restrict who holds the `postgres` login. Example client call: `PATCH payments?id=eq.<id>` with `{"status":"successful","metadata":{"adjustment_reason":"Bank transfer confirmed on statement 2026-11-10"}}` (note: `metadata` is replaced as a whole, so include existing keys you want to keep).

**Audit events** (`audit_logs`, readable only by the active Owner; the application never returns this table to a client):

| action | context | actor | when |
|---|---|---|---|
| `payment.updated` | `administrator_edit` | the administrator (`auth.uid()`) | an active administrator edits a payment; has `adjustment_reason`, `changed_fields`, `before`, `after`, `db_role` |
| `payment.updated` | `database_session` | none | an edit by a non-API role (SQL editor); no reason is required, so none is recorded |
| `payment.user_unlinked` | `profile_deletion` | none (never invented) | the foreign key sets `payments.user_id` to NULL because the profile was deleted; carries `deleted_user_id`. Selected by facts the database can see (only `user_id` changed to NULL, owner-run, the profile row no longer exists), not by a caller claim |

**Gateway reference and transaction reconciliation.** `provider`, `gateway_reference` (unique) and `gateway_transaction_id` are immutable for every role, so an administrator cannot silently re-point a payment at a different gateway transaction. Safe corrections, in order of preference:
1. Wrong amount, status, method or paid date: edit the row (reason required, audited).
2. A gateway reference or transaction id was entered wrongly, or arrives late: do **not** edit it. Set the wrong row to `status = 'cancelled'` (reason: what was wrong and the correct reference), then insert a new payment through the normal API path with the correct values. The cancelled row keeps its old reference, which still occupies the unique constraint; use a corrected reference for the new row only if it differs, otherwise use step 3.
3. The wrong reference must itself be released (for example the right reference is already blocked by the unique constraint): this is a break-glass operation for the Owner and the database administrator together, on staging first. Record the reason and approval in writing, take a backup, then as `postgres` in one transaction: `ALTER TABLE public.payments DISABLE TRIGGER trg_stage4_payments_guard;` correct the single row; `ALTER TABLE public.payments ENABLE TRIGGER trg_stage4_payments_guard;` and insert an `audit_logs` row (`payment.reference_corrected`, with payment id, old and new values, approver and reason) in the same transaction. Check that the trigger is enabled afterwards (`07_validate_hardened.sql`, `HA8`). The audit trigger stays enabled and also records the change. No such script is shipped, deliberately.
4. Automated reconciliation (a gateway webhook filling `gateway_transaction_id`) is not part of this package; it needs its own reviewed path (a dedicated function with a narrow grant) and must not reuse the browser administrator path.

## 3. Auth user deletion and session revocation (documented, NOT implemented)

The backend deletes only the **profile row** (`public.profiles`). Consequences to decide separately:

* The Supabase Auth login (`auth.users`) remains, so the e-mail address stays registered and the person can still sign in to Auth. The API then refuses them (no profile, `getAuthenticatedAdminUser` returns null), and with C/A the database refuses them too.
* **Existing sessions are not ended** by deleting a profile or by suspending an account (`is_active = false`). Access tokens stay valid until they expire (default one hour) and refresh tokens keep working until revoked.
* Options for the owner to choose (each needs an application change and its own test): (a) call `auth.admin.deleteUser(id)` instead, which removes the login and, through `profiles_id_fkey ... ON DELETE CASCADE`, the profile; keep the audit entry as above; (b) ban the user (`auth.admin.updateUserById(id, { ban_duration })`) and revoke sessions on suspension; (c) both. Deleting the Auth user is irreversible and must be a deliberate product decision.
* No code in this package deletes or bans an Auth user.

## 4. Things this package does not do

Connect to or change production or staging; run any SQL; create or change Supabase Functions or Auth settings; touch environment variables; install `pg_cron` or schedule `purge_archived_bookings()` (the function exists, unscheduled, executable by `service_role` only); copy any data; deploy; commit or push.
