# D'Fabulous Security Architecture (Stage 3)

This document describes the intended production architecture, the rate-limiting and client-IP design,
secret handling, and the deployment checklist. It supersedes the "Express only" description in older notes.

## 1. Production API architecture

Two API implementations exist with identical `/api/*` contracts:

| | Express (`server.ts`) | Supabase Edge Function (`supabase/functions/dfabulous-api`) |
|---|---|---|
| Status | **Currently documented production backend** (README, audit report: Render, `node dist/server.cjs`) | **Built and tested, NOT active.** No production traffic is routed to it. |
| Rate limiting | In-memory, per process (`server/rateLimit.ts`) | Durable PostgreSQL (`consume_rate_limit` RPC), fail-closed |
| Auth | Supabase Auth token validated server-side on every admin route | Same logic, ported 1:1 (`lib/auth.ts`) |

**Single switch.** The frontend sends every API call to `VITE_API_BASE_URL` (`src/lib/db.ts` `apiUrl()`).
A production build with the variable unset throws `VITE_API_BASE_URL is required for production API requests.`,
so the destination is always explicit. Vercel rewrites `/(.*)` to `/index.html`, so a relative `/api` call could never
reach a backend on Vercel; there is no implicit fallback.

| Target | `VITE_API_BASE_URL` |
|---|---|
| Express on Render (today) | `https://<service>.onrender.com` |
| Edge Function (after approval) | `https://<project-ref>.supabase.co/functions/v1/dfabulous-api` |

Cutover = change that one Vercel variable and redeploy the frontend. Rolling back = restore the old value.
Nothing in this repository changes the production value.

**Intended end state (after an explicit go-live decision):** Vercel static frontend -> Supabase Edge Function ->
Supabase Postgres, with Express retained only as a local development server / rollback target. Until the
Edge Function has passed the staging smoke test below, keep Express as production.

### Frontend contract (verified)
* All calls go through `apiUrl()`; admin calls send `Authorization: Bearer <Supabase access token>` from `supabase.auth.getSession()`.
* No service-role key, Resend key or other secret is read by browser code. `vite.config.ts` only injects `VITE_*` values and
  now **fails the build** if any `VITE_` variable name contains `SERVICE_ROLE`, `SECRET`, `PRIVATE`, `RESEND`, `PASSWORD`, `OIDC` or `ACCESS_TOKEN`.
* `npm run scan:secrets -- --dist` scans the built bundle for secret patterns and for the literal values of local secrets.

### CORS (both backends)
* Exact-match allow-list: built-in D'Fabulous origins + `CORS_ALLOWED_ORIGINS`. No wildcard (a literal `*` is discarded), no reflection of arbitrary origins.
* `localhost` origins are dropped in production.
* **Fixed:** `Access-Control-Allow-Methods` omitted `PUT`, so the admin "save settings" call (`PUT /api/admin/settings`) failed its cross-origin preflight from the Vercel site. `PUT` is now allowed in both backends.
* CORS is never an authentication mechanism; every admin route validates the bearer token and permissions itself.
* The Edge Function runs with `verify_jwt = false` because public booking/availability endpoints are anonymous. All admin authorisation is enforced inside the function.

## 2. Admin rate limiting

Mandatory order, enforced centrally by `lib/adminGuard.ts` (Edge) and the `enforceAdminRateLimit()` call placed after the
role check on every Express admin route:

1. Validate the request shape (params/body) -> `400`
2. Authenticate (Supabase `auth.getUser`) -> `401`
3. Verify administrator access (active account, role, permission) -> `403`
4. Apply administrator rate limiting -> `429` (`Retry-After: 900`), or `503` if the limiter is unavailable (production)
5. Execute the operation

Keys never use a raw identifier:

* `admin_status:user:<sha256(admin id)>` limit 30 / 15 min - primary quota, always applied.
* `admin_status:ip:<sha256(trusted ip)>` limit 90 / 15 min - additional signal, applied only when a trusted IP exists
  (higher ceiling because several administrators may share an office address).
