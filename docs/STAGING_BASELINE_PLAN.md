# Staging database baseline plan (dfabulous-staging)

Status: **prepared, nothing executed.** No SQL has been run against staging or production. All validation below ran in an
in-memory PostgreSQL (PGlite 0.5.16, PostgreSQL 18) with no network access.

> **Superseded for the preferred path:** the verified production export route is described in [STAGING_VERIFIED_SCHEMA_REVIEW.md](./STAGING_VERIFIED_SCHEMA_REVIEW.md). The 14-step chain below (step 15 / `pg_cron` is deferred) is the **fallback**, used only if the verified export cannot be obtained.

Target: project `dfabulous-staging`, ref `qwoxxroszmwobnzqgndr`, region `eu-west-1` (identifiers, not secrets).

## 1. Authoritative sources, and what is missing

| Object | Defined in the repository? |
|---|---|
| `permissions`, `user_permissions`, `audit_logs` | Yes: `08 Development/20260902_admin_permissions_migration.sql` |
| `is_admin()`, `is_owner()`, `prevent_role_escalation()` | Yes: `security_remediation_migration.sql` and `20260814_admin_rls_privileges.sql` (two different bodies; see section 3) |
| `bookings.booking_reference`, `completed_at`, `archived_at` | Added by `20260902_booking_references.sql` and `20260916_booking_lifecycle_archive.sql`, but the **table itself is not created anywhere** |
| `profiles`, `bookings`, `messages`, `payments`, `services`, `gallery`, `testimonials`, `site_settings` | **No `CREATE TABLE` anywhere in the repository** |
| `profiles.is_active` | **Defined in no SQL** (the application reads and writes it) |
| `blocked_dates` | Defined only in `20260815_date_availability.sql` with columns the application does not use (see section 3) |
| `bookings_active_event_date_unique` and the date-availability trigger/exclusion (SQLSTATE `23P01`) | Named in `server.ts` and the Edge `public.ts`, **defined in no SQL** |

