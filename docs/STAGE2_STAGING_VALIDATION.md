# Stage 2: Staging Validation Procedure (NOT EXECUTED)

**Nothing in this document has been run.** It is the procedure the owner/DBA follows **after approval**, on a **separate staging Supabase project**
(created by you; never production, never with the compromised keys from the archive). Every script is in `supabase/proposals/` and is applied
manually in the staging SQL editor (or `psql` against staging). Nothing here touches production, Vercel, Render, environment variables, secrets or GitHub.
`supabase db push` must **not** be used: the proposals are deliberately outside `supabase/migrations/`.

Reference: findings and design in [STAGE2_SECURITY_REMEDIATION_REVIEW.md](./STAGE2_SECURITY_REMEDIATION_REVIEW.md).

## 0. Prerequisites and guard rails

* **Staging baseline first.** Staging project `dfabulous-staging` (ref `qwoxxroszmwobnzqgndr`, eu-west-1). The repository cannot build its own schema (no `CREATE TABLE` for `profiles`, `bookings`, `payments` and others) and its migrations conflict when run in filename order. Follow [STAGING_BASELINE_PLAN.md](./STAGING_BASELINE_PLAN.md): install either a verified schema-only dump of production (preferred) or `supabase/staging/01_base_schema_derived.sql`, then `supabase/staging/install/02_…` to `14_…` in that order, and compare with `supabase/staging/20261112_schema_compare_readonly.sql`. Only then continue below.
* Staging has the same schema as production (the baseline above, never production data).
* Staging users exist: `owner`, `admin-a`, `admin-b` (both `role = admin`, `users.manage` + `bookings.manage` for `admin-a`), `admin-suspended` (`is_active = false`), `staff`, `staff-suspended`, `viewer`, plus their Auth logins.
* A staging copy of the application backend (Express or Edge Function) pointing at **staging** keys, for the regression steps. The production `VITE_API_BASE_URL` and the Render service are not touched.
* Save every query output below as evidence (no secrets in it). Run each stage in a quiet period; the scripts use `lock_timeout = 5s` and fail fast.
* **Stop conditions:** any unexpected result, any `Preflight failed`, any API regression. Roll back (section 7) and report; do not continue.

## 1. Read-only inspection (before changing anything)

Run `supabase/proposals/20261112_00_inspect_readonly.sql` and record:

| Query | Record | Decision |
|---|---|---|
| 1 | `is_owner()` body: `RETURN v_role = 'owner'` (**NULL variant**) or `RETURN EXISTS` (**false variant**) | Determines whether API role changes work today. Proposal B is needed in the false variant and recommended in both |
| 2 | triggers on `profiles`/`payments` | `trg_prevent_role_escalation` must exist (B requires it) |
| 3 | `profiles` columns | `id`, `role`, `email` must exist; is `is_active` present (C requires it)? |
| 4 | constraints / foreign keys | `user_permissions`, `audit_logs` FKs as in the repository |
| 5 | RLS flags and **all policies** | Compare with the repository; unknown permissive write policies are neutralised by A but must be noted |
| 6 | table privileges for PUBLIC/anon/authenticated/service_role | Does `authenticated` hold INSERT/UPDATE/DELETE on the identity tables? (decides whether W1-W3 are exploitable) |
| 7 | function privileges | helpers: `authenticated` only; trigger function: nobody but owner/service |
| 8 | account counts by role/active | Suspended administrators lose database access under C: intended? |
| 9 | triggers on `auth.users` and their bodies | **Any trigger that copies a role or permission from user-supplied metadata is a critical finding: stop and fix first.** Also confirm in the dashboard (Authentication → Settings) whether public sign-ups are enabled; they should be off |

Then run `20261112_99_verify_readonly.sql`: at baseline the "A", "B" and "C" rows and the snapshot row must be `false`; the "RLS enabled", "trigger attached", "helpers authenticated-only" and "service_role privileges" rows should be `true`.

## 2. Baseline: prove the findings on staging (before applying anything)

With **staging** tokens and the staging anon key (PostgREST; never production):

```powershell
$H = @{ apikey = $STAGING_ANON_KEY; Authorization = "Bearer $ADMIN_A_TOKEN"; "Content-Type" = "application/json"; Prefer = "return=minimal" }
Invoke-WebRequest -Method Post  "$STAGING_URL/rest/v1/user_permissions" -Headers $H -Body '{"user_id":"<admin-a id>","permission_key":"payments.manage"}'   # W1: 201 = exploitable, 401/403 = privileges absent
Invoke-WebRequest -Method Post  "$STAGING_URL/rest/v1/audit_logs"       -Headers $H -Body '{"action":"probe"}'                                              # W2
$S = @{ apikey = $STAGING_ANON_KEY; Authorization = "Bearer $STAFF_SUSPENDED_TOKEN"; "Content-Type" = "application/json"; Prefer = "return=minimal" }
Invoke-WebRequest -Method Patch "$STAGING_URL/rest/v1/profiles?id=eq.<staff-suspended id>" -Headers $S -Body '{"is_active":true}'                             # W3
Invoke-WebRequest -Method Patch "$STAGING_URL/rest/v1/profiles?id=eq.<admin-a id>" -Headers $H -Body '{"role":"owner"}'                                        # must be rejected (trigger)
```

Record the status codes. Clean up any row the probes created (`delete from public.user_permissions where ...`) using the SQL editor.
**API baseline:** with the staging backend run the regression list in section 6 once, so later failures can be attributed.

