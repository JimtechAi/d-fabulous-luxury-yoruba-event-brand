# Staging verified schema review

Prepared 2026-11-11. Production `fbhqegevyvpyzjoslblf`, staging `qwoxxroszmwobnzqgndr`, region `eu-west-1`, PostgreSQL 17 (identifiers, not secrets).

## Headline

**The production schema export has NOT been produced, and I could not produce it.** Producing it requires the production database connection string (the
brief forbids it appearing in any transcript, file or log, so it must be entered by you) and a way to run `pg_dump` (no Docker or `pg_dump` is installed
here). Every deliverable that depends on the real dump is therefore **blocked, not faked**: `production_public_schema.sql`, its checksum, the
generated inventory and validation report, the comparison with the derived schema, and the corrected baseline.

What is done: the export tooling is verified, an owner runbook is written, a static validator/inventory/comparison tool is built and tested, the Auth review is
written from repository evidence, a read-only Auth inspection request is prepared (not run), the migration order is reassessed, and `pg_cron` is removed from the
initial sequence.

## 1. Export command and CLI version

* Supabase CLI **3.1.0**, fetched transiently with `npx supabase@3.1.0` (not added to the project, no `supabase link`, no project config changed). Inspected: `--version`, `db dump --help`, `db diff --help`, and one **local** `db dump --dry-run --schema public` (no database contacted).
* Public-only schema dump **is supported**: `supabase db dump --schema public` produces `pg_dump --schema-only --quote-all-identifier --role postgres --schema=public`, i.e. no data and no role definitions, then strips comments, `\restrict` lines, event triggers, the `supabase_realtime` publication and internal-schema ACLs.
* **Limitations found (these are the exact blockers):**
  1. **No connection string available to me.** In CLI 3.1.0 the target is `--remote[=<ref|branch|url>]`; the older `--db-url`/`--linked` still work but are deprecated. The URL form puts the string on the command line, so you must run it yourself.
  2. **`--remote=<ref>` can create a temporary production login role.** *(Now verified from the CLI v3 migration guide: without `--password` the CLI needs an access token "so the CLI can create a temporary login role".)* It is therefore not used.
  3. **`--dry-run` prints `PGPASSWORD` in clear text**, also for a URL target *(verified with a fake credential on a loopback address)*. It must never be used with the production URL.
  4. **A container runtime is required.** *(Verified: `DockerRunError: docker: command not found (podman also not found)` for both local and URL targets.)* Docker Desktop or Podman is not installed on this machine; `pg_dump` itself runs in the container and is not needed on the host. Installing Docker is your decision.
  5. **`--db-url` is deprecated; use `--remote=<url>`**, and the password goes inside the URL (`--password` fails with a URL).
