# Custom Auth objects review (D'Fabulous)

**Status: repository evidence only. Nothing was inspected on production or staging.** Items are marked
**CONFIRMED** (proved by a file in this repository), **UNVERIFIED** (named by you or inferred; no definition available) or **REQUIRED** (needed before staging).
The prepared read-only request is `auth_inspection_request_READONLY_NOT_EXECUTED.sql`; it has not been run.

## 1. `on_auth_user_created` and `handle_new_user()`

| Question | Finding | Evidence | Status |
|---|---|---|---|
| Is `handle_new_user()` defined in the repository? | **No.** No file under `08 Development/`, `supabase/migrations/`, `supabase/proposals/`, `supabase/staging/` or the Edge Function defines it. | `grep` for `handle_new_user` and `on_auth_user_created` across `*.sql`, `*.ts`, `*.tsx`, `*.md`, `*.mjs`, `*.toml` before this review was written: no match | CONFIRMED absent from the repository |
| Is `on_auth_user_created` defined in the repository? | **No.** Same search. | as above | CONFIRMED absent from the repository |
| Do they exist in production? | **Unknown.** These are the names of the standard Supabase "user management starter" trigger and function. They are named in the task brief, not in any repository file or earlier read-only finding. | brief only | **UNVERIFIED** |
| What would the function do? | Unknown. The starter version inserts `id`, `full_name`, `avatar_url` from `raw_user_meta_data` into `public.profiles`. D'Fabulous's `profiles` has `role` and `is_active`, so any live version was customised, and **how it sets `role` is the security-critical fact**. | n/a | **UNVERIFIED (critical)** |

## 2. What the repository does prove about Auth

* **CONFIRMED** `auth.uid()` is used by every RLS policy and helper (`is_admin()`, `is_owner()`, `user_has_permission()`), so the policies depend on the managed `auth` schema.
* **CONFIRMED** `20260815_date_availability.sql:9`: `blocked_dates.created_by REFERENCES auth.users(id) ON DELETE SET NULL`. This is the only repository foreign key into `auth.users` (the derived baseline keeps it; staging's `auth.users` always exists).
* **CONFIRMED** Account creation by the application: `serviceAdmin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name }, app_metadata: { role } })` (`server.ts` admin-users POST; `supabase/functions/dfabulous-api/routes/admin-users.ts:96`), followed by `profiles.upsert([...], { onConflict: 'id' })` (service role) and `user_permissions` upserts.
* **CONFIRMED** Authorisation decisions use `public.profiles.role` and `public.user_permissions` only; `auth.users.app_metadata.role` is informational (`docs/SECURITY_ARCHITECTURE.md`).
* **CONFIRMED** No `signUp` call exists in `src/` or either backend. **However** the Supabase Auth public sign-up endpoint is reachable with the public anon key unless sign-ups are disabled in the dashboard; absence of UI code proves nothing about that setting.
* **INFERENCE (not proof)** The `upsert ... onConflict: 'id'` is what you would write if a sign-up trigger might have created the profile row first. It is equally consistent with no trigger.

## 3. Interactions that matter for the security proposals (apply to staging only after the definition is known)

| If production has a trigger that... | Effect | Proposal impact |
|---|---|---|
| copies `raw_user_meta_data->>'role'` into `profiles.role` | **Critical.** With sign-up enabled any visitor creates an `admin`/`owner` profile. | Not fixed by A, B or C (it is an INSERT by a definer function). Must be fixed in the function and sign-ups disabled. |
| copies `raw_app_meta_data->>'role'` | Server-controlled; acceptable. | None. |
| inserts a default role such as `viewer` | The application's later `upsert` then performs an UPDATE that changes `role`. Under the **current** `prevent_role_escalation()` that UPDATE runs as `service_role` with `auth.uid()` NULL, so `is_owner()` is not true and the trigger raises. Since user creation works in production today, either no pre-creating trigger exists, the roles coincide, or the live trigger differs from the repository's. | Proposal B (allow `service_role`) removes this dependency; it is the reason to inspect before relying on the current behaviour. |
| runs as `SECURITY DEFINER` owned by `postgres` | Bypasses RLS and the restrictive deny policies of proposal A (the owner is not a browser role). | A does not break it. Verify `FORCE ROW LEVEL SECURITY` is off (the repository never enables it). |
| leaves `is_active` NULL | NULL counts as active everywhere (`is_active IS DISTINCT FROM false` in proposal C). | None. |

## 4. Other custom Auth/Storage objects that a public-only dump cannot show

All **UNVERIFIED**: custom triggers or functions in `auth`; custom policies or grants on `auth` or `storage`; storage buckets and their policies (**CONFIRMED:** no code in `src/`, `server.ts`, the Edge Function or any SQL file uses Supabase Storage, so buckets are probably unused, but their existence is unproven); Auth Hooks (custom access token, send-email); event triggers; publications; Auth dashboard settings (sign-ups, email confirmation, providers, JWT expiry).

## 5. What staging needs, and what it must not receive

* **REQUIRED before proposals A/B/C on staging:** the live definition of any `auth.users` trigger and its function (inspection queries A1 and A2), the sign-up setting, and whether `settings` or `site_settings` exists (A10).
* If a trigger exists and is verified safe, recreate **only that trigger and its function** on staging from the verified definition, in a separate reviewed file (`supabase/staging/proposed/`). **No such file is written now: inventing a definition is prohibited.**
* **Never** dump or restore the `auth` or `storage` schemas, `auth.users` rows, sessions, identities, MFA factors, storage objects or any data. Staging users are created by the staging backend or dashboard with staging keys.
* Staging sign-ups must be **disabled** in the staging Auth settings before any test that could create profiles.
