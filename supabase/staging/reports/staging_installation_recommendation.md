# Staging installation recommendation

**Readiness: A. READY FOR STAGING INSTALLATION PREPARATION.** This is **not** approval to install (that would be class B). Nothing below has been executed, and no file named here (other than the five reports and the inventory generator) has been written.

Baseline: `supabase/staging/source/production_public_schema.sql` (SHA-256 `f41bf2fee49c315b0b6806552f512960381c635907cc88a73004b1f708f2ad50`, 52,351 bytes, kept unchanged). Target: `dfabulous-staging` (`qwoxxroszmwobnzqgndr`).

## 1. Why A and not B or C

* The export is complete for its scope, passes all 13 static checks (no data, no credentials, no roles, no managed schemas, no `pg_cron`), and is far more reliable than the derived schema it replaces. Everything needed to **prepare** a staging install is known.
* It is not B because four gates are still open: the privilege-normalisation step does not exist (S7), the two unknown Auth-side objects have not been inspected, proposal A needs adapting, and the restore copy has not been prepared and diffed.
* It is not C because none of the open items is a defect in the export itself, and each has a defined, safe, local or read-only resolution.

## 2. Gates that must close before any installation (B)

| Gate | What closes it | Needs your approval? |
|---|---|---|
| G-1 Privilege normalisation written, reviewed and tested locally | A generated script that, for every table, function and the sequence, revokes API-role grants and re-applies exactly the dump's 35 grants / 10 revokes, plus the `ALTER DEFAULT PRIVILEGES` alignment for the `postgres` role | Review only |
| G-2 Staging read-only inspection | Run the existing `20261112_00_inspect_readonly.sql` / `auth_inspection_request_READONLY_NOT_EXECUTED.sql` **on staging** and a read-only privilege/default-ACL/`rls_auto_enable`/event-trigger query | **Yes** (connects to staging) |
| G-3 Production Auth-side inspection | Same read-only request **on production** for: trigger on `auth.users`, sign-up setting, `cron.job`, publications, event triggers | **Yes** (connects to production) |
| G-4 Restore copy prepared and diffed | A derived file that differs from the export **only by removals** (below), with its own checksum and a line-level diff | No (local) |
| G-5 Proposal A adapted and tested | Real policy names, `MAINTAIN`, other tables (G2, G3 in the gap analysis) | No (local tests) |
| G-6 Decisions on open product questions | Items 2, 3, 5, 6, 12 in section 7 | **Yes** |

## 3. Recommended installation sequence (for a later, approved, staging-only session)

Stop at the first error; never continue on a partial result.

0. **Pre-flight (read-only, staging):** confirm `server_version` is 17.11, `public` is empty, sign-ups disabled, `rls_auto_enable()` and the event trigger exist or not, default ACLs of `postgres` in `public`, `pg_cron`/`vault`/`realtime` state.
1. **Prepare the restore copy** (local): from the unchanged export remove only (a) `CREATE SCHEMA "public"` and the schema owner/comment lines, (b) the 12 `ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"` lines, (c) `rls_auto_enable()` **only if** step 0 shows it already exists. Record the removals and checksum.
2. **Restore** in a single transaction (psql, `ON_ERROR_STOP=1`), as the `postgres` login, against staging only. Expected result: 12 tables, 12 functions (11 if `rls_auto_enable` skipped), 1 sequence, 10 triggers, 35 policies, 25 indexes, 35 constraints.
3. **Privilege normalisation** (G-1 script). Re-run the read-only compare; success criterion: **no difference** in grants, default privileges (postgres role), policies, triggers, functions or indexes against the export (use `schema-export.mjs compare` with a fresh dump of staging).
4. **Rate-limit migrations**, in order: `20261110120000_api_rate_limits.sql`, `20261111090000_api_rate_limits_cleanup_hardening.sql` (they add objects only).
5. **Auth-side objects** (only if G-3 verified them safe): recreate the `auth.users` trigger and, if wanted, the event trigger, from the verified definitions in a separate reviewed file.
6. **Stage 2 remediation on staging**, with the read-only verify script after each: **B** → **C** → **A (adapted)** → the new privilege-tightening proposal for `MAINTAIN`/`TRUNCATE`/`TRIGGER`/`REFERENCES`. Decide G5/G6 items (payments immutability, `service_role` DELETE on `profiles`) before this step.
7. **Application tests against staging only** (staging keys, sign-ups off): role change and user deletion through the API (the two known failures in S1/S8), suspended-admin behaviour, public reads, booking/message submission, rate limiting. The Edge Function stays unactivated until this passes.
8. **Seed** only content, never customer data: services seed must be rewritten for `uuid` ids (the existing one inserts text ids).

