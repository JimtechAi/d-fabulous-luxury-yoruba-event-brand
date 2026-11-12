# Stage 4 security test matrix

Project: `dfabulous-staging` (`qwoxxroszmwobnzqgndr`). Source dump SHA-256 prefix: `f41bf2fe`.

**Every result below is SIMULATED.** The tests run the package SQL inside PGlite (an in-process PostgreSQL **18.6**, memory only, no network, no Supabase) with a hand-built emulation of a fresh Supabase project: roles `anon`, `authenticated`, `service_role` (BYPASSRLS), `supabase_admin`, an `auth` schema with `auth.users` and `auth.uid()` reading a session setting, and Supabase-style default privileges. Requests are emulated with `SET LOCAL ROLE` plus a session setting for the JWT subject.

**This does not prove behaviour on a real Supabase project.** It does not exercise PostgREST role switching, JWT validation, the connection pooler, Auth hooks or triggers on `auth.users`, dashboard-managed objects, or PostgreSQL 17.11 specifics. The staging tests in `STAGE4_INSTALLATION_RUNBOOK.md` section 2 are still required.

Personas (all seeded as schema-only test rows, `@example.test` addresses): `anon`; `user` and `viewer` (profile role `user`; the table CHECK has no `viewer` value, the API's "viewer" is `user` with no permissions); `staff`; `admin` (active); `adminInactive`; `owner` (active); `ownerInactive`; `service_role`.

Test files: `tests/stage4-baseline.test.mjs` (**Phase 1**: states `01` and `01+02`, rollbacks), `tests/stage4-hardened.test.mjs` (**Phase 2**: A, B, C each separately, then combined and rolled back), `tests/stage4-decisions.test.mjs` (**final decisions A, B, C**, service-role paths, payment audit, rollbacks), `tests/stage4-package.test.mjs` (static package checks). Phase 1 and Phase 2 are tested separately.

## 0. Final-decision scenarios (`tests/stage4-decisions.test.mjs`, all SIMULATED)

| Requirement | Test (title starts with) |
|---|---|
| Active Owner / active administrator access | `active Owner and active administrator keep full access` |
| Inactive Owner and inactive administrator denied (users, permissions, bookings, payments, audit, messages, blocked dates) | `an inactive Owner and an inactive administrator are denied` |
| Owner reactivation restores authority; account and permission rows preserved | `the Owner account and its permissions are preserved` |
| Admin suspended mid-session (valid JWT) is refused on the next request | `the same holds for an administrator suspended while holding a session` |
| Ordinary-user profile self-service: none in the database (names/passwords go through Supabase Auth); no browser role writes any profile column | `browser roles ... cannot write any column`; `no browser role holds any write privilege on profiles` |
| Self role escalation, self-reactivation prevented | same, plus hardened `TESTS 5, 6, 9` |
| Backend-authorised role change, deactivation, reactivation, rename | `backend-authorised changes work` |
| Service-role profile deletion with payments, bookings, audit rows and permissions present (A+B+C and Phase 1) | `profile deletion by the backend works even when ...` |
| Foreign-key `SET NULL` on `payments.user_id` passes the payments guard and is audited without an actor | `the foreign-key SET NULL on payments.user_id ...` |
| Service-role role changes (incl. the Owner); browser admin and Owner still refused; NULL/unknown identities never privileged | `role changes by the backend`; `NULL and unknown database roles` |
| Payment edit by active admin/Owner (7 columns) | `authorised, active administrators ... edit the 7 approved columns` |
| Payment edit denied: ordinary users, staff, viewers, inactive admin/Owner, anon; inactive admin refused by A alone | `ordinary users, staff, viewers ...`; `inactive administrators are refused by A alone` |
| Identifiers protected for every role, even with re-granted table UPDATE | `identifiers, the booking relationship ... are protected` |
| No DELETE/TRUNCATE; no table-level UPDATE; exact column grant | `no browser role can delete or truncate payments` |
| Payment audit: actor, time, payment, booking, changed fields, before/after; no row for an unchanged save; fail-closed; cannot be disabled or forged | `every edit is audited`; `the audit trail cannot be bypassed` |
| Existing insert workflow (`server.ts`/`admin-bookings.ts` column list) still works | `existing workflow compatibility` |
| Rollback of A (payments objects), independent rollbacks, ordered C-B-A; out-of-order refused | `rolling back A removes ...`; `independent and ordered rollbacks` |
| Baseline and hardened validation | `tests/stage4-baseline.test.mjs`; hardened `07 validation passes ...` (check `HA8` covers the payments design) |

Harness limit: the harness session user is a superuser, so `SET ROLE service_role` from a browser persona cannot be refused here; on Supabase the session user is `authenticator`, which is a member of the API roles (a documented limit, runbook section 4).

## 0a. Final security review scenarios (`tests/stage4-review.test.mjs`)

Kinds of evidence: **[STATIC]** reads repository files; **[SIMULATED]** runs the SQL in PGlite 18.x; **real Supabase / PostgreSQL 17.11 integration tests: none exist yet**.

| Review item | Kind | Test (title starts with) |
|---|---|---|
| 1 Reason required, validated in the database, kept out of the row, recorded in the audit event | SIMULATED | `missing, empty, blank, non-string and over-long reasons`; `a valid reason`; `an unchanged save`; `the setting that carries the reason cannot be forged` |
| 2 Profile-deletion context distinct from admin edits, no invented actor | SIMULATED | decisions: `profile deletion: the foreign-key SET NULL ...` (postgres and service_role) |
| 3 Audit confidentiality (Owner only; payer sees no reason or audit data) | SIMULATED + STATIC | `only the active Owner reads payment audit events`; `the payer of a payment`; `the application never returns audit_logs` |
| 4 Recursion, DEFINER hardening (hostile search_path), failure handling, atomic multi-row edits, no escalation | SIMULATED | `no recursion`; `the SECURITY DEFINER audit function`; `failure handling and consistency`; `no privilege escalation` |
| 5 Grant bypass: PUBLIC/other-role/column drift and writing functions detected by `HA9`; immutability survives a re-grant | SIMULATED + STATIC | `no other role, PUBLIC grant, function or service-role path`; `even if someone later grants`; `the service key has no application path` |
| 7 Credentials cannot reach the browser | STATIC | `browser source never reads`; `the Vite build refuses`; `server responses never include the key`; `a built bundle, if present` |
| 8 Deletion and role change with audit and rollback | SIMULATED | `deletion with audit ...` |
| 9 Rollback ordering (`01a` refuses under Phase 2) | SIMULATED | `01a (privilege rollback) refuses` |

## 1. The 24 required scenarios

"P1" = after Phase 1 (`01` + `02`, no Phase 2). "P2" = with the proposal(s) named.

| # | Scenario | P1 result | P2 result (proposal) | Test (title starts with) |
|---|---|---|---|---|
| 1 | Anonymous public service reading | allowed (2 rows; production policy `USING (true)` also exposes inactive services, preserved on purpose) | unchanged | baseline: `TEST 1`; hardened: `TESTS 1-3` |
| 2 | Anonymous access to administrative functions | `42501` for `purge_archived_bookings`, `block_event_date`, `unblock_event_date`, `get_event_availability`, `is_admin`, `is_owner`, `handle_new_user`; authenticated admins also refused | unchanged | `TEST 2` |
| 3 | Ordinary user reads own profile | own row only | own row only (A, C) | `TEST 3-6`; `ordinary users keep their own-profile access` |
| 4 | Ordinary user edits own permitted profile fields | **no field is directly editable** (no UPDATE privilege; the browser never writes profiles, name changes go through Auth metadata) | refused, also by RLS (A) | `TEST 3-6`; `TEST 6 + 4` |
| 5 | Ordinary user changes own role | refused | refused (A privilege/RLS; B trigger as a second layer) | `TEST 3-6`; `TESTS 5, 6, 9`; B: `TEST 9` |
| 6 | Ordinary user reactivates an inactive profile | refused | refused (A) | `TEST 3-6`; `TEST 6 + 4` |
| 7 | Admin reads permitted administrative records | bookings, payments, profiles readable | unchanged for an active admin | `TEST 7-10`; `TEST 7 + 17-20` |
| 8 | Admin attempts direct permission modification | refused (no privilege) | refused by privilege **and** RESTRICTIVE policy even if re-granted (A) | `TEST 7-10`; `TEST 8 + 9`; `RESTRICTIVE policies are necessary` |
| 9 | Admin attempts self-promotion | refused | refused (A); trigger refuses even with privilege re-granted (B, SQLSTATE `42501`) | `TEST 7-10`; B `TEST 9` |
| 10 | Admin attempts payment modification | UPDATE/DELETE refused (no privilege) in P1 — production's own policy allowed any admin to edit, but `02` removed the privilege | **Final decision C: allowed** for active admins/owner on the 7 approved columns (column-level grant + active-admin RESTRICTIVE policy + guard trigger + audit); refused for identifiers, DELETE, inactive admins and ordinary users (A) | `TEST 7-10`; `TEST 10 (final decision C)`; `tests/stage4-decisions.test.mjs` decision C |
| 11 | Owner role administration | via the browser: refused (no UPDATE privilege). Via the backend: **still rejected** (preserved production defect) | backend allowed (B); an authenticated active owner may change **another** account's role if privilege is ever re-granted; own role never | B `TEST 11`, `TEST 15` |
| 12 | Inactive admin attempts access | **still reads/updates bookings** (preserved production defect, documented) | refused on all 30 helper-based policies (C) | `TEST 12-13 (preserved...)`; C `TEST 12 + 13 after C` |
| 13 | Inactive owner attempts access | still reads/updates (preserved) | refused; `is_owner()` and `is_admin()` both false (C) | same |
| 14 | Service-role profile deletion | works (`DELETE` granted by `02`); bookings, payments, audit rows kept (SET NULL), permissions cascade, Auth user untouched | unchanged; deletion audit entry must carry the id in metadata (application correction) | `TEST 14`, `TEST 14b`; hardened `TESTS 14 + 15` |
| 15 | Service-role role change | **rejected** (production defect S1 preserved) | works, including the create-user upsert that changes a role (B) | `TEST 15 (preserved...)`; B `TEST 15` |
| 16 | Audit log protection | browser roles cannot insert/update/delete; service_role appends and reads, cannot update/delete/truncate; owner reads | plus RESTRICTIVE denies (A) | `TEST 16` (both files) |
| 17 | Booking creation | backend only; `DF-0001` reference generated; blocked-date trigger enforced | unchanged | `TEST 17`; `TEST 7 + 17-20` |
| 18 | Booking update | admin yes, staff and customers no | unchanged; suspended admin no (C) | `TEST 18-19`; C |
| 19 | Payment access | admin reads/inserts; customer reads own; nobody updates/deletes | admins edit the 7 approved columns with an audit row per change (A); nobody deletes | `TEST 18-19`; decisions C |
| 20 | Blocked-date management | backend insert/delete only; browser roles have no privilege | unchanged | `TEST 20` |
| 21 | Function EXECUTE privileges | exactly `is_admin`,`is_owner` -> authenticated; `purge_archived_bookings` -> service_role; none for anon or PUBLIC | unchanged | `TEST 21`; `TESTS 21-23 still hold` |
| 22 | TRUNCATE privilege restrictions | no TRUNCATE/TRIGGER/REFERENCES/MAINTAIN for any API role on any table; `TRUNCATE` refused for anon, user, admin, owner | unchanged | `TEST 22`; `TESTS 21-23 still hold` |
| 23 | Default privilege inheritance | a table, function or sequence created by `postgres` after `02` has **no** API-role privilege (and has them without `02`) | unchanged | `TEST 23` |
| 24 | Rollback restores prior state | `01a` restores schema, relation, function, column and default privileges exactly (twice in a row); `01` removes the baseline and restores schema/default privileges; refusals when data exists, when unconfirmed, or while Phase 2 is applied | C, B, A rollbacks restore policies, function definitions and ACLs exactly; out-of-order refused | `TEST 24` / rollback describe blocks; hardened `TEST 24` |

## 2. What the privilege matrix is based on (Phase 1, `02`)

Derived from the code, not from production's grants. "Token" = the caller's JWT (role `authenticated`); "service" = the service key.

| Table | authenticated | anon | service_role | Evidence |
|---|---|---|---|---|
| `bookings` | SELECT, UPDATE, DELETE | none | SELECT, INSERT, UPDATE | token: `admin-bookings.ts` 58-364, `server.ts` 919-1273; service: `public.ts` 128, archive `admin-bookings.ts` 164 |
| `payments` | SELECT, INSERT (+ column-level UPDATE on 7 columns from proposal A) | none | SELECT | token: `admin-bookings.ts` 435-487; service read: `admin-data.ts` 41-58 (no application path updates a payment today) |
| `profiles` | SELECT | none | SELECT, INSERT, UPDATE, **DELETE** | token read: `lib/auth.ts` 34, `server.ts` 470; service: `admin-users.ts`, `server.ts` 1889-2257 |
| `user_permissions` | SELECT | none | SELECT, INSERT, UPDATE, DELETE | token read: `lib/auth.ts` 72; upsert/delete via service |
| `permissions`, `audit_logs` | SELECT (existing narrow read policies) | none | none / SELECT, INSERT | `audit_logs` written only by `appendAuditLog` |
| `services` | SELECT | SELECT | SELECT | browser `src/lib/db.ts` 216/350; service `public.ts` 277 |
| `messages`, `site_settings`, `blocked_dates` | none | none | per code (S,I,U / S,I,U / S,I,D) | service only |
| `gallery`, `testimonials` | none | none | SELECT | service only |
| sequence `booking_reference_seq` | none | none | USAGE | trigger runs as the inserting role (service) |

Rule applied: grant exactly what the application exercises with each role, plus SELECT on three identity/audit tables whose narrow policies are deliberate. Policies on tables a browser role no longer touches (for example `Admins read messages`) stay in place and are simply inert; removing them is outside this package.

## 3. Proposal behaviour tables

**A: who can write what (browser roles)**

| Table | INSERT | UPDATE | DELETE | Mechanism |
|---|---|---|---|---|
| `profiles` | no | no | no | UPDATE policies dropped, RESTRICTIVE denies, privileges revoked |
| `user_permissions`, `permissions`, `audit_logs` | no | no | no | FOR ALL policy replaced by SELECT-only, RESTRICTIVE denies, privileges revoked |
| `payments` | admin yes | **active admin yes (7 columns, audited)** | no | RESTRICTIVE DELETE deny; RESTRICTIVE `stage4_require_active_admin_update`; column-level UPDATE grant; guard + audit triggers |

RESTRICTIVE policies are **necessary**, not decorative: `stage4-hardened.test.mjs` re-grants UPDATE and adds a permissive `USING (true)` policy; with the denies the table stays closed, and with them dropped the same sequence lets a suspended user reactivate themselves and an administrator self-grant a permission.

**B: `prevent_role_escalation()` decision table** (role actually changing)

| Caller (`current_user`) | Result |
|---|---|
| `service_role` | allowed |
| `authenticated`, active owner, target is another account | allowed |
| `authenticated`, owner, target is themselves | denied |
| `authenticated`, anyone else (admin, staff, user, inactive) | denied |
| `authenticated`, no `auth.uid()` (NULL) | denied (`IS TRUE` test; NULL is never Owner) |
| `anon`, `postgres`, `supabase_admin`, any other role | denied (break glass: `DISABLE TRIGGER`) |
| session sets `request.jwt.claim.role` / `request.jwt.claims` to `service_role` | denied (claims are not consulted) |

SECURITY INVOKER is deliberate (see the header of `05_security_B.sql`): `current_user` is the issuing role and cannot be set by `set_config()`. Tested limit: `SET ROLE service_role` is refused for a login that is not a member of it and allowed for the `authenticator` login, which is a member of all three API roles in Supabase; API requests cannot run `SET ROLE`, but that login and its password must remain secret.

**C: every policy that calls the helpers** (data-driven over `pg_policies`): before C, 26 of the 30 policies admit a suspended administrator or owner beyond their own row; after C, **all 30** (28 once A has removed three) evaluate identically for suspended administrators, suspended owners and an ordinary suspended user; every one still admits the active owner, and every non-owner-only one the active administrator.

## 4. Not covered here

PostgREST/JWT/pooler behaviour; `auth.users` triggers; Realtime; the Edge Function runtime; PostgreSQL 17.11 differences from 18.6 (for example planner and `pg_dump` header details); concurrency and lock behaviour of the DDL on a database under load; the `supabase_admin` default privileges when the `postgres` login is not allowed to change them (the simulation runs as a superuser, so that branch is only verified to raise a NOTICE by inspection).
