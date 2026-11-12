# D'Fabulous Database Security Review (read-only)

**Status: review and proposals only. Nothing in this document has been applied to any database.**
No connection was made to Supabase or any production system; no SQL was executed against production; no policy, trigger
or privilege was changed; nothing was deployed or pushed.

> **Update (Stage 2):** proposals A-C were reconciled against the repository and corrected (snapshot-driven exact rollbacks, no invented grants or roles, B now allows only `service_role`, A no longer adds any privilege). The authoritative description is [STAGE2_SECURITY_REMEDIATION_REVIEW.md](./STAGE2_SECURITY_REMEDIATION_REVIEW.md); the staging procedure is [STAGE2_STAGING_VALIDATION.md](./STAGE2_STAGING_VALIDATION.md). Where this document disagrees with them, they win. The findings below remain valid.

## 1. Scope and method

* **Source of truth reviewed:** the repository SQL in `08 Development/` (`20260814_admin_rls_privileges.sql`,
  `20260815_admin_settings_privileges.sql`, `20260818_payments_rls_hardening.sql`, `20260819_public_data_access_hardening.sql`,
  `20260902_admin_permissions_migration.sql`, `20260902_final_security_hardening.sql`, `security_remediation_migration.sql`)
  and every database call made by the application (`server.ts`, `supabase/functions/dfabulous-api/**`, `src/`).
* **Reproduction:** `tests/db-stage2-security.test.mjs` (formerly `db-privilege-review.test.mjs`) rebuilds the relevant tables, policies, grants, helper functions and
  trigger **from those repository files** inside an in-process PostgreSQL (PGlite) and executes the scenarios as the
  `anon` / `authenticated` / `service_role` roles with a simulated JWT subject. all passing (see the Stage 2 review for counts).
