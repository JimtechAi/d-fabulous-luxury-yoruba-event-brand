# Stage 4 Readiness Report

Project: `dfabulous-staging` (`qwoxxroszmwobnzqgndr`). Source dump: `supabase/staging/source/production_public_schema.sql`, SHA-256 `f41bf2fee49c315b0b6806552f512960381c635907cc88a73004b1f708f2ad50` (52,351 bytes, unchanged).

**Classification: A. READY FOR INDEPENDENT REVIEW**

This is not a claim that the package is ready to install: it is ready for independent review and for a rehearsal on staging that you approve separately. All local package checks pass and the outstanding issues are listed below.

No remote project was accessed or modified. Nothing in this package has been executed against any Supabase project (production `fbhqegevyvpyzjoslblf` or staging). All database results are SIMULATED in local PGlite 0.5.16, which runs PostgreSQL 18.6, not 17.11, and does not emulate Supabase Auth, PostgREST, the pooler or event-trigger behaviour. They do not prove real Supabase or PostgreSQL 17.11 behaviour.

## Final decisions applied (this revision)

| Decision | Applied as | Files |
|---|---|---|
| A: inactive Owner | `is_owner()`/`is_admin()` require `is_active IS TRUE` (proposal C). Account, role and permission rows are preserved; reactivation by the backend restores access with nothing to rebuild. Confirmed against the actual `is_owner()` (EXISTS variant) in the dump. | `06_security_C.sql`, `04_rollback_security_C.sql` |
| B: profile updates | No browser role writes any `profiles` column. User-editable in the database: **none**. Display name and password change through Supabase Auth. Backend-only: `role`, `is_active`, `full_name`, `email`, create/delete, `user_permissions`. Application code already used the service client for every profile write; a static test now fails if a browser-token client ever writes profiles or edits payments. | `04`, `05` (unchanged design), `tests/stage4-package.test.mjs` |
| C: payments | Active administrators/Owner edit `amount`, `currency`, `payment_type`, `status`, `payment_method`, `metadata`, `paid_at` through a column-level UPDATE grant (no table-level UPDATE) and a RESTRICTIVE active-admin policy. Identifiers, booking link, provider, gateway references, customer email and `created_at` are immutable for every role. DELETE denied. Each effective change appends `audit_logs` `payment.updated` with actor, payment, booking, changed fields, before/after. Fail-closed. | `04_security_A.sql`, `02_rollback_security_A.sql`, `07_validate_hardened.sql` (`HA8`) |

Columns verified against the dump (`payments`: `id, booking_id, user_id, amount, currency, payment_type, provider, status, gateway_reference, gateway_transaction_id, payment_method, customer_email, metadata, paid_at, created_at, updated_at`); no column was invented. Production had no `updated_at` trigger on `payments`; the guard trigger sets it.

### Gaps verified and corrected

| Gap | Finding | Action |
|---|---|---|
| Service-role profile deletion | The earlier audit fix was necessary but not sufficient to prove the path. New finding: with the payments guard in place, the foreign-key `SET NULL` on `payments.user_id` is itself an UPDATE on payments; it runs as the table owner, so the guard allows `user_id` to become NULL only and the audit trigger records it without an actor. | Guard rule, tested with and without A+B+C |
| Service-role role change | Works through B; Owner included; browser admin/Owner still refused (A removes browser writes). | Tested |
| Audit after deletion | `target_user_id` NULL plus `metadata.deleted_user_id` is the only form the foreign key accepts (correction already in `server.ts` and the Edge route). | Tested; unchanged |
| Role-escalation / NULL | NULL, anon and unknown subjects are never treated as Owner or service_role. | Tested |
| Payment update policy and audit | Production policy let any admin (even suspended, `is_admin()` ignored `is_active`) update with no audit. | Replaced by the controls above |
| Rollback dependencies | A drops its payments objects; C needs B; independent rollbacks and C-B-A order tested. | `STAGE4_ROLLBACK_GUIDE.md` |