* **Update (PostgreSQL 17.11 `pg_dump` now installed on the owner's Windows machine):** the preferred route is the native helper `scripts/export-production-schema-native.ps1` (no Docker, no Supabase CLI, Session pooler only, password held only in a run-scoped owner-only pgpass file, never in a URL, command line or environment variable). It supersedes blocker 4 below and avoids the URL-on-command-line exposure of blocker 1. Prepared and statically tested; **not run**. See "Native Windows pg_dump workflow" in `supabase/staging/source/README.md`.
* Command for you to run (full steps in `supabase/staging/source/README.md`; use the helper `scripts/export-production-schema.ps1`, which builds the URL from secure prompts and applies guards, with no environment variable):
  ```powershell
  npx supabase@3.1.0 db dump "--remote=<URL-built-from-prompts>" --schema public --file supabase/staging/source/production_public_schema.sql
  ```

## 2. Exact schema scope

Intended: `public` schema, schema-only. Includes tables, columns, primary/foreign/unique/check constraints, indexes, views, functions/procedures, triggers, RLS enablement and policies, `GRANT`/`REVOKE`, ownership, and the `CREATE EXTENSION` lines for extensions installed into `public`.
Excluded by construction: all rows (no `INSERT`/`COPY`), role definitions and passwords, `auth`, `storage` and every other managed schema, migration history, event triggers, `supabase_admin` default privileges (stripped by the CLI; captured by inspection query A7 instead).

## 3. Export file size and SHA-256

**Not available** (file not produced). `npm run schema:validate` writes `production_public_schema.sha256` and the size into the report when the file exists.

## 4. Object inventory

**Not available for production.** `npm run schema:validate` generates `schema_inventory.md` (tables, columns, constraints, indexes, policies, functions with security mode and search_path, triggers, views, sequences, types, extensions, ownership, grants, revokes and default privileges, plus references to `auth.users`). The tool was exercised on a `pg_dump` of the in-memory proposed baseline (12 tables, 100 columns, 26 policies, 7 functions, 3 triggers), which is not production data.

## 5. Auth custom-object review

See `supabase/staging/source/auth_custom_objects_review.md`. Summary:

| Item | Status |
|---|---|
| `handle_new_user()` and `on_auth_user_created` appear in **no** repository file | **Confirmed absent from the repository** |
| They exist in production | **Unverified**: the names come from the brief |
| How such a function would set `profiles.role` (user metadata vs app metadata) | **Unverified, potentially critical** |
| Public sign-up enabled in production Auth settings | **Unverified** |
| Application creates users with `auth.admin.createUser` then upserts `profiles` | Confirmed (`server.ts`, Edge `admin-users.ts:96`) |
| Auth hooks, custom `auth`/`storage` policies, buckets | Unverified; **no Supabase Storage use anywhere in the code** (confirmed) |

Prepared (not run): `supabase/staging/source/auth_inspection_request_READONLY_NOT_EXECUTED.sql`: one `BEGIN READ ONLY` transaction, 11 catalog-only `SELECT` groups, rolled back; reads no customer data (a test enforces this). **Needs your approval before it is run, by you, on production.**

## 6. Comparison with the derived schema

**The comparison against production cannot be run yet.** The comparator (`npm run schema:compare`) is ready and tested; it reports missing tables, columns, type/default differences, constraints, indexes, function definitions and attributes, triggers, RLS, policies, grants, default privileges, extensions, and objects present only in the derived schema, with renamed-but-identical objects shown separately.

What is already known from the derived file itself (`supabase/staging/01_base_schema_derived.sql`): every column is tagged `[E]` or `[A]`. The **assumed** items that the comparison must confirm or correct:

| Assumption | Where |
|---|---|
| `profiles.created_at/updated_at` exist with `now()` defaults; no FK to `auth.users`; no CHECK on `role` | `profiles` |
| `bookings.booking_amount` precision, `currency` presence, `created_at/updated_at`, and the **partial predicate** of `bookings_active_event_date_unique` (name is evidenced, definition is not) | `bookings` |
| `messages.id` type and timestamps; `payments.id` type, `metadata` default, timestamps; `gallery.id`/`testimonials.id` types, `testimonials.event_date` type | other tables |
| `site_settings.value` is `jsonb` | `site_settings` |
| `blocked_dates.id`, `UNIQUE (event_date)`, `updated_at` | `blocked_dates` |
| Not created, possibly present in production: the date-availability exclusion/trigger (SQLSTATE `23P01`), any `profiles` FK, sign-up trigger, a `settings` relation | whole schema |

The **proposed corrected baseline cannot be written yet**: every change must be traceable to the verified export, and there is none. Once the export validates, it will be generated into `supabase/staging/proposed/` with a per-line change trace; the derived file will not be replaced automatically.

## 7. Migration-order corrections

Reassessment of the 15 steps and the Stage 2 proposals (details in `docs/STAGING_BASELINE_PLAN.md`):

| Topic | Finding | Decision |
|---|---|---|
| Competing `is_owner()`/`is_admin()` | Two bodies (EXISTS returns false; plpgsql returns NULL without `auth.uid()`); order decides which survives. With 02 then 03 the EXISTS variant is live. | **Install production's own definition from the verified export** rather than choose; the comparator flags any difference. |
| Duplicate `"Users view profile"` | `security_remediation_migration.sql` creates it without `DROP POLICY IF EXISTS`; fails after `20260814` (reproduced by a test). | Fallback order: remediation (02) before `20260814` (03). Irrelevant on the export path (one policy). |
| `to_regproc` vs `to_regprocedure` | `to_regproc('public.is_admin()')` always returns NULL, so the `20260818`/`20260819` pre-flights abort even when the functions exist (reproduced). | Fallback: labelled replacement in steps 07/08. The source migration files are **not edited** (they may already be applied). Fix them in a separate reviewed change. |
| `settings` vs `site_settings` | `GET /api/admin/data/settings` queries `settings`; everything else uses `site_settings`. | **Decide from the export** (does `settings` exist as a table or view?) and inspection query A10. Application code not changed. |
| Booking unique index and date-availability constraint | Names referenced by `server.ts` and Edge `public.ts`, defined in no repository SQL. | Taken verbatim from the export; the derived index is a labelled assumption. |
| Sign-up trigger | Not in the repository. | Auth review section 3; verify with A1/A2 before proposals. |
| Payment hardening (step 07) | Needs `is_admin()`/`is_owner()`; defines policies and the ledger-immutability trigger. | On the export path these arrive inside the dump; compare payments policies and the trigger in the comparison. |
| Proposals A, B, C and rollbacks | Snapshot-based; independent of how the base was built; tested against both `is_owner()` variants. C needs `profiles.is_active` and B. | **Unchanged.** Re-run `20261112_00_inspect_readonly.sql` and `99_verify_readonly.sql` on the staging result. Existing rollback files were not modified. |
| `pg_cron` | Step 15 enables `pg_cron` and schedules a job. | **Removed from the initial sequence**: moved to `supabase/staging/install/deferred/`, excluded from the 01-14 directory, enforced by a test. |

## 8. Security and compatibility concerns

1. **Sign-up path (critical unknown)** until A1/A2 and the Auth sign-up setting are checked.
2. **Local tests run on PGlite (PostgreSQL 18.6), staging is PostgreSQL 17.** The SQL used is not 18-specific and the validator rejects 18-only syntax, but results are not a substitute for staging verification.
3. **Ownership and grants.** The dump carries `ALTER ... OWNER TO "postgres"` and `GRANT`s to `anon`, `authenticated`, `service_role`; they must be reviewed in the generated inventory before installation. Default privileges for `supabase_admin` are stripped by the CLI.
4. **Comments are stripped** by the CLI, so object comments are lost (cosmetic).
5. **Re-run behaviour.** The CLI adds `IF NOT EXISTS`/`OR REPLACE` for tables and functions but not policies, so the dump must be installed once into an **empty** staging `public` schema; if it errors, reset the staging public schema (staging holds no data).
6. **Extension dependencies** outside `public` (for example `pgcrypto` in `extensions`) are not in a public-only dump; they are captured by query A8.
7. **Credentials remain unrotated** (Supabase service key, Resend key, Vercel token): a production prerequisite. Staging must use fresh staging keys only.
8. Local-process visibility: with `--remote=<url>` the string is in the argument list of the running process on your machine; run it on a trusted single-user machine.

## 9. Missing evidence and unresolved assumptions

1. The production export itself (blocker).
2. Whether `handle_new_user`/`on_auth_user_created` exist and what they do; the Auth sign-up setting; hooks; storage buckets.
3. Live `is_owner()`/`is_admin()` bodies, the `profiles` DDL, `is_active`, and the booking date constraint.
4. Whether the Supabase CLI 3.1.0 can run `pg_dump` on your machine without Docker.
5. Whether `settings` exists in production.
6. Exact production Postgres minor version (dashboard).

## 10. Recommended staging installation sequence (after the export is validated and you approve)

**Path P (preferred, replaces steps 01-14):**
1. You run the export and `npm run schema:validate` / `schema:compare`; share the validated, schema-only file for review.
2. You approve and run the read-only Auth inspection (A1-A11) and note the Auth dashboard settings.
3. In staging: confirm project ref `qwoxxroszmwobnzqgndr`, PostgreSQL 17, **sign-ups disabled**, fresh staging keys, no `pg_cron`.
4. Install the cleaned dump once into the empty `public` schema (remove only psql meta-lines if present). Optionally run `06_seed_services.sql` for public marketing content.
5. If a safe sign-up trigger exists in production, recreate only it, from its verified definition, in a separate reviewed file.
6. Run `supabase/staging/20261112_schema_compare_readonly.sql` on staging and compare with production's.
7. Run `20261112_00_inspect_readonly.sql`, then proposals A, B and optionally C, then `20261112_99_verify_readonly.sql`, then the application regression from `docs/STAGE2_STAGING_VALIDATION.md`.

**Path F (fallback only, if the export is impossible):** install steps `01` to `14` from `supabase/staging/install/` in order (`pg_cron` step 15 stays deferred), with the base schema still being the derived, non-authoritative one.

## 11. Confirmation of restrictions

* **No SQL was executed** against production or staging (or any database other than the repository's in-memory test engine).
* **Neither Supabase project was modified or contacted.** The only network activity was fetching the CLI package and, for generating a test sample, `@electric-sql/pglite-tools` from the npm registry (installed outside the repository).
* No migration, `db push`, `db reset`, `apply_migration`, `link` or `diff` was run; no environment variable or secret was changed; nothing was committed, pushed, deployed, and the Edge Function is inactive.
* No connection string or credential was requested, stored, printed or written.
* Existing remediation (A/B/C) and rollback files were not modified.

## Files

Created: `scripts/schema-export.mjs`, `scripts/dump-expected-baseline.mjs`, `tests/schema-export.test.mjs`, `supabase/staging/source/README.md`, `supabase/staging/source/auth_custom_objects_review.md`, `supabase/staging/source/auth_inspection_request_READONLY_NOT_EXECUTED.sql`, `supabase/staging/expected/baseline_after_install.pgdump.sql`, `docs/STAGING_VERIFIED_SCHEMA_REVIEW.md`.
Modified: `scripts/build-staging-install.mjs` and `supabase/staging/manifest.json` (deferred step), `supabase/staging/install/` (step 15 moved to `deferred/`), `tests/db-staging-baseline.test.mjs`, `package.json` (`schema:validate`, `schema:compare`), `docs/STAGING_BASELINE_PLAN.md`.
**Not created because they depend on the real export:** `supabase/staging/source/production_public_schema.sql`, `production_public_schema.sha256`, `schema_inventory.md`, `schema_validation_report.md`, `schema_comparison.md`, `supabase/staging/proposed/`.
