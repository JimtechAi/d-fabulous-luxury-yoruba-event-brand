# Staging: production schema forensic review (Stage 3)

Prepared 2026-11-11. **Local static analysis only.** No database (production or staging) was contacted, no SQL was executed, no migration was run, nothing was changed in Supabase, no environment variable was touched, nothing was committed, pushed or deployed.

| Item | Value |
|---|---|
| Source | `supabase/staging/source/production_public_schema.sql` (kept unchanged) |
| SHA-256 | `f41bf2fee49c315b0b6806552f512960381c635907cc88a73004b1f708f2ad50`, **verified equal to the expected value** |
| Size | 52,351 bytes, 1,718 lines |
| Origin | `pg_dump 17.11 --schema-only --schema=public` of a **PostgreSQL 17.6** server |
| Static validator | `npm run schema:validate`: 13 checks, no FAIL (no data, credentials, roles, managed schemas or `pg_cron`) |
| Companion reports | `supabase/staging/reports/`: `production_schema_inventory.json` (machine-readable inventory), `staging_compatibility_matrix.md`, `staging_installation_recommendation.md`, `staging_security_gap_analysis.md` |
| Reproduce the inventory | `node scripts/generate-production-inventory.mjs` (read-only; deterministic) |

## 1. Executive summary

**Readiness decision: A. READY FOR STAGING INSTALLATION PREPARATION.** It is not ready for the installation itself (class B): see section 11.

1. The export describes **12 tables, 110 columns, 35 constraints, 25 indexes, 12 functions, 10 triggers, 35 RLS policies, 1 sequence, 35 grants, 10 revokes, 18 default-privilege statements**. RLS is enabled on all 12 tables; none is forced. No extension, view, type, role, data or credential is in the file.
2. **The repository's staging install (steps 01-14) does not reproduce production.** The comparator finds 227 differences (114 only in production, 47 only in the install, 55 different, 11 renamed). The derived base schema is wrong in several places (`blocked_dates`, `services.id`, `site_settings`, `profiles`, `bookings`). **No install step may be run after a restore**, and the services seed would fail on production's `uuid` ids.
3. **A verbatim restore would be more open than production** (privileges are additive over Supabase defaults), so a privilege-normalisation step must be written before installation (S7 / G1).
4. **Security picture of production** (details in `staging_security_gap_analysis.md`): the live `is_owner()` is the EXISTS variant, so the role-change trigger **blocks the service key**; any active admin can write `user_permissions` directly; helpers ignore suspension in 26 of 30 helper-based policies; `authenticated` holds `TRUNCATE/TRIGGER/REFERENCES/MAINTAIN` on every table; payments are editable by any admin; `service_role` cannot delete profiles.
5. **Stage 2 remediation compatibility:** `profiles.is_active` exists (the earlier "defined nowhere" claim is superseded). **B and C fit** the real schema (B first). **A must be adapted**: its policy name does not exist in production and it neither revokes `MAINTAIN` nor covers the other tables.
6. **Unknowns that a public-only dump cannot answer** and that need your approval to inspect read-only: the `auth.users` trigger and sign-up setting, the event trigger for `rls_auto_enable()`, `cron.job`, publications, staging's default privileges.

## 2. REVIEW 1: tables, columns, keys

Every column, type, nullability, default and constraint is in the JSON (`tables`, `constraints`). Summary (NN = NOT NULL; no identity or generated columns exist):

| Table | Cols | Key facts |
|---|---|---|
| `audit_logs` | 6 | PK `id uuid`; `actor_user_id`, `target_user_id` → `profiles` (SET NULL); `metadata jsonb NN '{}'` |
| `blocked_dates` | 4 | **PK `event_date date`** (no `id`); `created_by` → `auth.users` (SET NULL) |
| `bookings` | 18 | PK `id`; `user_id` → `profiles` (SET NULL); `status text NN 'pending'` **no CHECK**; `booking_amount numeric NN 0` CHECK ≥ 0; `currency 'GBP'`; `booking_reference`; `completed_at`, `archived_at`; `phone` nullable |
| `gallery` | 11 | PK `id`; presentation fields; no FKs |
| `messages` | 10 | PK `id`; `user_id` → `profiles` (SET NULL); `status NN 'unread'` no CHECK |
| `payments` | 16 | PK `id`; `booking_id NN` → `bookings` (**CASCADE**); `user_id` → `profiles` (SET NULL); `amount numeric(12,2)` CHECK > 0; CHECKs on `currency`, `payment_type`, `provider`, `status`; `UNIQUE(gateway_reference)` |
| `permissions` | 4 | PK `id`; `UNIQUE(permission_key)` |
| `profiles` | 7 | PK `id` → `auth.users` (**CASCADE**); `role NN 'staff'` CHECK in (owner, admin, staff, user); **`is_active boolean NN true`**; `email` nullable, not unique |
| `services` | 12 | PK `id uuid`; `UNIQUE(slug)`; `is_active NN true` |
| `site_settings` | 6 | PK `id uuid`; `UNIQUE(key)`; `updated_by` → `profiles` (SET NULL) |
| `testimonials` | 12 | PK `id`; `rating NN 5`; `is_placeholder` |
| `user_permissions` | 4 | PK `id`; `UNIQUE(user_id, permission_key)`; `user_id` → `profiles` (CASCADE); `permission_key` → `permissions(permission_key)` (CASCADE) |