* **Limits (important):** the base schema (`profiles` table definition, any sign-up trigger, Auth settings, the order in
  which migrations were actually applied, and Supabase's default table privileges) is **not in the repository**. Findings are
  therefore classified as *Confirmed from the repository* or *Confirmed conditionally* (true if the live database has the
  privilege/variant shown). Section 6 gives the read-only queries that settle each condition on the real project; they are
  for the owner/DBA to run and were not run by me.

## 2. Existing protections (what already holds)

| Protection | Where | Verified |
|---|---|---|
| RLS enabled on profiles, permissions, user_permissions, audit_logs, bookings, messages, payments, site_settings | migrations above | yes |
| `anon` has no privileges on private tables | `20260819` `REVOKE ALL ... FROM PUBLIC, anon` | yes (test: anon denied) |
| Staff/viewer/anon cannot write `user_permissions` or `audit_logs` | RLS policy predicates require profile role `owner`/`admin` | yes |
| Browser roles cannot change `profiles.role` (including admin self-promotion) | `prevent_role_escalation()` trigger | yes (test) |
| An admin cannot update another user's profile row | policy `Users update own profile` (own row or owner) | yes (0 rows) |
| `permissions` table cannot be written by browser roles | only a SELECT policy exists | yes |
| Helper/trigger functions not executable by browser roles (`user_has_permission`, `prevent_role_escalation`, rate-limit RPCs) | REVOKE statements | yes |
| Payment ledger fields immutable for non-owners; payments UPDATE/DELETE owner-only | `20260818` | by inspection |
| Service key is server-only; all identity-table **writes** in the app use `service_role` | `server.ts`, Edge routes | yes (code review below) |

**How the application uses the database (determines the impact of any change):**
* Browser (anon key): only `services` (SELECT). No other table, no writes (`src/` has no `.update/.insert/.upsert/.delete/.rpc`).
* API with the **caller's token** (RLS is a deliberate backstop): `profiles` SELECT (own row), `user_permissions` SELECT (own rows),
  `bookings` SELECT/UPDATE/DELETE, `payments` SELECT/INSERT.
* API with **service_role**: all writes to `profiles`, `user_permissions`, `audit_logs`, plus `messages`, `blocked_dates`, `site_settings`,
  `bookings` INSERT and public reads.

## 3. Findings

| # | Finding | Severity | Status | Evidence |
|---|---|---|---|---|
| **F1** | Any administrator (even deactivated, even without `users.manage`) can INSERT/UPDATE/DELETE `user_permissions` directly through PostgREST with their own token: self-grant `users.manage`, `settings.manage`, `payments.manage`, or strip other users' permissions. This bypasses the whole API hierarchy. | **High** | **Confirmed conditionally** (needs `authenticated` table privileges, which the repo never revokes and Supabase grants by default) | Policy `user_permissions_manage_owner_admin` (`FOR ALL`, role-only), `20260902_admin_permissions_migration.sql:129-146`; tests F1, F1b; without default grants the same attempt fails with *permission denied* |
| **F2** | Any administrator can forge `audit_logs` rows (any actor/action/metadata); admins cannot read, edit or delete them. | Medium | Confirmed conditionally | Policy `audit_logs_insert_owner_admin`; test F2 |
| **F3** | Any authenticated user can update their **own** profile row. A deactivated account can re-activate itself (`is_active`), and users can change `email`/`full_name`. `role` stays protected by the trigger. | Medium | Confirmed conditionally | `security_remediation_migration.sql:79`; test F3 |
| **F4** | **Role-change trigger.** `prevent_role_escalation()` allows only `is_owner()`, and `is_owner()` depends on `auth.uid()`. The repository contains **two** `is_owner()` variants: (a) `security_remediation_migration.sql:50` returns `NULL` when there is no `auth.uid()`, so `IF NOT is_owner()` is not true and the trusted API (service_role) and the SQL editor are let through **by accident of three-valued logic**; (b) `20260814_admin_rls_privileges.sql` returns `false`, which makes the **same trigger block every API role change, including the Owner's**. Which variant is live depends on migration order. The Owner acting with their own token directly against PostgREST is allowed in both. | Medium (functional + fail-open design) | **Confirmed (variant-dependent)** | tests F4, F4b |
| **F5** | **RLS is role-based only.** `is_admin()`/`is_owner()` ignore `profiles.is_active` and `user_permissions`. The explicit grants in the repo give `authenticated` direct access to bookings (SELECT/UPDATE), messages (SELECT/UPDATE), payments (SELECT/INSERT), site_settings, blocked_dates, services, so **any admin-role account, including a deactivated one, keeps direct database access** regardless of the API's `is_active` and permission checks (`bookings.manage`, `payments.manage`, `settings.manage` are advisory at the database layer). | High (for offboarding) / Medium otherwise | **Confirmed from the repository** | grants in `20260814:56`, `20260819:40-44`; policies using `is_admin()`; test F5 |
| **F6** | Deactivating a user in the app (`PATCH is_active:false`) does not end their Supabase Auth session or ban the login. Combined with F5, the app-level "deactivate" is not an access revocation for administrators. (Deleting a user removes only profile + permission rows, also leaving the Auth login.) | Medium | Confirmed (code) | `routes/admin-users.ts`, `server.ts` PATCH/DELETE |
| F7 | Payment ledger guard uses the same `IF NOT is_owner()` pattern: it fails open for service_role/SQL editor under variant (a). | Low | Confirmed (variant-dependent) | `20260818_payments_rls_hardening.sql:134` |
| F8 | `SECURITY DEFINER` helpers use `search_path = public, pg_temp`. Exploitable only if `authenticated` can CREATE objects in `public`. | Low | Unverified | query 9 |
| F9 | Public sign-up / profile-creation trigger unknown. If sign-ups are enabled and a trigger copies a user-supplied role from metadata, that is a direct escalation path. Not in the repository. | Unknown (potentially Critical) | **Requires manual verification** | queries 10-11 |
| F10 | Staff/viewer users cannot read their own `user_permissions` rows with their own token under the repository policy (policy requires admin/owner), yet `getAuthenticatedAdminUser` reads them that way; either another policy exists in the live DB or staff permissions load as empty. | Low (functional) | Unverified | tests ("reads ... unchanged"), query 7 |
| F11 | Owner email is hard-coded in a migration (`fabulousevents@hotmail.com`). | Info | n/a | `security_remediation_migration.sql:111-114` |

### Answers to the review questions

**2. Can authenticated administrators directly insert/update/delete `user_permissions` outside the API?**
*Under the repository's policies, yes, as far as RLS is concerned*: the `FOR ALL` policy admits every `owner`/`admin` profile
(active or not) and every command. Whether the request actually succeeds depends on one live-database fact: whether the
`authenticated` role holds INSERT/UPDATE/DELETE on `public.user_permissions`. Supabase's default privileges grant it, and no
repository migration revokes it, so **treat it as exploitable until query 8 proves otherwise**. If the privilege is absent the same
request fails with *permission denied* (covered by a test). The same logic applies to `audit_logs` inserts (F2) and own-profile updates (F3).

**3. Does `prevent_role_escalation` prevent legitimate Owner operations?**
Through the application (API with service_role): **depends on which `is_owner()` is live**. Variant (a): no, role changes succeed, but only
because `NULL` fails open (fragile; the same NULL also disables the payment-ledger guard for service_role). Variant (b): **yes, every API role change
fails**, including Owner promotions/demotions, with a generic "Unable to update the user". Through the Owner's own token directly: works.
Through the SQL editor: allowed in (a), blocked in (b). The trigger never inspects `is_active`. It correctly blocks admin/viewer self-promotion
by browser roles in both variants.

**4. Review of the earlier REVOKE proposal** (`REVOKE INSERT, UPDATE, DELETE ON profiles, user_permissions FROM authenticated, anon`,
`docs/SECURITY_ARCHITECTURE.md` §2b before this review):

| Check | Result |
|---|---|
| SQL syntax | Valid PostgreSQL. |
| Impact on the Owner | None. The Owner manages users through the API (service_role); no Owner path writes these tables directly. |
| Impact on `service_role` | None (REVOKE on `authenticated`/`anon` only; service_role also bypasses RLS and keeps its explicit grants). |
| Impact on the application | None: reads use the caller's token (SELECT retained); writes use service_role; `src/` never writes these tables. |
| Enforced by both RLS and privileges? | **No.** Privileges only. The permissive policy still admits admin writes, so a later re-grant (dashboard toggle, restore, `ALTER DEFAULT PRIVILEGES`, a new migration) silently re-opens the hole. |
| Completeness | **Incomplete.** Left `audit_logs` INSERT (F2), `TRUNCATE/REFERENCES/TRIGGER`, and the permissive "own profile" policy. |
| Verdict | Correct but insufficient. Superseded by Proposal A below (tested). |

**6. Additional privilege-escalation paths** are F5-F10 above plus the "candidate hardening" in section 8.

## 4. Proposals (for review; nothing applied)

Files are in `supabase/proposals/`, deliberately **outside** `supabase/migrations/` so `supabase db push` cannot apply them.
Apply **in this order on staging**: A, then B, then (optional) C. Roll back in reverse order: C, B, A.

| File | Purpose | Priority |
|---|---|---|
| [`20261112_a_restrict_direct_identity_writes.sql`](../supabase/proposals/20261112_a_restrict_direct_identity_writes.sql) | Closes F1, F2, F3. RLS **and** privileges: drops the three permissive write policies, adds RESTRICTIVE deny policies (INSERT/UPDATE/DELETE) on `profiles`, `user_permissions`, `audit_logs` for `anon` and `authenticated`, revokes write/TRUNCATE/REFERENCES/TRIGGER from them, keeps SELECT, re-asserts `service_role` grants. Preflight checks, `lock_timeout` 5 s, idempotent. | **Recommended** |
| [`20261112_b_role_trigger_allow_service_role.sql`](../supabase/proposals/20261112_b_role_trigger_allow_service_role.sql) | Resolves F4 explicitly: trigger becomes `SECURITY INVOKER`, pinned `search_path`, allows only `service_role` to change roles (corrected in Stage 2), still blocks browser roles unless Owner. Makes behaviour identical under both `is_owner()` variants. | **Recommended** (mandatory before C) |
| [`20261112_c_rls_helpers_require_active.sql`](../supabase/proposals/20261112_c_rls_helpers_require_active.sql) | Closes the database half of F5/F6: `is_admin()`/`is_owner()` require `is_active IS DISTINCT FROM false` (NULL still counts as active, like the API). Refuses to run unless B is applied and `is_active` exists. Side effect: the payment-ledger guard now also applies to service_role/SQL editor (the app never updates payments). | Optional, recommended |

Rollbacks: `*.rollback.sql` next to each file. **Before applying anything in any environment, save** the grants, policies and function definitions with the snapshot
queries in section 6 (queries 4-6): rollbacks restore the repository-defined state, but your saved snapshot is the exact source of truth if the live database differs.

What the tests prove (`tests/db-stage2-security.test.mjs`): before A every F1-F3 path succeeds under default grants and fails without them; after A
all are denied while reads used by the API (own profile, own permissions, admin list, owner audit log, permissions) and every `service_role` write still work;
re-granting privileges or adding a permissive write policy does **not** re-open the hole (both layers); A/B/C are idempotent, preflights fail safely,
browser self-promotion stays blocked after B, the API can change roles after B, deactivated admins lose `is_admin()` after C, C refuses to run without B,
and each rollback restores the original policy set / function shape. **Not provable locally:** real Supabase default-privilege behaviour, multi-session lock behaviour, PostgREST.

### Application-level follow-up (not implemented; requires approval)
* On deactivate/delete, also **ban or delete the Supabase Auth user** (`auth.admin.updateUserById(id, { ban_duration })`) so tokens stop working (F6).
* Until C (and the ban) are in place, the Owner should offboard an administrator by **demoting** them (Owner-only) and banning the login, not merely deactivating.
* Optional: add a `CHECK (role IN ('owner','admin','staff','viewer'))` constraint after query 5 shows clean data.

## 5. Staging test plan (read-only checks on production, then staging)

**Step 0 (production, read-only, performed by the owner/DBA).** Run queries 1-11 in section 6, save the output. This decides which findings are live.
**Step 1 (staging baseline).** Create staging with the same schema; run the same queries; record the baseline.
**Step 2 (prove the finding on staging, before applying anything).** With a staging administrator token (never a production token):

```powershell
$H = @{ apikey = $STAGING_ANON_KEY; Authorization = "Bearer $ADMIN_TOKEN"; "Content-Type" = "application/json"; Prefer = "return=minimal" }
# expect 201 (VULNERABLE) or 401/403 (privileges absent)
Invoke-WebRequest -Method Post "$STAGING_URL/rest/v1/user_permissions" -Headers $H -Body '{"user_id":"<admin id>","permission_key":"users.manage"}'
Invoke-WebRequest -Method Post "$STAGING_URL/rest/v1/audit_logs" -Headers $H -Body '{"action":"probe"}'
Invoke-WebRequest -Method Patch "$STAGING_URL/rest/v1/profiles?id=eq.<own id>" -Headers $H -Body '{"is_active":true}'
Invoke-WebRequest -Method Patch "$STAGING_URL/rest/v1/profiles?id=eq.<own id>" -Headers $H -Body '{"role":"owner"}'   # expect rejection (trigger)
```

**Step 3 (apply A, B on staging; C optionally).** Per proposal, one at a time, saving the pre-state first. After **each**:
1. Re-run Step 2: every write must now be rejected (401/403/permission denied or 0 rows); the role-self-patch stays rejected.
2. **Regression of everything that reads/writes with the caller's token:** admin login, `GET /api/admin/session`, bookings list/status/archive/update/delete, payment recording, dashboard counts (these read `profiles`/`user_permissions`/`bookings`/`payments` with the user token).
3. **User management through the API** (`docs/STAGING_DEPLOYMENT_PLAN.md` §7 tests 11-16): Owner creates/promotes/demotes an administrator (this is the F4 test; after B it must succeed under either `is_owner()` variant), administrator manages staff, all denials still 403.
4. Staff account loads its permissions (F10): record whether a staff token sees its own `user_permissions`.
5. After C: deactivate an administrator and confirm direct `GET /rest/v1/bookings` with their token returns no rows while the API returns 403; reactivate and confirm access returns.
6. Check locks: apply during a traffic-free window; the migrations set `lock_timeout = 5s`, so a busy table makes them fail fast (safe) instead of blocking requests.

**Step 4 (rollback rehearsal on staging).** Apply C-rollback, B-rollback, A-rollback in that order; confirm the Step 2 baseline reappears exactly; re-apply A and B.
**Step 5 (exit criteria).** All Step 3 checks pass; rollback rehearsal restores baseline; no unexplained 401/403/500 in API logs for 24 h on staging. Only then request approval for production, applying A, then B, then C in separate approved steps, saving the pre-state each time.

## 6. Read-only inspection queries (owner/DBA runs these in the Supabase SQL editor; every statement is a SELECT)

```sql
-- 1. Table privileges of the browser roles on the sensitive tables
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('profiles','permissions','user_permissions','audit_logs','bookings','messages','payments','site_settings','blocked_dates','services')
  and grantee in ('anon','authenticated','PUBLIC') group by 1,2 order by 2,1;

-- 2. Can ordinary logged-in users write the identity tables directly? (F1/F2/F3; want all false)
select has_table_privilege('authenticated','public.user_permissions','INSERT') as perms_insert,
       has_table_privilege('authenticated','public.user_permissions','UPDATE') as perms_update,
       has_table_privilege('authenticated','public.user_permissions','DELETE') as perms_delete,
       has_table_privilege('authenticated','public.audit_logs','INSERT')       as audit_insert,
       has_table_privilege('authenticated','public.profiles','UPDATE')         as profiles_update,
       has_table_privilege('authenticated','public.profiles','INSERT')         as profiles_insert;

-- 3. Policies on the identity tables (compare with the repository)
select tablename, policyname, permissive, cmd, roles, qual, with_check
from pg_policies where tablename in ('profiles','permissions','user_permissions','audit_logs') order by 1,2;

-- 4. Which is_owner()/is_admin() variant is live (F4: look for "RETURN v_role = 'owner'" (NULL-returning) vs "RETURN EXISTS")
select pg_get_functiondef('public.is_owner()'::regprocedure), pg_get_functiondef('public.is_admin()'::regprocedure);

-- 5. The role trigger and its function, and the payment-ledger trigger
select pg_get_functiondef('public.prevent_role_escalation()'::regprocedure);
select tgname, tgrelid::regclass, pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid in ('public.profiles'::regclass, 'public.payments'::regclass);

-- 6. Row-level security flags
select relname, relrowsecurity, relforcerowsecurity from pg_class where oid in ('public.profiles'::regclass,'public.permissions'::regclass,'public.user_permissions'::regclass,'public.audit_logs'::regclass);

-- 7. Can a staff user see their own permissions (F10)? List policies on user_permissions and staff accounts that hold permissions.
select p.email, p.role, count(up.*) as permission_rows from public.profiles p left join public.user_permissions up on up.user_id = p.id where p.role in ('staff','viewer') group by 1,2;

-- 8. Every SECURITY DEFINER function in public and who may execute it
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.proconfig as settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef order by 1;

-- 9. Can browser roles create objects in public (F8; want false/false)?
select has_schema_privilege('authenticated','public','CREATE') as auth_create, has_schema_privilege('anon','public','CREATE') as anon_create;

-- 10. Triggers on auth.users and their function bodies (F9: look for any that copies a role/permission from user-supplied metadata)
select t.tgname, pg_get_triggerdef(t.oid) from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
select p.proname, pg_get_functiondef(p.oid) from pg_proc p join pg_trigger t on t.tgfoid = p.oid where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;

-- 11. Public sign-up: Dashboard -> Authentication -> Providers/Settings -> "Allow new users to sign up" (F9; should be OFF
--     because D'Fabulous creates users only through the admin API). Not queryable from SQL.
```

## 7. Final recommendation

1. **Do not apply anything to production yet.** Run queries 1-10 on production (read-only) and check sign-up (11); they decide which findings are live.
2. Assume F1-F3 are exploitable until query 2 shows all `false`; **Proposal A is the highest-value fix** (tested; no application impact; both layers; reversible).
3. Apply **Proposal B** alongside A: it removes the fragile NULL-based behaviour and guarantees Owner role changes work whichever `is_owner()` variant is live.
4. Treat **F5/F6 (deactivation is not revocation)** as the next priority: Proposal C plus the application-level ban on deactivate. Until then offboard administrators by demoting and banning.
5. Verify F9 (sign-up/profile trigger) first. It is the only unknown that could be critical.
6. Stage everything (section 5); production only after staged sign-off and explicit approval, one proposal at a time, with the pre-state snapshot saved.
7. Candidate further hardening (not drafted, optional): the API already uses `service_role` for `messages`, `blocked_dates` and `site_settings`, so the direct `authenticated` grants/policies on those tables are unnecessary and could be removed; `bookings`/`payments` must keep user-token access because the API deliberately uses RLS as a backstop there.
