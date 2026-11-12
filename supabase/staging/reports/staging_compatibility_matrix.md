# Staging compatibility matrix

Staging project: `dfabulous-staging` (`qwoxxroszmwobnzqgndr`), PostgreSQL 17.11 (as stated by the owner; **not verified by me**: no staging connection was made). Production export: PostgreSQL 17.6 (a restore from an older minor into a newer minor is supported; the minor skew is recorded as a parity risk).
Source of truth for this matrix: `supabase/staging/source/production_public_schema.sql` (SHA-256 `f41bf2fe…8f2ad50`), `supabase/staging/reports/production_schema_inventory.json`, and `node scripts/schema-export.mjs compare` against `supabase/staging/expected/baseline_after_install.pgdump.sql` (227 differences: 114 in production only, 47 in the install only, 55 different, 11 renamed). Nothing was executed.

## 1. Can the export be restored as it is? (statement-level)

| Export element | Dump line | Problem on a fresh Supabase project | Handling |
|---|---|---|---|
| `CREATE SCHEMA "public";` | 25 | `public` already exists (42P06) | Remove from the restore copy |
| `ALTER SCHEMA public OWNER TO pg_database_owner`, `COMMENT ON SCHEMA` | 28-34 | Already the case; harmless | Keep or remove |
| `CREATE FUNCTION public.rls_auto_enable()` | 355 | A fresh project may already ship this function (42723) | **Inspect first**; if present, skip it |
| 12 functions, 12 tables, 1 sequence, 10 triggers, 35 policies, 25 indexes, 35 constraints | n/a | No conflicts expected in an empty `public` schema; FKs to `auth.users` and `auth.uid()` resolve because Supabase provides `auth` | Restore as written (transaction, stop on first error) |
| Object `GRANT`/`REVOKE` (35 grants, 10 revokes) | 1485-1657 | **Additive** over Supabase default privileges (S7): staging would be **more** open than production | Add a privilege-normalisation step (not yet written) |
| `ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" …` (12 statements) | 1671-1711 | The `postgres` login is unlikely to be allowed to change another role's defaults (permission denied) and they equal Supabase's own defaults anyway | Exclude from the restore copy |
| `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" …` (6 statements) | 1664-1701 | Allowed, but they narrow nothing: they only **add** to a fresh project's defaults | Replace by explicit `REVOKE` defaults in the normalisation step |
| `SET transaction_timeout = 0` | 12 | Valid on PostgreSQL 17 | Keep |
| `\restrict` meta-commands | none | n/a | none |

## 2. Object-level compatibility with the repository

