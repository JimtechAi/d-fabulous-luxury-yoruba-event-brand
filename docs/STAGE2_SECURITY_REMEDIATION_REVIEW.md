# Stage 2: Repository Security Reconciliation Review

**Scope:** reconcile the staging security remediation package (proposals A, B, C) with what the repository actually defines.
**Nothing here was executed against Supabase or any database server.** No production or staging project was contacted or created, no migration was run,
no environment variable or secret was changed, nothing was committed, pushed or deployed, and the Edge Function was not activated.
Automated tests run SQL only inside an **in-memory, in-process PostgreSQL (PGlite) that exists for the duration of a test and is then discarded**;
that is local test tooling, not a database in the sense of a server or project. If you intend the restriction to cover even that, the static suite
(`tests/proposal-consistency.test.mjs`, no SQL engine) remains valid on its own.

## 1. What the repository actually defines

| Object | Defined by | Actual definition (repository) |
|---|---|---|
| `public.profiles` | **No migration.** Only referenced. | Not defined anywhere. Referenced by `REFERENCES public.profiles(id)` (so `id` is a unique/PK uuid), `WHERE id = auth.uid()`, `role IN (...)`, `WHERE email = ...`; the application code reads/writes `id, email, full_name, role, is_active, created_at, updated_at`. **`profiles.is_active` is defined in no SQL file** (the only `is_active` in repository SQL is `services.is_active`). |
| `public.permissions` | `20260902_admin_permissions_migration.sql` | `id uuid PK default gen_random_uuid(), permission_key text NOT NULL UNIQUE, description text, created_at timestamptz NOT NULL default now()`; seeded with 17 keys; RLS on; SELECT policy `permissions_read_owner_admin` (profile role owner/admin); `service_role` S/I/U/D. |
| `public.user_permissions` | same | `id uuid PK, user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, permission_key text NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE, created_at, UNIQUE(user_id, permission_key)`; RLS on; **one policy `user_permissions_manage_owner_admin` `FOR ALL TO authenticated`** (profile role owner/admin, no `is_active`, no permission check); `service_role` S/I/U/D. |
| `public.audit_logs` | same | `id uuid PK, actor_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL, action text NOT NULL, target_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL, metadata jsonb NOT NULL default '{}', created_at`; RLS on; SELECT policy owner only; **INSERT policy `audit_logs_insert_owner_admin`** (owner/admin); `service_role` S/I/U/D. |
| `public.is_admin()` / `public.is_owner()` | **three** statements: `20260814_admin_rls_privileges.sql` (plpgsql `RETURN EXISTS (...)`, returns `false`); `security_remediation_migration.sql` (plpgsql `SELECT role INTO v_role ... RETURN v_role IN (...)` / `v_role = 'owner'`, **returns NULL without `auth.uid()`**, `EXCEPTION WHEN OTHERS THEN RETURN false`); grants changed by `20260819_public_data_access_hardening.sql` (EXECUTE for `authenticated` only, revoked from PUBLIC/anon) | The effective body is the **last one applied**. The repository does not record the order: README lists `security_remediation_migration.sql` first and does not list `20260814`; filename order would run `security_remediation_migration.sql` last. Both orders are therefore tested. |
| `public.prevent_role_escalation()` + `trg_prevent_role_escalation` | `security_remediation_migration.sql` only | `SECURITY DEFINER`, `SET search_path = public, pg_temp`; `IF NEW.role IS DISTINCT FROM OLD.role THEN IF NOT public.is_owner() THEN RAISE EXCEPTION ...`; `BEFORE UPDATE ON public.profiles FOR EACH ROW`. `EXECUTE` revoked from PUBLIC/anon/authenticated by `20260902_final_security_hardening.sql`. |

Other policies on `profiles` (`security_remediation_migration.sql`, `20260814`): `Users view profile` (SELECT: own row or `is_admin()`), `Users update own profile` (UPDATE: own row or `is_owner()`); table grants: `REVOKE ALL FROM PUBLIC, anon`, `GRANT SELECT TO authenticated` (`20260819`), `GRANT SELECT, INSERT, UPDATE, DELETE TO service_role` (`20260902_final_security_hardening.sql`). **No repository statement revokes INSERT/UPDATE/DELETE from `authenticated`** on `profiles`, `user_permissions` or `audit_logs`.