* `PUT /api/admin/settings` previously had **no** limit; it now uses its own `admin_settings` scope.

Consequences: unauthenticated, invalid-token and non-admin traffic never touches an administrator quota; one visitor
cannot exhaust another administrator's quota; rotating IP addresses with a stolen token does not escape the per-admin limit;
a missing IP never disables or merges administrator limiting. Error bodies no longer disclose permission names
("You are missing the required permission: ..." -> "You do not have permission to perform this action.").

Public submissions (`POST /api/bookings`, `POST /api/messages`) remain limited to 5 per IP per 15 minutes.

### 2a. User-management hierarchy and limiting (`lib/userPolicy.ts`, shared by Express and the Edge Function)

| Actor | May do |
|---|---|
| **Owner** | Everything: create owners/administrators, promote/demote administrators, grant and revoke privileged permissions, manage and delete any account (never their own role, permissions or account). |
| **Administrator** (must also hold the explicit `users.manage` permission) | Create and manage **staff/viewer** accounts only, with **non-privileged permissions they hold themselves**. Cannot create or promote administrators/owners, cannot grant or revoke privileged permissions (`users.view`, `users.manage`, `settings.manage`, `payments.manage`), cannot modify or delete owner or administrator accounts, cannot change their own account. |
| **Staff / viewer** | Refused every create/update/delete, even if they hold `users.manage`. |