| Area | Production (export) | Repository expectation (install 01-14) | Verdict |
|---|---|---|---|
| `blocked_dates` | PK `event_date`; no `id`, no `updated_at`; FK `created_by → auth.users` | derived: PK `id`, `UNIQUE(event_date)`, `updated_at` | Repository **wrong**; export wins |
| `services.id` | `uuid DEFAULT gen_random_uuid()` | `text NOT NULL` | Repository **wrong**; the seed (step 06) inserts text slugs into `id` → `22P02` on production's shape |
| `site_settings` | PK `id uuid`, `UNIQUE(key)`, `description`, `updated_by → profiles`, `updated_at` | PK `key` | Repository **wrong** |
| `profiles` | 7 columns incl. `is_active boolean NOT NULL DEFAULT true`, `role` CHECK in (owner, admin, staff, user), FK `id → auth.users ON DELETE CASCADE`, default role `staff` | no FK, no CHECK, no `is_active` | Repository **incomplete** |
| `bookings` | 18 columns incl. `user_id → profiles`, `booking_reference`, `completed_at`, `archived_at`; partial unique index on `lower(coalesce(status,''))` | no `user_id`; partial index on plain `status` | Repository **differs** (index predicate and column) |
| `payments` | 16 columns, 5 CHECK constraints, `UNIQUE(gateway_reference)`, 4 indexes, FKs to `bookings` (CASCADE) and `profiles` | fewer constraints/indexes | Repository **incomplete** |
| `messages`, `gallery`, `testimonials`, `services` timestamps | `created_at`/`updated_at` present, `updated_at` triggers | missing | Repository **incomplete** |
| `audit_logs`, `permissions`, `user_permissions` | FKs to `profiles`; `audit_logs_read_active_owner`, `permissions_read_active_owner_admin`, `user_permissions_manage_active_owner_admin` | policies named `*_owner_admin` without active check; audit INSERT policy | Repository would **regress** production (S2, S3) |
| Payments immutability trigger / owner-only update-delete policies | **absent** | present (step 07) | Repository would **change** production semantics (S6) |
| `user_has_permission()` / `user_has_any_permission()` | **absent** | present (step 10) | Application does not call them (no `.rpc` use outside `consume_rate_limit`) |
| Booking reference trigger | `trigger_generate_booking_reference` → `generate_booking_reference()` (INVOKER) | `trg_assign_booking_reference` → `assign_booking_reference()` | **Duplicate trigger risk** if step 12 ran after a restore |
| Updated-at triggers | 8 `trg_*_updated_at` on bookings, gallery, messages, profiles, services, site_settings, testimonials | partly | export wins |
| `purge_archived_bookings()` | present, EXECUTE `service_role` only; **no** `pg_cron` job in the dump (cron lives outside `public`) | step 15 (deferred) creates function **and** schedules | Function arrives with the restore; scheduling stays excluded |
| `get_event_availability`, `block_event_date`, `unblock_event_date` | present, no API-role EXECUTE (dead code for the app) | different functions (`get_unavailable_dates`, `create_booking_if_available`) | Repository names **absent** from production |
| `handle_new_user()` | present; trigger on `auth.users` **not in the dump** | absent | See dependencies |
| `api_rate_limits`, `consume_rate_limit()`, `cleanup_expired_rate_limits()` | **absent** | `supabase/migrations/20261110120000…` and `…20261111090000…` | Needed by the Edge Function; apply **after** the restore |
| `is_owner()` / `is_admin()` | EXISTS variant, returns `false` without `auth.uid()`; `SET search_path = public, pg_temp` | two competing bodies | Matches the "EXISTS" (03) variant |

## 3. Repository files after a complete schema restore

| File | Status | Why |
|---|---|---|
| `supabase/staging/01_base_schema_derived.sql`, `install/01_base_schema_derived.sql` | **MUST NOT RUN** | Wrong shapes (above); every `CREATE TABLE` collides |
| `install/02_security_remediation.sql` | **MUST NOT RUN** | `CREATE POLICY "Users view profile"` already exists (42710); redefines `is_admin`/`is_owner`/`prevent_role_escalation` back to the NULL variant; contains the hard-coded owner e-mail `UPDATE` |
| `install/03_admin_rls_privileges.sql` | **MUST NOT RUN** | Drops/recreates policies with different names and grants; would add duplicate/looser policies |
| `install/04_admin_settings_privileges.sql` | **MUST NOT RUN** | Re-creates `site_settings` policies that already exist under other names |
| `install/05_blocked_dates_policies_excerpt.sql` | **MUST NOT RUN** | Re-creates `blocked_dates` policies with different predicates (production inserts require `created_by = auth.uid()`) |
| `install/06_seed_services.sql` | **MUST NOT RUN as is** | Inserts text ids into a `uuid` column |
| `install/07_payments_rls_hardening.sql` | **MUST NOT RUN** | Adds owner policies and an immutability trigger production never had; mixing with `Admins can update payments` gives a hybrid nobody reviewed |
| `install/08_public_data_access_hardening.sql` | **MUST NOT RUN** | Drops policies such as `Public read services`; production's current state is the target |
| `install/09_submission_service_role_privileges.sql` | Redundant | Production already grants INSERT to `service_role` |
| `install/10_admin_permissions_migration.sql` | **MUST NOT RUN** | Re-introduces `*_owner_admin` policies (S2, S3 regress), audit INSERT policy, `user_has_*` functions |
| `install/11_booking_phone_nullable.sql` | Redundant | `phone` is already nullable (dump 477) |
| `install/12_booking_references.sql` | **MUST NOT RUN** | Adds a second booking-reference trigger |
| `install/13_booking_lifecycle_archive.sql` | Redundant | `completed_at`, `archived_at` already exist |
| `install/14_final_security_hardening.sql` | **MUST NOT RUN** | Revokes against functions/objects that differ; would be applied on a different baseline |
| `install/deferred/15_booking_archive_purge_cron.sql` | **EXCLUDED** | Needs `pg_cron`; the function already exists |
| `08 Development/*.sql` (all) | **MUST NOT RUN** | Historical sources of the above |
| `supabase/migrations/20261110120000_api_rate_limits.sql` | **Apply after restore** | New objects only; no conflict with the dump |
| `supabase/migrations/20261111090000_api_rate_limits_cleanup_hardening.sql` | **Apply after restore, after the first** | Depends on the first file |
| `supabase/proposals/…_b_role_trigger_allow_service_role.sql` | **Apply (staging) after restore + normalisation** | Preflight objects exist; fixes S1; first of the three |
| `supabase/proposals/…_c_rls_helpers_require_active.sql` | **Apply (staging) after B** | `is_active` exists, B detected by `service_role` in the function body |
| `supabase/proposals/…_a_restrict_direct_identity_writes.sql` | **Adapt first** | Wrong policy name (G2); misses `MAINTAIN` and non-identity tables (G3) |
| `supabase/proposals/…_00_inspect_readonly.sql`, `…_99_verify_readonly.sql`, `supabase/staging/20261112_schema_compare_readonly.sql` | Usable (read-only); verify script needs updating for the real policy names | n/a |
| `supabase/staging/expected/baseline_after_install.pgdump.sql` | **Superseded** | Represents the wrong install; the comparator's "expected" side should become a dump of staging after the real restore |