## 2. How the application accesses these tables (enforced by `tests/proposal-consistency.test.mjs`)

| Path | Tables / verbs |
|---|---|
| Caller's own token (RLS applies to the caller) | `profiles` SELECT, `user_permissions` SELECT, `bookings` SELECT/UPDATE/DELETE, `payments` SELECT/INSERT |
| `service_role` (server only) | every write to `profiles`, `user_permissions`, `permissions`, `audit_logs`; also `messages`, `blocked_dates`, `site_settings`, `bookings` INSERT, public reads |
| Browser (anon key) | `services` SELECT only; no writes, no RPC |

The test asserts these sets exactly (a new user-token call to another table, or any user-token write to the identity tables, fails the suite), that all writes to the identity tables use the service client, that `app_metadata.role` is never used for authorisation and that payments are never updated.

## 3. What was already correct

* RLS is enabled on every table involved; `anon` has no privilege on `profiles`.
* Browser roles cannot change roles (the trigger rejects admin/viewer self-promotion under both `is_owner()` variants); staff/viewers cannot write `user_permissions` or `audit_logs`; admins cannot update other users' profile rows; `permissions` has no write policy.
* The service key is server-only; every identity-table write in the application uses it; the API's user-token paths touch only the tables listed above.
* `bookings`/`payments` policies depend on `is_admin()`/`is_owner()` and keep working for active administrators and the Owner under every proposal.
* The Express and Edge user-management hierarchy (`lib/userPolicy.ts`) is enforced before any database write.

## 4. Weaknesses confirmed (all reproduced by `tests/db-stage2-security.test.mjs`)

| # | Weakness | Condition |
|---|---|---|
| W1 | Any administrator (even suspended, even without `users.manage`) can read/write `user_permissions` directly: privileged self-grant, stripping others' permissions | `authenticated` holds table privileges (Supabase default; not revoked in the repository). Without them: *permission denied* (tested). |
| W2 | Any administrator can forge `audit_logs` rows | same |
| W3 | Any user can update their own profile row: a suspended account can **re-activate itself**; email/name tampering | same |
| W4 | Role-change trigger depends on which `is_owner()` is live: **NULL variant** lets the API (service_role) through only because `NOT NULL` is not true (fragile, and the same NULL disables the payment-ledger guard for service_role); **false variant** rejects every API role change, including the Owner's | order of migrations (unrecorded) |
| W5 | A suspended administrator keeps full database-level admin access (bookings read/update, payments insert, profiles list) because RLS checks the role only | repository grants (certain) |
| W6 | The RLS helpers and the trigger treat the *absence of a profile* as "not owner" inconsistently (NULL vs false) | variant |

## 5. Comparison of proposals A, B, C with the repository: inconsistencies found and corrected

| # | Inconsistency in the previous package | Correction |
|---|---|---|
| 1 | The test fixture invented `profiles` columns/defaults (`last_sign_in_at`, `role DEFAULT 'viewer'`, `NOT NULL`s) | Fixture now creates only evidenced columns, no defaults/NOT NULLs, only the primary key needed by the repository's foreign keys; the evidence is listed in `tests/helpers/db-fixture.mjs` |
| 2 | Docs claimed no SQL mentions `is_active` | Corrected: `services.is_active` exists; **`profiles.is_active` is defined nowhere**; proposal C keeps a column-existence preflight and a static test pins the claim |
| 3 | A **granted** `SELECT` to `authenticated` and re-asserted `service_role` grants | Removed. A now only revokes; no privilege is ever added |
| 4 | A hard-coded the read predicate of the new `user_permissions` SELECT policy and created it unconditionally | A reuses the **live** predicate and roles of the policy it replaces and creates nothing if that policy is absent (tested) |
| 5 | B named roles the repository never mentions (`postgres`, `supabase_admin`) | B allows `current_user = 'service_role'` only; the SQL-editor/`postgres` exception is gone (documented behaviour change under the NULL variant) |
| 6 | B recreated the trigger (`DROP/CREATE TRIGGER`) and re-asserted `REVOKE` on the function | B replaces only the function body (`CREATE OR REPLACE` keeps the trigger and the ACL) and aborts if the function/trigger/`is_owner()` are absent: it never creates security objects |
| 7 | B/C used `IF NOT is_owner()` semantics that fail open on NULL | B uses `public.is_owner() IS NOT TRUE`; C returns strict booleans |
| 8 | C re-asserted function grants | Removed; `CREATE OR REPLACE` preserves ACLs |
| 9 | C silently changed the payment-ledger guard (same NULL pattern, `20260818:134`) | Documented as an intended side effect; the app never updates payments (static test) |
| 10 | Rollbacks restored **guessed** definitions from the repository | Replaced by **snapshot-driven exact rollbacks** (see below) |
| 11 | Two real script bugs found by the new tests: a constant `::regprocedure` cast evaluated before the existence check (B and C preflights), and `pg_temp` helper functions colliding when two proposals run in one session | Fixed (variables + `DROP FUNCTION IF EXISTS`/cleanup) |