Constraints: 12 PK, 11 FK, 5 UNIQUE, 7 CHECK. Sequence: `booking_reference_seq` (no `OWNED BY`; used by `generate_booking_reference()` only).

**Dependencies / relationships**
* Missing dependencies inside `public`: none; every FK target, trigger function and sequence is defined in the file.
* External: `auth.users` (2 FKs) and `auth.uid()` (policies, `is_admin`, `is_owner`, `block_event_date`).
* Observations: `payments → bookings` cascades, so deleting a booking deletes its payments (the purge function guards against it, direct deletes do not); `bookings.status`/`messages.status` have no CHECK; `profiles.email` is not unique; `handle_new_user()` has no trigger in the public dump.

## 3. REVIEW 2: indexes (25 explicit indexes, plus 17 constraint-backed: 12 PK and 5 UNIQUE)

| Class | Indexes |
|---|---|
| Primary-key (12, constraint-backed) | all `*_pkey`, including `blocked_dates_pkey (event_date)` |
| Unique constraints (5, constraint-backed) | `payments_gateway_reference_key`, `permissions_permission_key_key`, `services_slug_key`, `site_settings_key_key`, `user_permissions_user_permission_key_unique` |
| Unique **partial** (2) | `bookings_active_event_date_unique (event_date) WHERE lower(coalesce(status,'')) IN ('pending','confirmed')` (one active booking per date), `bookings_booking_reference_unique (booking_reference) WHERE NOT NULL` |
| Partial (1, non-unique) | `bookings_archived_at_idx (archived_at) WHERE archived_at IS NOT NULL` |
| Functional | none as indexes (the active-date predicate uses `lower()`, which is why the repository's plain-`status` predicate differs) |
| Foreign-key supporting | `payments_booking_id_idx`, `payments_user_id_idx`, `idx_audit_logs_actor_user_id`, `idx_audit_logs_target_user_id`, `idx_user_permissions_permission_key`, `idx_user_permissions_user_id` |
| Other secondary | `idx_bookings_email/event_date/status`, `idx_messages_email/status`, `idx_gallery_category/display_order`, `idx_services_category`, `idx_testimonials_display_order`, `idx_profiles_role`, `payments_created_at_idx`, `payments_status_idx`, `idx_audit_logs_created_at` |
| **Redundant** | `blocked_dates_event_date_idx` (= PK), `idx_services_slug` (= `services_slug_key`), `idx_site_settings_key` (= `site_settings_key_key`), `idx_user_permissions_user_id` (leading column of the unique key) |
| **FKs without a leading index** | `bookings.user_id`, `messages.user_id`, `site_settings.updated_by`, `blocked_dates.created_by` |

None of this blocks staging; the redundancy is cosmetic and should be reproduced faithfully, not "fixed", during restore.

## 4. REVIEW 3: functions (12)

All owned by `postgres`. "Exec" = roles granted EXECUTE after `REVOKE ALL … FROM PUBLIC`.

| Function | Returns / lang | Security | search_path | Exec | Depends on | Notes |
|---|---|---|---|---|---|---|
| `is_admin()` | boolean / plpgsql | DEFINER | `public, pg_temp` | authenticated | `profiles`, `auth.uid()` | role ∈ (admin, owner); **ignores `is_active`** |
| `is_owner()` | boolean / plpgsql | DEFINER | `public, pg_temp` | authenticated | `profiles`, `auth.uid()` | **EXISTS variant**: `false` when no `auth.uid()`; ignores `is_active` |
| `prevent_role_escalation()` | trigger / plpgsql | DEFINER | `public, pg_temp` | none | `is_owner()` | Blocks any role change unless `is_owner()`; therefore blocks `service_role` (S1) |
| `handle_new_user()` | trigger / plpgsql | DEFINER | `public` | none | `profiles` | Inserts `id, email, full_name` from metadata and **fixed role `'user'`**; `ON CONFLICT (id) DO NOTHING`; trigger not in dump |
| `prevent_booking_on_blocked_date()` | trigger / plpgsql | DEFINER | `public` | none | `blocked_dates` | Rejects pending/confirmed booking on a blocked date |
| `generate_booking_reference()` | trigger / plpgsql | INVOKER | `public` | PUBLIC (default) | `booking_reference_seq` | `DF-0001` style |
| `update_updated_at_column()` | trigger / plpgsql | INVOKER | `public` | PUBLIC (default) | none | `timezone('utc', now())` |
| `block_event_date(date, text)` | boolean / plpgsql | DEFINER | `public` | none | `bookings`, `blocked_dates`, `auth.uid()` | **No caller authorisation inside**; dead code today |
| `unblock_event_date(date)` | boolean / plpgsql | DEFINER | `public` | none | `blocked_dates` | Same warning |
| `get_event_availability(date, date)` | table / sql, STABLE | DEFINER | `public` | none | `blocked_dates`, `bookings` | Dead code today |
| `purge_archived_bookings()` | integer / plpgsql | DEFINER | `''` (fully qualified) | service_role | `bookings`, `payments`, `audit_logs` | Deletes archived bookings older than 6 months that have no payments; writes an audit row; per-row exception handler. **Destructive; not scheduled in the dump** |
| `rls_auto_enable()` | event_trigger / plpgsql | DEFINER | `pg_catalog` | none | event-trigger context | The event trigger itself is not in a public-only dump |

Focus items: `is_owner()` / `is_admin()` ✔ strict boolean, safe search_path, **missing suspension check**; `prevent_role_escalation()` ✔ fails closed but **too closed** for the API; `handle_new_user()` ✔ cannot escalate via metadata; `prevent_booking_on_blocked_date()` ✔ consistent with the partial unique index. Concerns: S1, S3, S10, S11 in the gap analysis.

## 5. REVIEW 4: triggers (10)

| Table | Trigger | Timing / event | Function |
|---|---|---|---|
| `bookings` | `prevent_booking_on_blocked_date_trigger` | BEFORE INSERT OR UPDATE OF `event_date`, `status`, row | `prevent_booking_on_blocked_date()` |
| `bookings` | `trigger_generate_booking_reference` | BEFORE INSERT, row | `generate_booking_reference()` |
| `bookings`, `gallery`, `messages`, `profiles`, `services`, `site_settings`, `testimonials` | `trg_<table>_updated_at` (7) | BEFORE UPDATE, row | `update_updated_at_column()` |
| `profiles` | `trg_prevent_role_escalation` | BEFORE UPDATE, row | `prevent_role_escalation()` |

* Missing functions: **none**. Duplicate trigger definitions: **none**. `payments`, `audit_logs`, `permissions`, `user_permissions`, `blocked_dates` have no triggers (so **no payments immutability guard**).
* Trigger order on `bookings` UPDATE: alphabetical (`prevent_booking_on_blocked_date_trigger`, `trg_bookings_updated_at`). On INSERT only the reference trigger and the blocked-date check run.
* Outside the file: the trigger on `auth.users` (expected name `on_auth_user_created`) and the database event trigger for `rls_auto_enable()`.

## 6. REVIEW 5: row level security

RLS **enabled** on all 12 tables; **FORCE** on none. 35 permissive policies, 0 restrictive.

| Table | Policies (command → roles) | Observations |
|---|---|---|
| `profiles` (5) | `Users can view their own profile` S→authenticated; `Users view profile` S→authenticated (own or admin); `Admins can view all profiles` S; `Users update profile` U (own or admin); `Admins can update profiles` U | **No INSERT/DELETE policy** (service key only). Self-update and admin-update of any column except `role` (S4) |
| `user_permissions` (1) | `user_permissions_manage_active_owner_admin` ALL → authenticated (active owner/admin) | Direct writes allowed to active admins (S2) |
| `permissions` (1) | `permissions_read_active_owner_admin` S | No write policy |
| `audit_logs` (1) | `audit_logs_read_active_owner` S (active owner) | No write policy |
| `bookings` (7) | `Users can view their own bookings` S; `Admins can view all bookings`, `Admins read bookings` S (duplicate); `Admins can update bookings`, `Admins modify bookings`, `Admins update bookings` U (identical ×3); `Admins delete bookings` D (**active** admin) | No INSERT policy (service key) |
| `payments` (4) | `Users can view their own payments` S; `Admins can view all payments` S; `Admins can insert payments` I; `Admins can update payments` U | **No DELETE policy; any admin can update** (S6) |
| `messages` (2) | `Admins read messages` S; `Admins update messages` U | `authenticated` has INSERT privilege but no policy |
| `blocked_dates` (5) | `Public can view blocked dates` S→authenticated, anon; `Admins read/insert/update/delete blocked dates`; insert requires `created_by = auth.uid()` | The `anon` policy is inert: `anon` has no table privilege |
| `services` (3) | `Public read services` S→public (**USING true**, S9); `Admin write services` ALL; `Admins manage services` ALL (duplicates) | |
| `site_settings` (4) | `Admins manage site settings` ALL; `Admins read/insert/update site_settings` | Overlapping; admin-only |
| `gallery` (1), `testimonials` (1) | `Admins manage gallery` / `Admins manage testimonials` ALL | **No public read policy**: public content is served through the service key |

Comparison with the earlier security review: see gap analysis section 3 (F1 narrowed, F2 mitigated, F3/F4/F5 confirmed, F7 different, `is_active` exists).

## 7. REVIEW 6: grants and default privileges

Full structured list in the JSON (`grants`, `revokes`, `defaultPrivileges`). Statement counts: 35 GRANT, 10 REVOKE, 18 ALTER DEFAULT PRIVILEGES (6 for `postgres`, 12 for `supabase_admin`).

* **Schema:** USAGE to `postgres`, `anon`, `authenticated`, `service_role`.
* **`anon`:** SELECT + `REFERENCES, TRIGGER, TRUNCATE, MAINTAIN` on `services`; `SELECT, USAGE` on `booking_reference_seq`; nothing else. No function EXECUTE.
* **`authenticated`:** `ALL` on `blocked_dates`, `bookings`, `payments`, `profiles`, `user_permissions`; `SELECT, REFERENCES, TRIGGER, TRUNCATE, MAINTAIN` on `audit_logs`, `permissions`; `INSERT, UPDATE` + same on `messages`, `services`; `SELECT, INSERT, UPDATE` on `site_settings`; only `REFERENCES, TRIGGER, TRUNCATE, MAINTAIN` on `gallery`, `testimonials`; `USAGE, SELECT` on the sequence; EXECUTE on `is_admin()`, `is_owner()` only.
* **`service_role`:** `ALL` on `audit_logs`, `permissions`, `user_permissions`; `SELECT, INSERT, UPDATE` on `bookings`, `messages`, `payments`, `profiles`, `site_settings`; `SELECT, INSERT, DELETE, UPDATE` on `blocked_dates`, `services`; `SELECT` + maintenance on `gallery`, `testimonials`; EXECUTE on `purge_archived_bookings()` only.
* **Default privileges:** for `postgres` in `public`: tables → `postgres` ALL, API roles only `REFERENCES, TRIGGER, TRUNCATE, MAINTAIN`; functions and sequences → `postgres` only. For `supabase_admin`: `ALL` to `postgres, anon, authenticated, service_role` on tables, functions and sequences.

**Differences that would create security drift in a new staging project** (none executed): (1) restore is **additive**, so `anon`/`authenticated`/`service_role` keep their Supabase default `ALL` on every table and EXECUTE on every function (S7); (2) `postgres`'s tightened default privileges would not be reproduced because the dump only **grants** them; (3) the `supabase_admin` defaults are Supabase's own and should not be restored; (4) `service_role` lacks `DELETE` on `profiles` in production but would have it on staging, hiding S8; (5) `anon`'s inert policies on `blocked_dates` would become effective if table privileges were widened.

## 8. REVIEW 7: Supabase dependencies

Classification table: `staging_compatibility_matrix.md` section 4. In short: `auth.users`, `auth.uid()` and the three API roles are **required in staging** (class 1); Edge Function and Auth settings **need separate configuration** (2); Storage, Vault, `pg_cron`, `supabase_admin` default privileges are **excluded initially** (3); the `auth.users` trigger, the event trigger and Realtime publications **need investigation** (4). `pg_cron` is not activated by anything here.

## 9. REVIEW 8: staging compatibility and migration conflicts

* **Statement-level restore issues** (matrix section 1): `CREATE SCHEMA public` (exists), possible existing `rls_auto_enable()`, `supabase_admin` default-privilege statements, and the additive-privilege problem.
* **Duplicate object creation** if install steps ran after a restore: all 9 base tables, `is_admin`/`is_owner`/`prevent_role_escalation` (redefined to different bodies), booking-reference trigger (second one), policies with identical or near-identical names.
* **Conflicting policies:** step 02 `CREATE POLICY "Users view profile"` (42710); steps 03/04/05/07/08/10 drop, recreate or add policies that differ from production's (e.g. `*_owner_admin` versus production's `*_active_owner_admin`).
* **Missing base tables / columns versus the install:** none missing in production; the **install** lacks 12 production columns, 7 CHECKs, 3 UNIQUE constraints, 5 FKs, 17 indexes, 15 policies, 9 triggers and 9 functions (compare report). Repository objects **absent from production:** `blocked_dates.id/updated_at`, `payments` owner policies and immutability trigger, `user_has_*()` functions, `assign_booking_reference()`, `audit_logs` INSERT policy.
* **Migration ordering:** after the restore, only the two `supabase/migrations/*` files are applicable (in file order), then proposals B → C → A (adapted).
* **Must not be executed after a complete restore:** `install/01`-`14`, `deferred/15`, everything in `08 Development/`, `supabase/staging/01_base_schema_derived.sql`. File-by-file reasons: matrix section 3.