## Test results (run after the final edits)

| Command | Result |
|---|---|
| `npm run stage4:check` | up to date |
| `npm run staging:check` | up to date (15 files) |
| `npm run test:node` | 378 tests, 0 failures: static checks, SIMULATED database tests (Phase 1, Phase 2, final decisions, final review) and the native-export tests |
| `npm run test:edge` | 65 passed, 0 failed |
| `npm run lint` and `npm run lint:edge` | exit 0 |
| `npm run scan:secrets` | no findings |

All database tests are SIMULATED (PGlite 18.6). There are no real PostgreSQL 17.11 or Supabase integration tests. The dump SHA-256 is unchanged (`f41bf2fe…8f2ad50`).

## Final security review pass (this revision)

| # | Item | Result |
|---|---|---|
| 1 | Adjustment reason | Enforced in the database (`stage4_payments_guard()`): non-empty string, 1-500 characters, SQLSTATE 23514 otherwise, for every effective API-role edit. The reason is moved out of the payment row into the audit event. |
| 2 | Deletion context | The foreign-key `SET NULL` is recorded as `payment.user_unlinked`, context `profile_deletion`, with `deleted_user_id` and no actor, never as `payment.updated`. Finding: `pg_trigger_depth()` cannot detect it (the FK action fires at depth 1); the rule uses database facts instead (only `user_id` to NULL, owner-run, profile row gone). |
| 3 | audit_logs read access | One permissive policy: active Owner only. Admins, inactive Owner, staff, viewers, payers and anon read nothing; the application never returns audit logs. Finding: a stored reason would have been readable by a payer through their own payment row; fixed by not storing it. |
| 4 | Trigger review | No recursion (no trigger on `audit_logs`); DEFINER function pins an empty search_path and is immune to a hostile search_path; fail-closed and atomic across multi-row edits; no escalation path. |
| 5 | Grant bypass | New validator `HA9` fails on PUBLIC grants, other roles' UPDATE/DELETE, extra column grants and any function body that writes `payments`. Immutability and reason rules hold even after a re-granted table-level UPDATE. No service-key payment write exists in the code. |
| 6 | Reconciliation | Documented in runbook section 3b (edit, cancel-and-reinsert, break-glass, no automated path). |
| 7 | Credential exposure | Static tests: browser source reads only `VITE_`/build variables; Vite refuses secret-looking `VITE_` names and defines only public values; no response sends the key or the environment; `dist` scanned if present. **Not verifiable locally:** the `authenticator`/database password is never referenced by repository code, but hosting-provider environment settings and logs were not inspected. |
| 8 | Deletion and role-change tests | Extended with audit events and rollback (no audit row or payment lost; profile link not resurrected). |
| 9 | SQL inspection | Found and fixed: `01a_rollback_privilege_normalisation.sql` did not refuse while Phase 2 was applied and could reopen privileges beneath A. No other ordering error, missing dependency, over-broad grant (the only added grant is the 7-column UPDATE) or unguarded data loss found; `DROP TABLE ... CASCADE` remains confined to the interlocked baseline rollback. |

Evidence kinds: **static checks** (file scans, `stage4:check`, `staging:check`, lint, secret scan); **simulated database tests** (PGlite 18.x); **real Supabase/PostgreSQL 17.11 integration tests: none run**.

## Package

Phase 1 (`supabase/staging/install/`): `01_production_schema.sql` (generated from the unchanged dump), `02_privilege_normalisation.sql`, `03_validate_baseline.sql`. Phase 2: `04_security_A.sql`, `05_security_B.sql`, `06_security_C.sql`, `07_validate_hardened.sql`. Rollbacks in `supabase/staging/rollback/` run in reverse order. pg_cron is excluded; no customer or business rows are included; syntax is PostgreSQL 17 compatible (`CREATE OR REPLACE TRIGGER` needs 14+).

## Files changed in this revision