### Exact rollback design
Each forward script stores, **once** (a re-run never overwrites it), the pre-change catalogue state in `public.security_remediation_snapshots` (owner-only: RLS on, no policies, all privileges revoked from PUBLIC/anon/authenticated/service_role): RLS flags, every policy (as a `CREATE POLICY` statement rebuilt from `pg_policies`), table grants for PUBLIC/anon/authenticated/service_role (from `aclexplode`), function definitions (`pg_get_functiondef`) and function grants. The rollbacks re-apply exactly that, so the result is correct whichever `is_owner()` variant or grant set was live, and they **abort without changes if no snapshot exists** (tested). Verified for each proposal alone and combined, in both variants, by comparing the full catalogue before and after (policies, grants, RLS flags, function bodies and ACLs, trigger) with `assert.deepEqual`. Limits: column-level grants and trigger enabled-state are not captured (the repository defines none).

## 6. The package

| File | Purpose |
|---|---|
| `supabase/proposals/20261112_00_inspect_readonly.sql` | read-only catalogue inspection (definitions, columns, constraints, policies, grants, triggers, `auth.users` triggers) |
| `supabase/proposals/20261112_a_restrict_direct_identity_writes.sql` / `.rollback.sql` | A: closes W1-W3 (RLS **and** privileges) |
| `supabase/proposals/20261112_b_role_trigger_allow_service_role.sql` / `.rollback.sql` | B: resolves W4/W6 explicitly |
| `supabase/proposals/20261112_c_rls_helpers_require_active.sql` / `.rollback.sql` | C (optional): closes W5; requires B |
| `supabase/proposals/20261112_99_verify_readonly.sql` | read-only verification, one row per check |
| `tests/helpers/db-fixture.mjs`, `tests/db-stage2-security.test.mjs`, `tests/proposal-consistency.test.mjs` | automated regression tests |
| `docs/STAGE2_STAGING_VALIDATION.md` | staging execution procedure (not executed) |

Order: A, B, then optionally C. Rollback: C, B, A. All scripts are single transactions with `lock_timeout = 5s`, idempotent, and are **not** in `supabase/migrations/`.

## 7. Test coverage of the requested areas (`tests/db-stage2-security.test.mjs`, run under **both** `is_owner()` variants)