## 4. Supabase dependencies (classification)

Legend: **1** required in staging · **2** requires separate configuration · **3** exclude initially · **4** requires further investigation.

| Dependency | Where | Class | Notes |
|---|---|---|---|
| `auth.users` table | FKs `profiles_id_fkey` (CASCADE), `blocked_dates_created_by_fkey` (SET NULL) | **1** | Present in every project; **never copy rows** |
| `auth.uid()` | `is_admin`, `is_owner`, `block_event_date`, 8+ policies | **1** | Provided by Supabase |
| Roles `anon`, `authenticated`, `service_role`, `postgres`, `pg_database_owner` | grants, policies, owners | **1** | Exist on every project; privilege **state** needs normalisation (S7) |
| Role `supabase_admin` | default-privilege statements only | **3** | Exclude those statements from the restore |
| Trigger on `auth.users` calling `handle_new_user()` | outside the dump | **4** | Needs the read-only inspection query (not run); sign-ups must be disabled on staging meanwhile |
| Event trigger for `rls_auto_enable()` | outside the dump | **4** | May already exist on a fresh project |
| Extensions in `public` | none | n/a | `gen_random_uuid()` and `pg_catalog` functions are built in |
| Storage (`storage.*`) | none referenced | **3** | Application uses no Storage |
| Realtime publication | omitted by `--no-publications` | **4** | Confirm whether any table is in `supabase_realtime`; application uses none |
| Vault (`vault.*`) | none referenced | **3** | n/a |
| pg_cron (`cron.*`) | `purge_archived_bookings()` is the job body only | **3** | **Do not activate**; schedule absent from the dump |
| Edge Function `dfabulous-api` | consumes `consume_rate_limit`, `profiles`, `user_permissions`, … | **2** | Exists in the repository; **not activated**; staging secrets are separate configuration |
| Auth settings (sign-ups, hooks, JWT, SMTP) | dashboard | **2** | Disable sign-ups on staging before any test |

## 5. Application privilege check against the export (service key and caller token)

| Operation (code) | Required privilege | Production grant | Result |
|---|---|---|---|
| blocked dates select/insert/delete (`server.ts` 746, 1807, 1833) | `service_role` S/I/D on `blocked_dates` | S,I,D,U | OK |
| site settings read/insert/update | `service_role` S/I/U | S,I,U | OK |
| services/gallery/testimonials read | `service_role` SELECT | S, S, S | OK |
| bookings insert/select/update | `service_role` | S,I,U | OK (delete uses the caller token and `Admins delete bookings`, also OK) |
| payments insert/select | `service_role` | S,I,U | OK |
| profiles upsert (create user) | `service_role` I,U | S,I,U | OK |
| profiles **delete** (`server.ts` 2257) | `service_role` DELETE | **none** | **Fails** (S8) |
| profiles **role update** (`server.ts` ~2115) | trigger must pass | blocked by `prevent_role_escalation` | **Fails** (S1) |
| `user_permissions` upsert/delete | `service_role` | ALL | OK |
| `audit_logs` insert | `service_role` | ALL | OK |
| `consume_rate_limit` RPC | EXECUTE + table | **object absent** | Needs the two migrations |