Never in this sequence: `install/01`-`14`, `15`, anything in `08 Development/`, data from production, `auth`/`storage` schemas, `pg_cron`.

## 4. Rollback considerations

| Stage | Rollback | Notes |
|---|---|---|
| Restore (steps 1-2) | Transaction rollback if it fails mid-way. After commit: reset/recreate the staging database (staging is disposable and holds no real data), or run a generated `DROP` script in reverse dependency order (policies → triggers → tables with CASCADE → functions → sequence) | Prefer reset; it also clears default-privilege changes |
| Privilege normalisation | Re-run with the previous state captured first (`pg_dump --schema-only` of staging before and after) | The grants are idempotent |
| Rate-limit migrations | `DROP FUNCTION consume_rate_limit/cleanup_expired_rate_limits; DROP TABLE api_rate_limits` (objects are new) | No dependency from the baseline |
| Proposals A, B, C | Existing snapshot-driven rollbacks (`*.rollback.sql`) restore the captured originals; they depend on `public.security_remediation_snapshots`, so do not drop it first | Test rollbacks after the adapted A |
| Auth-side objects | Drop the trigger/event trigger only | Never touches `auth.users` rows |
| Production | **Nothing here modifies production.** B, C and A are staging proposals; production adoption is a separate decision after staging evidence | S1, S3, S5 and S8 describe production today |

## 5. What this recommendation does not authorise

Connecting to production or staging; executing any SQL; creating or editing a Supabase function; activating the Edge Function; changing Auth settings; touching environment variables; committing, pushing or deploying.

## 6. Risks that remain even after the sequence

* **Parity:** production is 17.6, staging 17.11; planner and bug-fix differences are possible.
* **No data:** RLS and trigger behaviour on realistic data volumes and with a real owner profile cannot be tested until a staging owner and test users are created with staging keys.
* **Auth-side behaviour** (Section 2, G-3) is unverified, and Auth session lifetime after suspension is outside the schema.
* **PostgREST role switching** (`current_user = 'service_role'` in B) is only provable on a real Supabase instance.

## 7. Outstanding questions for the owner

1. Is there a trigger on `auth.users` that calls `handle_new_user()`, and are public sign-ups enabled in production? (S15, F9)
2. Should staging reproduce production's current behaviour exactly (including S1, S6, S8), or the intended hardened behaviour? This decides G5/G6 and whether the privilege step copies or improves production.
3. Was `Admins can update payments` (any admin may edit payment rows) intentional? (S6)
4. Is it intentional that inactive services are publicly readable? (S9)
5. Should `service_role` get `DELETE` on `profiles`, or should user deletion go through the Auth admin API and the FK cascade? (S8)
6. Is `purge_archived_bookings()` scheduled in production (`cron.job`)? It is not in this export. Staging stays unscheduled either way.
7. Does any table belong to the `supabase_realtime` publication (omitted by `--no-publications`)?
8. Does a database event trigger call `rls_auto_enable()` in production, and does a fresh staging project already have it?
9. Can you confirm the role-change and user-deletion failures actually occur in production (logs), since they are inferred from the schema and the code?
10. Which staging owner account and test users should be created, and by whom (staging keys only)?
11. Which of `get_event_availability`, `block_event_date`, `unblock_event_date` (unused, ungranted) should be carried to staging at all?
12. Approval to run the read-only inspection queries on staging and on production (G-2, G-3).