## 3. Apply proposal A (direct-write restriction)

1. Save a manual copy of query 5 and 6 output (the script also snapshots them into `public.security_remediation_snapshots`).
2. Run `20261112_a_restrict_direct_identity_writes.sql`. Expected: success, possibly a `NOTICE` if `service_role` lacks a write privilege (then the API could not write that table before either).
3. Run `20261112_99_verify_readonly.sql`: all **A** rows and the **snapshot** row `true`.
4. Repeat section 2: every direct write must now fail (`401/403`, `42501 permission denied` or `0 rows`); the role self-patch is still rejected.
5. Section 6 regression (API) must be unchanged versus baseline.
6. Re-run the script once more: it must succeed without error and the verify output must not change (idempotency).

## 4. Apply proposal B (role trigger)

1. Run `20261112_b_role_trigger_allow_service_role.sql` (aborts with `Preflight failed` if the function/trigger do not exist; do not work around that).
2. Verify: **B** rows `true`.
3. Through the staging API as the **Owner**: promote `staff` to `admin`, then demote back (`PATCH /api/admin/users/:id {"role":"admin"}`). Expected **200** in both `is_owner()` variants (in the false variant this *failed* at baseline: record it).
4. As an administrator with `users.manage`: attempt to promote → **403** (application rule). Directly with the administrator's token against PostgREST: still rejected.
5. Note: the SQL editor (`postgres`) can no longer change roles unless the trigger is disabled for the statement (intended).

## 5. Apply proposal C (optional; only after A and B passed)

1. Pre-check: `select email, role from public.profiles where role in ('owner','admin') and is_active = false;` (these accounts will lose direct access: intended?). Confirm `profiles.is_active` exists (inspection query 3); otherwise **skip C**.
2. Run `20261112_c_rls_helpers_require_active.sql` (refuses without B or without `is_active`).
3. Verify: **C** rows `true`.
4. Suspended administrator token: `GET /rest/v1/bookings` → empty/denied; `GET /rest/v1/profiles?id=eq.<own id>` → own row only; staging API → `403 inactive`. Re-activate through the API (as Owner/permitted admin): access returns. Active administrator and Owner unaffected.
5. Payment ledger: confirm no application path updates payments (none exists); a DBA correction now requires disabling `trg_enforce_payment_ledger_immutability` deliberately.

## 6. Application regression (staging backend, after **each** of sections 3, 4, 5)

| Area | Steps | Expected |
|---|---|---|
| Public booking | submit a booking; submit a contact message | success; rows created |
| Admin login | sign in as owner, admin, staff, viewer, suspended admin | owner/admin/staff/viewer OK (staff/viewer per their permissions); suspended → 403 |
| Dashboard | bookings list, calendar, enquiries, payments, customers, settings, users | same data as baseline; users list loads for `users.view` |
| Bookings | change status, archive, edit details, delete (Owner) | as baseline |
| Payments | record a deposit and a balance payment | success; totals correct |
| User management (API) | Owner creates admin/staff; Owner promotes/demotes; admin-with-`users.manage` creates staff, edits staff, attempts admin creation/promotion, attempts privileged permissions, attempts to touch Owner/admin; self changes | per `docs/SECURITY_ARCHITECTURE.md` §2a (Owner-only for administrators and privileged permissions); every denial 403; rate limit 429 after 30 |
| Settings / blocked dates | save a setting, block/unblock a date | success |
| Staff permissions (F10) | log in as a staff user with `bookings.view`: do their permissions load? | record; if empty at baseline it is a pre-existing issue, not caused by A-C |

## 7. Rollback rehearsal (staging)

Run in reverse order, each followed by the verify script and the section 2 probes:

1. `20261112_c_rls_helpers_require_active.rollback.sql` (if C was applied) → the original `is_admin()`/`is_owner()` text and grants return exactly (compare with the saved query 1 output).
2. `20261112_b_role_trigger_allow_service_role.rollback.sql` (refuses while C is applied) → original function text and grants.
3. `20261112_a_restrict_direct_identity_writes.rollback.sql` → original policies, RLS flags and grants for the four tables (compare with the saved query 5 and 6 output).

Expected: the baseline from sections 1-2 reappears **exactly**, including W1-W3 if they were exploitable. Re-apply A and B to leave staging in the target state. A rollback without a snapshot aborts with `No ... snapshot`; never edit the snapshot table by hand. After final acceptance the snapshot table may be dropped by the DBA (`drop table public.security_remediation_snapshots;`), only when no further rollback is needed.

## 8. Sign-off checklist

| Check | Result |
|---|---|
| Inspection queries 1-9 saved; sign-up path and `auth.users` triggers reviewed (query 9 + dashboard) | |
| Baseline probes recorded (W1-W3, role self-patch) | |
| A applied; verify = all A rows true; probes now denied; API regression unchanged; re-run idempotent | |
| B applied; Owner promote/demote works; admin promotion denied; direct role patches rejected | |
| C applied (optional); suspended admin loses direct access; active users unaffected | |
| Rollback rehearsed C → B → A; baseline restored exactly; re-applied | |
| API regression passed after each stage | |
| No unexplained 401/403/500 in staging backend logs for 24 h | |
| Written approval requested for production, one proposal at a time (production is **not** authorised by this document) | |

If any row fails: roll back, record the evidence, and report before further action.