## 10. REVIEW 9: Stage 2 remediations A, B, C against the actual schema

| Question | Answer | Evidence |
|---|---|---|
| Does `profiles.is_active` exist? | **Yes**: `boolean NOT NULL DEFAULT true` | dump 594 |
| Is `is_owner()` the expected variant? | It is the **EXISTS variant** (false when `auth.uid()` is NULL), i.e. variant (b) that makes the trigger reject `service_role` | dump 199-214 |
| Can the role trigger safely support service-role operations? | **Not today.** After **B** (`current_user = 'service_role'` short-circuit, SECURITY INVOKER, `is_owner() IS NOT TRUE` for everyone else): logically correct for this schema; its preflight objects exist (function, `is_owner()`, trigger). Needs a real-Supabase test of PostgREST role switching. Side effect: any service-key holder can assign any role (trust boundary) | gap G4 |
| Do authenticated users keep only intended privileges? | **No, even after A.** A covers four tables and leaves `MAINTAIN`; `TRUNCATE/TRIGGER/REFERENCES` remain on 7 other tables (`blocked_dates`, `bookings`, `gallery`, `messages`, `payments`, `services`, `testimonials`); `ALL` on `bookings`, `payments`, `blocked_dates` remains by design (RLS-guarded) | S5, G3 |
| Are owner-only permissions protected? | **Not today** (any active admin can write `user_permissions`). After A: direct writes blocked for all browser roles by RESTRICTIVE policies and REVOKE, even though A's step 1a does not find the real policy name. Owner-only rules then live only in the API | S2, G2 |
| Can inactive administrators be restricted? | **Yes with C**, whose preflight passes (column exists; B detected by `service_role` in the function body). C's payments-guard side effect is moot (no such trigger). Residual: Auth session not ended | S3, G7 |
| Are signup-trigger dependencies satisfied? | The function's dependencies are satisfied (`profiles(id,email,full_name,role)` exist; `'user'` is allowed by the CHECK; `ON CONFLICT (id)` matches the PK; EXECUTE is not needed at trigger fire time). Whether the trigger exists is **unknown**; if it does, the app's later `upsert` that sets a role would hit S1 | S15 |

These conclusions come from reading the real schema, not from the proposals' local tests.

## 11. Findings consolidated

* Security: S1-S17 and G1-G8 in `staging_security_gap_analysis.md` (3 High, 5 Medium, the rest Low/Info).
* Compatibility: matrix sections 1-5.
* Recommended installation sequence, rollback and outstanding questions: `staging_installation_recommendation.md` sections 3, 4, 7.

## 12. Explicit readiness decision

**A. READY FOR STAGING INSTALLATION PREPARATION.**

Not B, because these gates are open: privilege normalisation unwritten (G-1), staging and production read-only inspections not approved or run (G-2, G-3), restore copy not prepared (G-4), proposal A not adapted (G-5), owner decisions pending (G-6). Not C, because none of them is a defect of the export, and each has a bounded resolution.

## 13. Validation performed

`npm run schema:validate` result (13 checks) re-read; `node scripts/schema-export.mjs compare` run against the install baseline (227 differences); inventory JSON generated and checked by `tests/production-inventory.test.mjs` (hash, counts, key facts, reproducibility, report consistency); Node suite, lint, secret scan. No database access of any kind.