Consequence: the repository migrations cannot build a database from nothing. The only authoritative schema is the live
production one. **Recommended path:** the owner takes a *schema-only* dump of production (no data; for example
`supabase db dump --schema public --schema-only` or the dashboard's schema export), reviews it for secrets (there should be none), and uses it
in place of step 01. Compare it with this package using `supabase/staging/20261112_schema_compare_readonly.sql`.

**Fallback (prepared):** `supabase/staging/01_base_schema_derived.sql`, built only from what the code and migrations demonstrably use. Every
column is tagged `[E]` evidenced or `[A]` assumed. It is **not authoritative** and contains no data statements.

## 2. Proposed migration order (exact files)

Generated, reviewable copies are in `supabase/staging/install/` (built by `npm run staging:build` from `supabase/staging/manifest.json`; `npm run staging:check` fails if they drift).

| Step | Install file | Source | Notes |
|---|---|---|---|
| 01 | `01_base_schema_derived.sql` | `supabase/staging/01_base_schema_derived.sql` | Skip if you install a verified schema-only dump instead |
| 02 | `02_security_remediation.sql` | `08 Development/security_remediation_migration.sql` | Must precede 03 (conflict A) |
| 03 | `03_admin_rls_privileges.sql` | `20260814_admin_rls_privileges.sql` | Leaves the EXISTS variant of `is_owner()` live |
| 04 | `04_admin_settings_privileges.sql` | `20260815_admin_settings_privileges.sql` | |
| 05 | `05_blocked_dates_policies_excerpt.sql` | `20260815_date_availability.sql` (verbatim excerpt) | Policies/grants only (conflict B) |
| 06 | `06_seed_services.sql` | `20260815_seed_services.sql` | Public marketing content, not customer data |
| 07 | `07_payments_rls_hardening.sql` | `20260818_payments_rls_hardening.sql` | One labelled correction (conflict C) |
| 08 | `08_public_data_access_hardening.sql` | `20260819_public_data_access_hardening.sql` | One labelled correction (conflict C) |
| 09 | `09_submission_service_role_privileges.sql` | `20260819_submission_service_role_privileges.sql` | |
| 10 | `10_admin_permissions_migration.sql` | `20260902_admin_permissions_migration.sql` | Needs `pgcrypto` (available on Supabase) |
| 11 | `11_booking_phone_nullable.sql` | `20260902_booking_phone_nullable.sql` | |
| 12 | `12_booking_references.sql` | `20260902_booking_references.sql` | |
| 13 | `13_booking_lifecycle_archive.sql` | `20260916_booking_lifecycle_archive.sql` | |
| 14 | `14_final_security_hardening.sql` | `20260902_final_security_hardening.sql` | After 03 and 12 so the functions it revokes exist |
| 15 | `deferred/15_booking_archive_purge_cron.sql` | `20260916_booking_archive_purge_cron.sql` | **Deferred, not in the initial sequence**; enables `pg_cron`. Isolated in `install/deferred/` so it cannot be run by accident |

Then, as already documented in `docs/STAGE2_STAGING_VALIDATION.md`: `supabase/proposals/20261112_00_inspect_readonly.sql`, proposals **A**, **B**, optionally **C**, and
`20261112_99_verify_readonly.sql`. Install files 01-14 are not Supabase CLI migrations; paste them into the staging SQL editor in order, one file per run, and stop at the first error. Step 15 (`deferred/`) is not part of the initial run.

## 3. Conflicts and defects found in the repository

| # | Finding | Evidence | Handling |
|---|---|---|---|
| A | **Filename order fails.** `security_remediation_migration.sql` runs after `20260814_*` alphabetically and does `CREATE POLICY "Users view profile"` without dropping it first, so it fails with `42710/already exists`. `20260814` is idempotent, so remediation-first works. | test "filename order fails" | Order 02 then 03. The README also lists remediation first. |
| B | `20260815_date_availability.sql` is unusable: `create_booking_if_available` has a syntax error (`RETURN;` after an `INSERT` without a semicolon) and it creates `blocked_dates(blocked_date, reason)` while the application and live DB use `event_date`/`note`. | test "cannot be applied as written" | Excluded except a verbatim excerpt of its RLS/grants/policies; table created in the live shape in step 01. Both legacy functions are revoked by step 14 and unused by the app. |
| C | **`to_regproc('public.is_admin()')` always returns NULL** (it takes a bare name, not a signature), so the pre-flight checks in `20260818` and `20260819` raise "missing" even when the helpers exist. | test "abort as written" | Mechanical replacement with `to_regprocedure(...)`, recorded in the install-file banner and the manifest. Check how production applied them. The repository files should be fixed in a later change. |
| D | `GET /api/admin/data/settings` reads a table named `settings`; migrations and the write routes use `site_settings`. Staging has no `settings` relation. | server.ts:1654-1690, test "settings vs site_settings" | **Application/schema mismatch, not changed.** Confirm what exists in production; the settings tab may fail on staging. |
| E | `bookings_active_event_date_unique` and the `23P01` availability constraint are not in repository SQL. | server.ts, Edge `public.ts` | Step 01 creates a partial unique index with that name (name evidenced, predicate assumed). Verify against production. |
| F | `profiles.is_active` is defined in no SQL. Proposal C depends on it. | Stage 2 review | Created in step 01 as nullable boolean (NULL counts as active). |
| G | The `pg_cron` extension is required by step 15. | file | **Deferred**: moved to `install/deferred/`, excluded from the initial sequence. Not needed by any application path. |
| H | `bookings.currency` may be absent in some environments (the app retries on `42703`). | server.ts | Present in step 01; verify against production. |
| I | After this order the live `is_owner()` is the **EXISTS** variant (returns `false`, never `NULL`). Production may differ if its history differed. | test "EXISTS variant" | Run query 1 of `20261112_00_inspect_readonly.sql` on production, read-only, to confirm. |
| J | Table-level privileges: `gallery`, `services`, `testimonials`, `permissions` and similar keep Supabase default grants to `anon`/`authenticated` (RLS blocks writes). Only the three identity tables are tightened by proposal A. | catalog inspection | Defence-in-depth gap; low risk. Consider a later review. |

## 4. Validation results (all local, in memory)

| Check | Result |
|---|---|
| `tests/db-staging-baseline.test.mjs` | 28 tests passing |
| All 15 install steps apply in order on an empty platform | pass (pg_cron/pgcrypto extension lines stripped, test-only) |
| Original filename order | fails as predicted (A) |
| Original `20260815_date_availability.sql` | syntax error as predicted (B) |
| Original `20260818`/`20260819` | abort as predicted (C); corrected copies pass |
| RLS enabled on every application table | pass |
| Anonymous: public content only, no private tables, no writes | pass |
| Service-role booking insert, reference assignment, duplicate-date rejection (`23505`, index name) | pass |
| Admin dashboard reads (bookings, profiles, messages, payments, blocked dates, settings) with the API's column lists | pass |
| Archive purge: keeps bookings with payments, writes audit entry, not executable by anon/authenticated | pass |
| Proposals A+B+C apply, verification script passes every check, rollback restores the catalog exactly | pass |
| Schema comparison and inspection scripts are read-only | pass |

The full-suite results (lint, tests, audit, secret scan, builds) are in the final report for this stage.

## 5. Blockers before executing SQL on staging

1. **Decide the base schema:** a verified schema-only dump from production (preferred), or the derived `01_base_schema_derived.sql` (fallback, assumptions listed above).
2. Confirm production's `is_owner()` variant and any sign-up trigger or public sign-up setting (a trigger on `auth.users` that creates profiles is not in the repository).
3. Decide on step 15 (`pg_cron`).
4. Accept or resolve the `settings` / `site_settings` mismatch (D).
5. Staging must use its own Supabase keys. Do not reuse any previously exposed key. Credential rotation remains an open production prerequisite (`docs/SECURITY_ARCHITECTURE.md` section 5).

## 6. Execution checklist (after approval)

1. In the staging project only, confirm the project ref shown in the dashboard is `qwoxxroszmwobnzqgndr`.
2. Run `npm run staging:check` locally; it must say the files are up to date.
3. SQL editor, one file at a time: 01 (or the verified dump), then 02 to 14 (and 15 only if wanted). Stop at the first error and report it.
4. Run `supabase/staging/20261112_schema_compare_readonly.sql`; compare against production's output (owner runs production side, read-only).
5. Run `20261112_00_inspect_readonly.sql`, then apply proposals per `docs/STAGE2_STAGING_VALIDATION.md`, then `20261112_99_verify_readonly.sql`.
6. Rollback: proposals have snapshot-based rollback files. For the baseline itself, the staging project holds no real data: delete and recreate the project, or reset its database from the dashboard.

## 7. Restrictions observed

No production access; no SQL executed against any database other than the in-memory test engine; no environment variables, secrets or keys changed; nothing deployed, committed or pushed; the Edge Function remains inactive.
