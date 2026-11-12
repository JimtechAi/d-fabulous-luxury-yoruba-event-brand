# Stage 4 rollback guide (staging only)

**Status: PREPARED, NOT EXECUTED.** Every rollback script was exercised only in the PGlite simulation (see `STAGE4_SECURITY_TEST_MATRIX.md`, scenario 24).
Source of truth for the original design: `supabase/staging/source/production_public_schema.sql` (SHA-256 `f41bf2fee49c315b0b6806552f512960381c635907cc88a73004b1f708f2ad50`, unchanged). Target: `dfabulous-staging` (`qwoxxroszmwobnzqgndr`).

## 1. Rules that apply to every rollback

* Run as `postgres` on the staging project, armed in the same session: `SELECT set_config('dfabulous.confirm_project', 'qwoxxroszmwobnzqgndr', false);`
* Every rollback is a single transaction with its own post-condition; any failure leaves the database as it was before the rollback.
* A rollback restores the state captured by the matching install script in `dfabulous_stage4` (snapshots are captured **once**; re-running an install never overwrites them). They refuse to run if the snapshot or the applied-state row is missing, so they cannot touch production (no marker, no snapshot).
* Rollbacks restore **definitions and privileges only**. They never touch data, Auth users, Edge Functions, application deployments or environment variables.

## 2. Order (exact reverse of installation)

| Order | Script | Undoes | Restores | Refuses when |
|---|---|---|---|---|
| 1 | `supabase/staging/rollback/04_rollback_security_C.sql` | `06_security_C.sql` | production `is_admin()` / `is_owner()` exactly (role-only checks, `search_path public, pg_temp`) | C not recorded as applied |
| 2 | `supabase/staging/rollback/03_rollback_security_B.sql` | `05_security_B.sql` | production `prevent_role_escalation()` exactly (SECURITY DEFINER) | B not applied, **or C still applied** |
| 3 | `supabase/staging/rollback/02_rollback_security_A.sql` | `04_security_A.sql` | the five tables' policies and privileges exactly as after Phase 1 (drops the policies A created, re-creates those it dropped); **drops the payments guard/audit triggers and functions `stage4_payments_guard()`/`stage4_payments_audit()` and the payments column-level UPDATE grants**; `payment.updated` audit rows already written are kept | A not applied |
| 4 | `supabase/staging/rollback/01a_rollback_privilege_normalisation.sql` | `02_privilege_normalisation.sql` | schema, table/sequence, column, function and default privileges to the state right after `01` (**more open than production**; use only to retry or diagnose) | no marker or no snapshot |
| 5 | `supabase/staging/rollback/01_rollback_baseline.sql` | `01_production_schema.sql` | removes the 12 tables, the sequence and the production functions; restores schema ACL and default privileges to the state captured **before** `01`; drops `dfabulous_stage4` | see below |

Steps 1-3 are independent of one another except the C/B rule (C before B). Step 4 (`01a`) now **refuses to run while any Phase 2 proposal is applied** (a review finding: it would otherwise reopen privileges underneath A). A and B may each be rolled back alone; C requires B to stay until C is gone. Dependency summary: C needs B; A needs nothing but Phase 1; the A payments policy calls `is_admin()`, which C and its rollback replace in place (never drop), so every order of A/B/C rollbacks that respects C-before-B works (tested: A alone, B alone, C then B, C then B then A; out-of-order B refused). Rolling A back re-opens production behaviour on `payments` (any admin, including a suspended one before C, could update through RLS) but the Phase 1 privilege state still withholds UPDATE. Steps 4 and 5 are a pair: step 5 does not need step 4 (it restores the pre-`01` privilege state directly), but running 4 first is harmless.

## 3. The destructive rollback (step 5)

`01_rollback_baseline.sql` **drops tables with CASCADE**. Its interlocks, all required:

1. armed guard (above);
2. `SELECT set_config('dfabulous.confirm_drop', 'DROP STAGING BASELINE OBJECTS', false);`
3. no Phase 2 proposal still applied (`dfabulous_stage4.phase2_state` empty);
4. every one of the 12 tables empty, otherwise additionally `SELECT set_config('dfabulous.allow_drop_data', 'yes-delete-staging-test-data', false);`

It leaves alone anything it did not create: `api_rate_limits` and its functions (from the optional migrations), a platform-owned `rls_auto_enable()` (owner not `postgres`) or one used by an event trigger, and everything in `auth`, `storage` and other schemas. Remove the rate-limit objects with their own statements if you want a pristine `public`:

```sql
DROP FUNCTION IF EXISTS public.consume_rate_limit(text, integer, integer);
DROP FUNCTION IF EXISTS public.cleanup_expired_rate_limits(integer, integer);
DROP TABLE IF EXISTS public.api_rate_limits;
```

After step 5 the guard in `01` allows a fresh install again (verified in the simulation).

## 4. What a rollback does not restore

* Rows deleted by step 5 (staging test data only; the package installs none).
* The state of objects created **after** the snapshot (the snapshot never saw them).
* Anything done outside the package (Auth settings, triggers on `auth.users`, event triggers, Edge Function configuration, application deployments).
* Default privileges of `supabase_admin` if the `postgres` login is not allowed to change them: the script raises a NOTICE and leaves them; compare with `03_validate_baseline.sql` check `V20`.

## 5. After any rollback: verify

| Rolled back to | Run | Expect |
|---|---|---|
| after A/B/C partially | `07_validate_hardened.sql` | rows of the applied proposals `PASS`, the others `FAIL` (that is the expected picture) |
| Phase 1 state (all of 04-02 rolled back) | `03_validate_baseline.sql` | `ZZ  PASS` (the simulation confirms the Phase 1 verdict returns to PASS) |
| after step 4 | `03_validate_baseline.sql` | privilege and default checks `FAIL`, structure checks `PASS` (the baseline is open again) |
| after step 5 | `SELECT to_regclass('public.profiles'), to_regnamespace('dfabulous_stage4')` | both `NULL` |

## 6. Rolling back application code

The application corrections (`server.ts`, `routes/admin-users.ts`, `lib/audit.ts`) are ordinary repository changes: revert them with Git. Reverting them restores the old behaviour in which the deletion audit entry is silently rejected by the foreign key (SQLSTATE `23503`). They are not deployed by this package.

## 7. Known gaps in rollback readiness

* Verified only in simulation; the first real execution on staging is also the first real test of every rollback. Take a Supabase backup/branch of staging before step 1.1.
* Concurrency: the scripts set `lock_timeout = 10s` and fail rather than queue behind other sessions; under load a retry may be needed.
* Production adoption of A, B and C would need its own rollback rehearsal against a production-like copy; none of this package is approved for production.