Request hardening: roles must exactly match `owner|admin|staff|viewer`; `permissions` must be an array of known keys (unknown keys or a non-array are a `400`, so a malformed value can never wipe an account's permissions); `is_active` must be a real boolean; stored roles are compared case-insensitively. Listing users (`GET /api/admin/users`) remains permission-gated by `users.view` and read-only.

`POST/PATCH/DELETE /api/admin/users[/:id]` follow validate -> authenticate -> verify role/permissions/hierarchy -> rate limit (`admin_users` scope, administrator id + trusted IP, 30 per 15 min) -> execute. Target-dependent checks (target role, target's current permissions) run after the limiter because they need the stored profile. Policy denials (`403`) and authentication failures (`401`) never consume quota.

The default privileged-permission list lives in `PRIVILEGED_PERMISSIONS` (`lib/userPolicy.ts`); adjust it there if the business wants a different set.

### 2b. Existing accounts, role handling and database-level paths (review only; no production data was accessed)

**How roles work today (verified in code and the repository SQL):**
* Authorisation uses `public.profiles.role` and `public.user_permissions` only. `auth.users.app_metadata.role` is written once at user creation, is **not** updated when a role changes and is **not** used for any decision. Treat it as informational; it can be stale.
* Role names are compared case-insensitively by the API (`Admin` = `admin`) and the policy; the DB functions `is_admin()` / `is_owner()` compare exactly (`'admin'`, `'owner'`), so a role stored with different casing would be treated as a normal user by RLS. Anomalies are listed by query 5 below.
* The owner has all permissions implicitly; administrators have only the rows in `user_permissions`.
* The API requires an **explicit `users.manage` permission** for administrators. After this change, accounts that previously managed users without being owner/admin (a staff member with `users.manage`) can no longer create/update/delete users; they can still list users if they hold `users.view`.

**Findings that depend on the live database (cannot be confirmed from the repository; verify with the read-only queries below):**
1. **Direct table access bypasses the API hierarchy.** The repository defines RLS policy `user_permissions_manage_owner_admin` (`FOR ALL TO authenticated`, any profile with role `owner` or `admin`) and a `Users update own profile` policy on `profiles`. The API always uses the service role, so these policies only matter if the `authenticated` role still has table privileges. Supabase grants new public tables to `anon`/`authenticated`/`service_role` by default, and the repository SQL never revokes INSERT/UPDATE/DELETE on `user_permissions` or UPDATE on `profiles` from `authenticated`. If those privileges exist in production, an administrator could write `user_permissions` rows directly through PostgREST with their own login token (for example granting themselves `users.manage`), and any user could update their own profile row (e.g. `is_active`). The role column itself is protected by the `prevent_role_escalation` trigger. **Query 8 shows whether this is exploitable.** If it is, a migration revoking those privileges from `authenticated` is needed before the API hierarchy can be considered airtight (proposal below; not applied).
2. **Role changes: the outcome depends on which `is_owner()` variant is live** (reviewed in detail in `docs/DATABASE_SECURITY_REVIEW.md` F4). The repository contains two: one returns `NULL` without `auth.uid()` (the API's service role is then let through only because NULL fails open), the other returns `false` (which makes the trigger block **every** API role change, including the Owner's, with a generic "Unable to update the user"). Proposal B makes the behaviour explicit and identical under both. Run staging tests 11-16 and record the result.

**Safe procedure for the Owner to review existing administrator accounts (read-only, nothing is changed by these steps):**
1. Sign in as the Owner and open *Admin -> Users*. Export or screenshot the list (email, role, active). Do not share it outside the team.
2. In the Supabase SQL editor (production, read-only `select` statements only; Supabase SQL editor runs as `postgres`), run:

```sql
-- 1. Who can do what: every owner/admin/staff/viewer with their permission keys
select p.email, p.role, p.is_active, p.created_at,
       coalesce(array_agg(up.permission_key order by up.permission_key) filter (where up.permission_key is not null), '{}') as permissions
from public.profiles p
left join public.user_permissions up on up.user_id = p.id
group by p.id order by case p.role when 'owner' then 0 when 'admin' then 1 when 'staff' then 2 else 3 end, p.email;

-- 2. Number of owners (should be the people you expect, normally 1-2)
select count(*) as owners from public.profiles where role = 'owner';

-- 3. Administrators holding privileged permissions (review each: keep only where intended)
select p.email, up.permission_key
from public.profiles p join public.user_permissions up on up.user_id = p.id
where p.role = 'admin' and up.permission_key in ('users.view','users.manage','settings.manage','payments.manage')
order by p.email, up.permission_key;

-- 4. Non-admin accounts holding user-management permissions (they are now refused all user changes)
select p.email, p.role, up.permission_key
from public.profiles p join public.user_permissions up on up.user_id = p.id
where p.role in ('staff','viewer') and up.permission_key like 'users.%';

-- 5. Role anomalies (casing/typos/unknown roles) and inactive privileged accounts
select email, role, is_active from public.profiles
where role is null or role <> lower(btrim(role)) or role not in ('owner','admin','staff','viewer')
   or (role in ('owner','admin') and not is_active);

-- 6. Auth users without profiles, and profiles without auth users
select u.email, 'auth user without profile' as issue from auth.users u left join public.profiles p on p.id = u.id where p.id is null
union all
select p.email, 'profile without auth user' from public.profiles p left join auth.users u on u.id = p.id where u.id is null;

-- 7. Recent privileged changes (adjust the interval). Look for anything the Owner did not do.
select created_at, action, actor_user_id, target_user_id, metadata
from public.audit_logs
where action in ('user.created','user.role_changed','user.permissions_changed','user.deleted','user.activated','user.deactivated')
  and created_at > now() - interval '180 days'
order by created_at desc;

-- 8. Can ordinary logged-in users write the sensitive tables directly? (expect false / false / false)
select has_table_privilege('authenticated','public.user_permissions','INSERT') as perms_insert,
       has_table_privilege('authenticated','public.user_permissions','UPDATE') as perms_update,
       has_table_privilege('authenticated','public.profiles','UPDATE')        as profiles_update;
select tablename, policyname, cmd, roles from pg_policies where tablename in ('profiles','user_permissions') order by tablename, policyname;
```

3. Decide per account (record the decision, who approved it and the date):
   * Remove accounts of people who no longer work with D'Fabulous. **Caution:** `PATCH ... {"is_active": false}` only flips a flag in `profiles`; it neither ends the person's Supabase login/session nor removes their direct database access if they hold the `admin` role (RLS checks the role only; see `docs/DATABASE_SECURITY_REVIEW.md` F5/F6). For administrators: the Owner should first **demote** them to `viewer`/`staff` (or remove the role), then disable the login in Supabase Auth -> Users (ban/delete). Deletion through the API removes only the profile and permission rows, not the Auth login.
   * Keep privileged permissions (`users.*`, `settings.manage`, `payments.manage`) only on administrators who genuinely need them. Only the Owner can now change them.
   * Demote administrators who do not need that role (Owner only).
   * Reset the password / require re-login for any account you do not recognise, and remove it.
4. Make every change through the admin UI/API (not by editing tables), so it is recorded in `audit_logs`.
5. If query 8 returns `true` for any column, do **not** change production directly: see `docs/DATABASE_SECURITY_REVIEW.md` (proposals A-C in `supabase/proposals/`, tested locally, staged first).

**Database-level review (completed locally, read-only): see [DATABASE_SECURITY_REVIEW.md](./DATABASE_SECURITY_REVIEW.md).** The simple REVOKE-only proposal that used to be listed here was reviewed and **superseded**: it was correct but privilege-only (not enforced by RLS) and incomplete (`audit_logs`, `TRUNCATE`, the permissive "own profile" policy). The replacement (Proposal A) enforces both RLS and privileges. The review also found that RLS is role-based only, so **deactivating an administrator does not revoke their direct database access or Auth session**; offboard administrators by demoting them (Owner) and banning the login until Proposal C and an application-level ban are in place.

## 3. Client IP identification strategy

Hosted Supabase Edge Functions run behind Cloudflare. Cloudflare sets `cf-connecting-ip` to the real connecting
address and rejects/overwrites forged values (community-reported behaviour; **verify with the smoke test below** - it is not a
documented Supabase guarantee).

| Situation | Identity used |
|---|---|
| Production, `cf-connecting-ip` valid | that address (IPv4 exact, IPv6 collapsed to /64, IPv4-mapped -> IPv4) |
| Production, header absent/invalid | **No** fallback to `x-forwarded-for` / `x-real-ip` (client-seedable). Public: per-fingerprint bucket (hash of user-agent + accept-language, limit 5) **and** a global `noip-global` ceiling of 30 / 15 min. Admin: authenticated admin-id bucket only. |
| Development/local | `cf-connecting-ip` -> `x-real-ip` -> last `x-forwarded-for` entry |

* Never one shared `unknown` bucket; never an "allow" path when identification fails.
* The global ceiling makes fingerprint rotation useless, so failure to identify the IP cannot be turned into a bypass.
* Identifiers are SHA-256 hashed (first 128 bits) before they reach the database, so no raw IP addresses are stored.
* Malformed values (`not-an-ip`, overlong strings, SQL fragments) are rejected, not bucketed.
* Express: `req.ip` reflects the socket unless `trust proxy` is set. Behind a reverse proxy set **`TRUST_PROXY_HOPS`** (1-5) to the verified
  number of trusted hops. Unset = no proxy trusted (a production warning is logged). Previously **no** `trust proxy` setting existed, so behind Render every
  visitor shared the proxy's address and therefore one 5-per-15-minutes booking quota.

## 4. Database

* `supabase/migrations/20261110120000_api_rate_limits.sql` is left unmodified (it may already be applied somewhere).
* `supabase/migrations/20261111090000_api_rate_limits_cleanup_hardening.sql` (new, **not applied anywhere**) replaces the unbounded opportunistic `DELETE` with:
  an index on `window_start`; `cleanup_expired_rate_limits(batch, max_batches)` - bounded batches (default 1000 x 5, hard max 5000 x 20), `FOR UPDATE SKIP LOCKED`,
  a non-blocking advisory lock, a 10 s statement timeout; an opportunistic path capped at one 100-row batch on ~1% of calls; an optional hourly `pg_cron` job **only if pg_cron is already installed**.
* The atomic `INSERT ... ON CONFLICT DO UPDATE` is unchanged. RLS stays enabled with no policies; both functions are `SECURITY DEFINER`, `search_path` pinned, executable by `service_role` only; `anon`/`authenticated` have no table or function access.
* Verified locally against real PostgreSQL semantics (PGlite): `tests/db-rate-limit.test.mjs`.

## 5. Secret handling

* Root `.gitignore` excludes `.env`, `.env.*`, `*.env`, nested `supabase/**/.env*`, `supabase/.temp/`, keys/certs; only `.env.example` and `supabase/functions/.env.example` (placeholders) may be committed.
* Server secrets live only in: Express host environment variables (Render) or Supabase Edge Function secrets (`supabase secrets set`). `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are platform-injected.
* The scan of the working tree and the **entire git history found no committed secrets**; `.env*` files were never tracked.
* `dist/server.cjs` (+ map) is the backend bundle. It was previously deployable as a public static asset (Vercel output dir) and served by Express's static handler. The Vercel build now skips it (`scripts/build-server.mjs`, `VERCEL=1`) and Express returns 404 for `/server.cjs*`. Render keeps `node dist/server.cjs`.

### Credentials that MUST be rotated manually (treat as compromised)

The project archive that was supplied contained local `.env` files. No replacement was generated, none was used, and nothing
was rotated automatically. Findings from a local, value-free inspection of those files (key names and formats only):

| Credential (env name) | Found in | Format / notes | Action |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `.env`, `supabase/functions/.env` (same value in both) | New-style Supabase **secret key** (`sb_secret_...`). Bypasses RLS: full database + Auth admin access | **Rotate first (critical)** |
| `RESEND_API_KEY` | `.env`, `supabase/functions/.env` (same value) | Resend key (`re_...`). Can send mail as your domain/sender | **Rotate (high)** |
| `VERCEL_OIDC_TOKEN` | `.env.local` | Short-lived JWT; its embedded expiry (2026-09-03) has already passed | Delete file; re-link Vercel on next use (low) |
| `VITE_SUPABASE_ANON_KEY` | `.env`, `supabase/functions/.env` | New-style **publishable** key. Public by design (ships in the browser bundle) | Optional hygiene: rotate with the secret key |
| `VITE_SUPABASE_URL`, `VITE_APP_URL`, `RESEND_*_EMAIL` | `.env` files | Not secrets (URLs / mailbox addresses, but personal data: keep out of public repos) | None |
| `RATE_LIMIT_DEV_FALLBACK` | `supabase/functions/.env` | A flag, not a secret. Must never be set in production | Ensure it is absent from production secrets |
| Database password, Supabase personal access tokens (`sbp_...`), Render/Vercel API tokens | Not present locally | Unknown whether they were in the archive | Rotate if there is any doubt |

#### Step-by-step rotation checklist (perform manually, in this order; nothing here has been executed)

**A. Prepare (no impact)**
1. Pick a low-traffic window. Announce a short maintenance period for the admin area (booking forms are unaffected until step B4).
2. Open the Supabase dashboard (production project), the Render service, the Vercel project and the Resend dashboard in separate tabs. Do not paste any key into chat tools, tickets or the repository.
3. Take a note of which systems use each credential: Render env (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`), Supabase Edge Function secrets (only if/when the Edge Function is deployed), developer machines (`.env`, `supabase/functions/.env`).

**B. Supabase (service/secret key, then optional publishable key)**
1. Dashboard -> Project Settings -> API Keys -> *Secret keys*: **create a new secret key** (do not delete the old one yet).
2. Update Render: Environment -> `SUPABASE_SERVICE_ROLE_KEY` = the new key -> save (Render redeploys). Wait for the deploy to become healthy.
3. Verify (no data changes): `GET <render-url>/api/health` returns ok; sign in to the admin area; open Bookings and Users; submit a booking on a *test date/test mailbox* only if you have a test routine, otherwise skip.
4. Only after step 3 passes: Dashboard -> API Keys -> **delete/revoke the old secret key**. Confirm the old key now fails (the Render logs show no auth errors; any developer using the old `.env` will get 401).
5. Optional hygiene: create a new publishable key, update `VITE_SUPABASE_ANON_KEY` in Vercel (Production + Preview) and redeploy the frontend, then delete the old publishable key. Because the old key stays valid until deleted there is no downtime if you do the Vercel update first.
6. Rotate the **database password** (Project Settings -> Database) and revoke any **personal access tokens** (Account -> Access Tokens) that were ever on the exposed machine/archive. Update anything that uses the DB password directly (none is known).
7. Review: Auth -> Logs and Database -> `audit_logs` for activity (sign-ins, user creation, role/permission changes) since the archive was shared; review Auth -> Users for unfamiliar accounts (see §2b).

**C. Resend**
1. Resend dashboard -> API Keys -> **Create API Key** (sending access, restricted to your domain if possible).
2. Update Render `RESEND_API_KEY` -> redeploy -> trigger a test notification (a contact-form message to yourself is the lowest-risk path).
3. Revoke the old key in Resend. Review Logs/Emails for messages you did not send since the archive was shared.
4. Check domain settings (SPF/DKIM) were not altered and that the sender (`RESEND_FROM_EMAIL`) is unchanged.

**D. Vercel**
1. The token in `.env.local` (`VERCEL_OIDC_TOKEN`) already expired; delete `.env.local` from every machine that holds it. Re-run `vercel link` / `vercel env pull` only when needed (the pulled file is git-ignored).
2. Dashboard -> Account/Team Settings -> Tokens: revoke any CLI/API token created for this project; review *Settings -> Git* and *Deployments* for unexpected deployments or integrations.
3. Review Production/Preview environment variables (names only) for unexpected entries; confirm no secret has a `VITE_`/`NEXT_PUBLIC_` prefix.
4. Confirm `VITE_API_BASE_URL` in Production still points at the intended backend (see the staging plan, §0a), and that Preview is scoped separately.

**E. Cleanup and verification**
1. On every developer machine: replace `.env` and `supabase/functions/.env` contents with the new values (never copy them back into the repository); delete any copies of the archive.
2. Run `npm run scan:secrets -- --history` and `npm run scan:secrets -- --dist` after the next production build; both must report no findings.
3. Record the rotation date and the people who performed it. Schedule the next review.
4. If the archive was shared outside the team, rotate everything in this list again and assume prior audit-log entries may include attacker activity.

## 6. Tests and how to run them

```bash
npm run lint && npm run lint:edge
npm test                # tests/*.test.mjs via node:test + Deno tests for the Edge Function
npm run scan:secrets -- --history
npm run build && npm run scan:secrets -- --dist
```

Known limits: PGlite is single-connection, so real multi-session `SKIP LOCKED`/advisory-lock contention must be exercised once on a staging Postgres;
rate-limit tests for the Edge Function use an in-memory Supabase fake (no network).

## 7. Deployment checklist (do NOT execute without approval)

1. Rotate the credentials listed above; update Render env vars and `supabase secrets set ...`.
2. Create a **staging** Supabase project; apply both rate-limit migrations; run the verification queries at the bottom of the hardening migration (including anon/authenticated denial); on two sessions confirm concurrent cleanup + `consume_rate_limit` do not block.
3. Deploy the Edge Function to staging. Smoke test client-IP trust: send requests with forged `X-Forwarded-For`, `X-Real-IP` and `CF-Connecting-IP`; confirm every request lands in the same `api_rate_limits` bucket and forged values do not create new ones. If `cf-connecting-ip` is absent on the platform, STOP and revisit section 3.
4. Verify CORS preflight (`PUT /api/admin/settings`) from the real frontend origin; verify booking submission, availability, admin login, status change, archive, payment, blocked dates, settings.
5. Production Express: set `TRUST_PROXY_HOPS` after verifying the hop count; redeploy.
6. Production migrations (Supabase SQL / CLI) only after staging sign-off and explicit approval.
7. Set Vercel `VITE_API_BASE_URL` only when ready to cut over; keep the previous value for rollback; do not enable `RATE_LIMIT_DEV_FALLBACK` anywhere that is not a developer machine.
8. Post-deploy: watch Edge Function logs for `[Edge API] Rate limit RPC failure` (503s mean fail-closed fired) and `No trusted client IP available`.