| Requirement | Tests |
|---|---|
| Owner-only administrator creation and promotion | Trusted API creates profiles/promotes/demotes (works under both variants after B); no browser role (anon, viewer, staff, admin, **even the Owner**) can create a profile or change a role; upsert-conflict promotion only via the API; trigger still rejects browser role changes even if privileges and policies were re-opened (second layer). Application-level Owner-only rules: `tests/express-server.test.mjs`, Deno `user-management.test.ts` |
| Admin restrictions | Admins cannot write profiles/user_permissions/audit_logs or TRUNCATE; keep the reads the API needs (profiles list, own permissions, permission catalogue); audit log stays owner-only |
| Privileged permission management | Only the trusted API can grant/revoke privileged keys; the Owner's own token cannot either; FK rejects unknown keys; deletion cascades |
| Profile self-reactivation prevention | baseline reproduces it; denied after A for staff and admins; the API can still re-activate |
| Suspended account access | baseline: suspended admin keeps bookings/payments access; A+B: limitation stated explicitly; A+B+C: no `is_admin()`, no bookings, no payments, own profile row still readable so the API answers 403; `NULL is_active` stays active; re-activation restores access |
| Audit-log integrity | no browser-role INSERT/UPDATE/DELETE/TRUNCATE (Owner included); Owner reads, admin cannot; API appends; deleting a user keeps their audit rows (actor NULL) and is not blocked |
| Trusted service-role operations | full create → permissions → audit → update → delete sequence; role changes under both variants; works after A+B+C |
| Registration role restrictions | no browser role can insert a profile with any role (before/after A: no INSERT policy exists, and A adds an explicit deny); API creation path works; the repository defines no sign-up trigger (nothing invented; verified read-only by inspection query 9 on staging) |
| Exact rollback / idempotency / safety | catalogue equality after rollback (A, B, A+B, A+B+C, both variants), re-apply, apply twice, snapshot privacy, preflight refusals, rollback refusal without snapshot, B-before-C ordering |
| Read-only scripts | inspect script changes nothing; verify script fails at baseline and passes after A+B+C |
| Static reconciliation | no invented table/column/constraint/role/GRANT; every dropped policy exists in repository SQL; only repository roles; application access patterns pinned |

## 8. Existing functionality: will it break?

| Area | Impact | Evidence |
|---|---|---|
| Bookings (public submission, admin read/update/delete) | None. Public submission uses the service key; admin paths use the caller's token against `bookings` policies, which the proposals do not modify. Active admins and the Owner still pass `is_admin()`/`is_owner()` | tests "application regression", "active administrators ... unaffected" |
| Payments (record, list, totals) | None for active administrators; payments are insert/select only; owner-only update/delete policies unchanged. C additionally applies the immutability guard to service_role/SQL editor, which the app never uses | tests; static test "never updates payments" |
| User management (create/promote/demote/suspend/delete) | Works through the API (service_role). Role changes now work under both helper variants (B). **Direct** profile/permission writes by any browser role stop (intended; the app never made them) | tests "complete user-management sequence", static pattern test |
| Dashboard access / admin login | Unchanged: reads of own `profiles` row and own `user_permissions` use the caller's token and SELECT access is untouched | tests "admin reads the API depends on" |
| Suspended staff/admin | API already answers 403; with C the database agrees | tests |
| Public site | No impact: browser uses `services` SELECT only | static test |

## 9. Unresolved technical risks (cannot be settled without a real database)

1. **Live state is unknown:** which `is_owner()` variant, the real `profiles` DDL, `authenticated` privileges, other policies (A's restrictive policies neutralise unknown permissive ones, but unknown *objects* such as sign-up triggers are only found by running `20261112_00_inspect_readonly.sql`).
2. **Sign-up path (critical unknown):** the repository defines none. If public sign-up is enabled and a trigger on `auth.users` copies a user-supplied role into `profiles`, that bypasses everything here. Inspect (query 9) and disable sign-ups if unused.
3. **Behaviour change under the NULL variant:** after B the SQL editor (`postgres`) can no longer change roles without disabling the trigger (documented, deliberate).
4. **C requires `profiles.is_active` to exist** (refuses otherwise) and changes the payment-ledger guard for service_role/SQL editor.
5. **Session lifetime:** suspending a user does not end their Auth session (C blocks database access but not the API's own `getUser` success; the API still refuses via `is_active`). An application-level ban on deactivation is still recommended (not implemented).
6. **service_role is trusted:** it can still alter `audit_logs`; true append-only audit would need a trigger that distinguishes `ON DELETE SET NULL` foreign-key updates and was left out as risky for user deletion.
7. **PGlite is not Supabase:** real Supabase default privileges, PostgREST role switching (`current_user = 'service_role'` is what B relies on), pooler behaviour and lock contention can only be confirmed on staging.
8. **Lock behaviour:** `REVOKE`, `CREATE POLICY` and `CREATE OR REPLACE FUNCTION` take brief table/catalogue locks; scripts fail fast (`lock_timeout`) rather than queue.

## 10. Readiness decision

**The package is ready for staging execution**, subject to the staging procedure in `docs/STAGE2_STAGING_VALIDATION.md` (which begins with read-only inspection to resolve risks 1-2 before anything is changed). It is **not** ready for production: no script has run on a real Supabase project.