`supabase/staging/install/04_security_A.sql`, `07_validate_hardened.sql` (`HA8` extended, new `HA9`), `03_validate_baseline.sql` and `01_production_schema.sql` (regenerated, unchanged content), `supabase/staging/rollback/02_rollback_security_A.sql`, `supabase/staging/rollback/01a_rollback_privilege_normalisation.sql` (new Phase 2 interlock), `scripts/build-stage4-baseline.mjs` (earlier in this series), `tests/stage4-hardened.test.mjs`, `tests/stage4-package.test.mjs`, `tests/stage4-decisions.test.mjs`, new `tests/stage4-review.test.mjs`, and the four `STAGE4_*.md` reports. No application source changed in this pass. Temporary debug scripts in the OS temp folder were not part of the repository.

## Assumptions that are now decided

Inactive-owner policy, no direct browser profile writes and payment administration are approved. Still assumptions: staff/viewers read their own permissions; `authenticated` has no privileges on messages, site_settings, blocked_dates, gallery or testimonials; `service_role` has SELECT only on payments and nothing on `permissions`; the global `REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` default for `postgres`; the confirmation setting is an acknowledgement, not proof of the target project.

## Unresolved risks

- Nothing is proven on a real Supabase project or PostgreSQL 17.11: PostgREST role switching, JWT handling, the pooler, the `on_auth_user_created` trigger and the `rls_auto_enable` event trigger.
- Column-level privileges and `current_user` inside triggers under PostgREST are exercised only in simulation.
- The application has no endpoint or UI that edits a payment. Edits are possible through the REST API with an administrator token; any future endpoint must use the user's token so the policy and audit apply.
- Payments cannot have `gateway_reference` or `gateway_transaction_id` filled in after creation (protected). A webhook or reconciliation job would need its own reviewed path.
- Audit rows record before/after values including amounts and metadata; they are readable by the active Owner only. Metadata may contain personal data an administrator typed; reasons are free text (max 500 characters) and the same applies.
- A reason is required but its quality is not: an administrator can type any text. The audit trail makes edits attributable, not correct.
- Edits made as the database owner (SQL editor) bypass the reason requirement by design and are recorded as `database_session`; the `postgres` login must be tightly held.
- The profile-deletion audit classification relies on inference from database state, not a caller flag; it was verified only in simulation.
- Hosting-provider environment variables, deployment logs and the database password's storage were not inspected (outside the repository).
- An administrator can edit `amount` and `status` of a settled payment (the approved decision). Reconciliation controls rely on the audit trail, not on prevention.
- The `authenticator` login can `SET ROLE service_role`; keep that credential secret.
- `supabase_admin` default privileges may be unchangeable by the `postgres` login (verified by inspection only).
- Locks and concurrency are untested; Auth user deletion and session revocation remain unimplemented, so sessions last until their tokens expire.
- Production-equivalent privileges are intentionally not reproduced.

## Rollback readiness

Every proposal and phase has a scripted rollback, tested in simulation only: A (including the payments triggers, functions and column grants; audit rows are kept), B, C (C before B), `01a`, `01`. Take a Supabase backup or branch of staging before the first real execution.

## No-remote-access statement

No connection to production or staging was made; no `pg_dump`, `psql`, `supabase db push` or migration command was run; no SQL was sent to either project; no environment variable, Supabase setting, role or Windows privilege changed. Nothing was committed, pushed or deployed. Nothing is installed.

Awaiting your approval before any staging execution.

The earlier derived install was moved to `supabase/staging/legacy_install/` and marked superseded (do not run).

## Service-role application corrections (earlier revision, still in force)

- `server.ts` and `supabase/functions/dfabulous-api/routes/admin-users.ts`: the `user.deleted` audit entry uses `target_user_id: null` and `metadata: { deleted_user_id, role }`. The previous entry violated the audit_logs foreign key after the profile was deleted and failed silently.
- `server.ts` and `supabase/functions/dfabulous-api/lib/audit.ts`: rejected audit inserts are now logged as warnings.
- Deno tests emulate the foreign key and cover the correction.
