// Stage 2 database security regression tests (in-memory PostgreSQL via PGlite; no real database, no network).
// Fixture: tests/helpers/db-fixture.mjs (repository SQL verbatim; see its header for what is and is not invented).
// Every behaviour is exercised under BOTH variants of the repository's is_owner()/is_admin() bodies, because the migration
// order that produced the live database is not recorded in the repository.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  ID, RLS_OR_PRIVILEGE, applyProposals, as, buildDatabase, catalog, count, inspectSql, proposals, rollbackProposals, verifySql,
} from './helpers/db-fixture.mjs';

const VARIANTS = [
  { variant: 'null', label: 'is_owner() returns NULL without auth.uid() (security_remediation applied last)' },
  { variant: 'exists', label: 'is_owner() returns false without auth.uid() (20260814 applied last)' },
];

const denied = (db, role, sub, statement, pattern = RLS_OR_PRIVILEGE) =>
  assert.rejects(() => as(db, role, sub, statement), pattern, `${role}/${sub ?? '-'} must be denied: ${statement}`);
const grant = (userId, key) => `INSERT INTO public.user_permissions (user_id, permission_key) VALUES ('${userId}', '${key}')`;
const PRIVILEGE_ESCALATION = /Privilege escalation denied/;

/** A failed script leaves PGlite inside the aborted BEGIN...COMMIT block; roll it back like an operator would. */
async function failsCleanly(db, statement, pattern) {
  await assert.rejects(() => db.exec(statement), pattern);
  await db.exec('ROLLBACK');
}

for (const { variant, label } of VARIANTS) {
  describe(`[${variant}] ${label}`, () => {
    // -------------------------------------------------------------------------------------------------------------
    describe('BASELINE (repository state with Supabase default table privileges): confirmed weaknesses', () => {
      let db;
      before(async () => { db = await buildDatabase({ variant }); });
      after(async () => { await db.close(); });

      test('any administrator, even a suspended one, can write user_permissions directly (privileged self-grant)', async () => {
        await as(db, 'authenticated', ID.ADMIN, grant(ID.ADMIN, 'users.manage'));
        await as(db, 'authenticated', ID.ADMIN_SUSPENDED, grant(ID.ADMIN_SUSPENDED, 'payments.manage'));
        assert.equal(await count(db, "SELECT 1 FROM public.user_permissions WHERE permission_key IN ('users.manage','payments.manage')"), 2);
        await db.exec("DELETE FROM public.user_permissions WHERE permission_key IN ('users.manage','payments.manage')");
      });

      test('any administrator can forge audit-log rows', async () => {
        await as(db, 'authenticated', ID.ADMIN, `INSERT INTO public.audit_logs (actor_user_id, action) VALUES ('${ID.OWNER}', 'user.deleted')`);
        assert.equal(await count(db, "SELECT 1 FROM public.audit_logs WHERE action = 'user.deleted'"), 1);
        await db.exec('DELETE FROM public.audit_logs');
      });

      test('a suspended user can re-activate their own account directly', async () => {
        await as(db, 'authenticated', ID.STAFF_SUSPENDED, `UPDATE public.profiles SET is_active = true WHERE id = '${ID.STAFF_SUSPENDED}'`);
        assert.equal(await count(db, `SELECT 1 FROM public.profiles WHERE id = '${ID.STAFF_SUSPENDED}' AND is_active`), 1);
        await db.exec(`UPDATE public.profiles SET is_active = false WHERE id = '${ID.STAFF_SUSPENDED}'`);
      });

      test('a suspended administrator keeps full database-level admin access (bookings and payments)', async () => {
        assert.equal((await as(db, 'authenticated', ID.ADMIN_SUSPENDED, 'SELECT public.is_admin() AS v')).rows[0].v, true);
        assert.equal((await as(db, 'authenticated', ID.ADMIN_SUSPENDED, 'SELECT id FROM public.bookings')).rows.length, 1);
        await as(db, 'authenticated', ID.ADMIN_SUSPENDED, `INSERT INTO public.payments (user_id) VALUES ('${ID.ADMIN_SUSPENDED}')`);
        await db.exec('DELETE FROM public.payments');
      });

      test('browser roles cannot change roles (existing protection) and staff cannot see or pay anything', async () => {
        await assert.rejects(() => as(db, 'authenticated', ID.ADMIN, `UPDATE public.profiles SET role = 'owner' WHERE id = '${ID.ADMIN}'`), PRIVILEGE_ESCALATION);
        await assert.rejects(() => as(db, 'authenticated', ID.VIEWER, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.VIEWER}'`), PRIVILEGE_ESCALATION);
        assert.equal((await as(db, 'authenticated', ID.STAFF, 'SELECT id FROM public.bookings')).rows.length, 0);
        await denied(db, 'authenticated', ID.STAFF, `INSERT INTO public.payments (user_id) VALUES ('${ID.STAFF}')`);
      });

      test(variant === 'null'
        ? 'the trusted API (service_role) can change roles today only because NULL fails open'
        : 'the trusted API (service_role) cannot change roles today: every API role change, including the Owner\'s, is rejected', async () => {
        const promote = () => as(db, 'service_role', null, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.STAFF}'`);
        if (variant === 'null') {
          assert.equal((await db.query('SELECT public.is_owner() IS NULL AS n')).rows[0].n, true);
          await promote();
          await db.exec(`UPDATE public.profiles SET role = 'staff' WHERE id = '${ID.STAFF}'`);
        } else {
          assert.equal((await db.query('SELECT public.is_owner() AS v')).rows[0].v, false);
          await assert.rejects(promote, PRIVILEGE_ESCALATION);
        }
      });
    });

    // -------------------------------------------------------------------------------------------------------------
    describe('WITHOUT default grants the direct-write findings are blocked by privileges (condition for exploitability)', () => {
      let db;
      before(async () => { db = await buildDatabase({ variant, supabaseDefaults: false }); });
      after(async () => { await db.close(); });

      test('direct writes fail with "permission denied" when authenticated has no table privileges', async () => {
        await denied(db, 'authenticated', ID.ADMIN, grant(ID.ADMIN, 'users.manage'), /permission denied/i);
        await denied(db, 'authenticated', ID.ADMIN, "INSERT INTO public.audit_logs (action) VALUES ('x')", /permission denied/i);
        await denied(db, 'authenticated', ID.STAFF_SUSPENDED, `UPDATE public.profiles SET is_active = true WHERE id = '${ID.STAFF_SUSPENDED}'`, /permission denied/i);
      });
    });

    // -------------------------------------------------------------------------------------------------------------
    describe('PROPOSALS A + B (recommended package)', () => {
      let db;
      before(async () => { db = await buildDatabase({ variant }); await applyProposals(db, 'A', 'B'); });
      after(async () => { await db.close(); });

      // ---- Owner-only administrator creation and promotion -------------------------------------------------
      test('registration: the trusted API creates profiles with any role (the hierarchy is enforced in lib/userPolicy.ts before this point)', async () => {
        await as(db, 'service_role', null, `INSERT INTO public.profiles (id, email, role, is_active) VALUES ('${ID.NEW_USER}', 'new@example.test', 'admin', true)`);
        assert.equal(await count(db, `SELECT 1 FROM public.profiles WHERE id = '${ID.NEW_USER}' AND role = 'admin'`), 1);
        await db.exec(`DELETE FROM public.profiles WHERE id = '${ID.NEW_USER}'`);
      });

      test('registration: no browser role (anon, authenticated viewer/staff/admin/owner) can create a profile, so none can choose a role', async () => {
        const insert = (role) => `INSERT INTO public.profiles (id, email, role, is_active) VALUES ('${ID.NEW_USER}', 'x@example.test', '${role}', true)`;
        await denied(db, 'anon', null, insert('owner'));
        for (const [sub, role] of [[ID.VIEWER, 'admin'], [ID.STAFF, 'owner'], [ID.ADMIN, 'owner'], [ID.OWNER, 'owner']]) {
          await denied(db, 'authenticated', sub, insert(role));
        }
        assert.equal(await count(db, `SELECT 1 FROM public.profiles WHERE id = '${ID.NEW_USER}'`), 0);
      });

      test('registration: the upsert conflict path (a profile row already exists) can still be promoted by the trusted API, never by browser roles', async () => {
        await as(db, 'service_role', null, `INSERT INTO public.profiles (id, email, role, is_active) VALUES ('${ID.STAFF}', 'staff@example.test', 'admin', true) ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`);
        assert.equal(await count(db, `SELECT 1 FROM public.profiles WHERE id = '${ID.STAFF}' AND role = 'admin'`), 1);
        await as(db, 'service_role', null, `UPDATE public.profiles SET role = 'staff' WHERE id = '${ID.STAFF}'`);
        await denied(db, 'authenticated', ID.ADMIN, `INSERT INTO public.profiles (id, email, role) VALUES ('${ID.STAFF}', 's', 'owner') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`);
      });

      test('promotion: the trusted API can promote and demote (Owner-initiated operations work whichever is_owner() variant is live)', async () => {
        await as(db, 'service_role', null, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.STAFF}'`);
        await as(db, 'service_role', null, `UPDATE public.profiles SET role = 'staff' WHERE id = '${ID.STAFF}'`);
        await as(db, 'service_role', null, `UPDATE public.profiles SET role = 'viewer' WHERE id = '${ID.ADMIN2}'`);
        await as(db, 'service_role', null, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.ADMIN2}'`);
      });

      test('promotion: administrators, staff, viewers and even the Owner cannot promote anyone directly (only the API path exists)', async () => {
        for (const [sub, target] of [[ID.ADMIN, ID.STAFF], [ID.ADMIN, ID.ADMIN], [ID.STAFF, ID.STAFF], [ID.VIEWER, ID.VIEWER], [ID.ADMIN_SUSPENDED, ID.ADMIN_SUSPENDED], [ID.OWNER, ID.STAFF]]) {
          await denied(db, 'authenticated', sub, `UPDATE public.profiles SET role = 'owner' WHERE id = '${target}'`);
        }
        await denied(db, 'anon', null, `UPDATE public.profiles SET role = 'owner' WHERE id = '${ID.VIEWER}'`);
        assert.equal(await count(db, "SELECT 1 FROM public.profiles WHERE role = 'owner'"), 1);
      });

      test('the trigger itself still rejects a browser-role role change even if privileges were re-granted (second layer)', async () => {
        await db.exec('GRANT UPDATE ON public.profiles TO authenticated');
        await db.exec('DROP POLICY deny_direct_update ON public.profiles');
        await db.exec('CREATE POLICY temp_permissive ON public.profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true)');
        await assert.rejects(() => as(db, 'authenticated', ID.ADMIN, `UPDATE public.profiles SET role = 'owner' WHERE id = '${ID.ADMIN}'`), PRIVILEGE_ESCALATION);
        await assert.rejects(() => as(db, 'authenticated', ID.VIEWER, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.VIEWER}'`), PRIVILEGE_ESCALATION);
        // Restore exactly what proposal A created for the following tests.
        await db.exec('DROP POLICY temp_permissive ON public.profiles');
        await db.exec('CREATE POLICY deny_direct_update ON public.profiles AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false)');
        await db.exec('REVOKE UPDATE ON public.profiles FROM authenticated');
      });

      // ---- Admin restrictions ------------------------------------------------------------------------------
      test('admin restrictions: no direct write to profiles, user_permissions or audit_logs; no TRUNCATE', async () => {
        for (const sub of [ID.ADMIN, ID.ADMIN2]) {
          await denied(db, 'authenticated', sub, grant(sub, 'users.manage'));
          await denied(db, 'authenticated', sub, `DELETE FROM public.user_permissions WHERE user_id = '${ID.STAFF}'`);
          await denied(db, 'authenticated', sub, `UPDATE public.profiles SET email = 'x@example.test' WHERE id = '${ID.STAFF}'`);
          await denied(db, 'authenticated', sub, "INSERT INTO public.audit_logs (action) VALUES ('forged')");
          await denied(db, 'authenticated', sub, 'TRUNCATE public.user_permissions');
        }
        assert.equal(await count(db, `SELECT 1 FROM public.user_permissions WHERE user_id = '${ID.STAFF}'`), 1);
      });

      test('admin reads the API depends on keep working: profiles list, own permissions, permission catalogue; audit log stays owner-only', async () => {
        assert.ok((await as(db, 'authenticated', ID.ADMIN, 'SELECT id FROM public.profiles')).rows.length >= 7);
        assert.equal((await as(db, 'authenticated', ID.ADMIN, `SELECT permission_key FROM public.user_permissions WHERE user_id = '${ID.ADMIN}'`)).rows.length, 1);
        assert.equal((await as(db, 'authenticated', ID.ADMIN, 'SELECT permission_key FROM public.permissions')).rows.length, 17);
        assert.equal((await as(db, 'authenticated', ID.ADMIN, 'SELECT id FROM public.audit_logs')).rows.length, 0);
        assert.equal((await as(db, 'authenticated', ID.STAFF, `SELECT role FROM public.profiles WHERE id = '${ID.STAFF}'`)).rows[0].role, 'staff', 'own-row read used by getAuthenticatedAdminUser');
        assert.equal((await as(db, 'authenticated', ID.STAFF, 'SELECT id FROM public.profiles')).rows.length, 1, 'non-admins still see only their own row');
      });

      // ---- Privileged permission management ---------------------------------------------------------------
      test('privileged permissions: only the trusted API can grant or revoke them; the foreign key rejects unknown keys', async () => {
        for (const key of ['users.manage', 'users.view', 'settings.manage', 'payments.manage']) {
          await denied(db, 'authenticated', ID.ADMIN, grant(ID.STAFF, key));
          await denied(db, 'authenticated', ID.OWNER, grant(ID.STAFF, key));
          await as(db, 'service_role', null, grant(ID.STAFF, key));
        }
        assert.equal(await count(db, `SELECT 1 FROM public.user_permissions WHERE user_id = '${ID.STAFF}'`), 5);
        await as(db, 'service_role', null, `DELETE FROM public.user_permissions WHERE user_id = '${ID.STAFF}' AND permission_key LIKE '%.manage'`);
        assert.equal(await count(db, `SELECT 1 FROM public.user_permissions WHERE user_id = '${ID.STAFF}'`), 2);
        await assert.rejects(() => as(db, 'service_role', null, grant(ID.STAFF, 'users.superpower')), /foreign key|violates/i);
        await db.exec(`DELETE FROM public.user_permissions WHERE user_id = '${ID.STAFF}' AND permission_key <> 'bookings.view'`);
      });

      // ---- Self-reactivation / suspended accounts --------------------------------------------------------
      test('self-reactivation: suspended users cannot re-activate themselves; the trusted API can', async () => {
        for (const sub of [ID.STAFF_SUSPENDED, ID.ADMIN_SUSPENDED]) {
          await denied(db, 'authenticated', sub, `UPDATE public.profiles SET is_active = true WHERE id = '${sub}'`);
        }
        await denied(db, 'authenticated', ID.VIEWER, `UPDATE public.profiles SET is_active = false WHERE id = '${ID.VIEWER}'`);
        await as(db, 'service_role', null, `UPDATE public.profiles SET is_active = true WHERE id = '${ID.STAFF_SUSPENDED}'`);
        await as(db, 'service_role', null, `UPDATE public.profiles SET is_active = false WHERE id = '${ID.STAFF_SUSPENDED}'`);
      });

      test('suspended accounts (A+B only): documented limitation, the suspended administrator still passes is_admin() until proposal C', async () => {
        assert.equal((await as(db, 'authenticated', ID.ADMIN_SUSPENDED, 'SELECT public.is_admin() AS v')).rows[0].v, true);
      });

      // ---- Audit-log integrity ---------------------------------------------------------------------------
      test('audit-log integrity: browser roles cannot insert, update, delete or truncate; only the trusted API appends', async () => {
        await as(db, 'service_role', null, `INSERT INTO public.audit_logs (actor_user_id, action, metadata) VALUES ('${ID.OWNER}', 'user.role_changed', '{"to":"admin"}')`);
        for (const sub of [ID.OWNER, ID.ADMIN, ID.STAFF]) {
          await denied(db, 'authenticated', sub, "INSERT INTO public.audit_logs (action) VALUES ('forged')");
          await denied(db, 'authenticated', sub, "UPDATE public.audit_logs SET action = 'tampered'");
          await denied(db, 'authenticated', sub, 'DELETE FROM public.audit_logs');
          await denied(db, 'authenticated', sub, 'TRUNCATE public.audit_logs');
        }
        await denied(db, 'anon', null, "INSERT INTO public.audit_logs (action) VALUES ('forged')");
        assert.equal((await as(db, 'authenticated', ID.OWNER, 'SELECT action FROM public.audit_logs')).rows[0].action, 'user.role_changed', 'the Owner can still read it');
        assert.equal((await as(db, 'authenticated', ID.ADMIN, 'SELECT action FROM public.audit_logs')).rows.length, 0, 'administrators cannot');
        await db.exec('DELETE FROM public.audit_logs');
      });

      test('audit-log integrity: deleting a user through the API keeps their audit rows (actor set to NULL) and is not blocked by the new policies', async () => {
        await as(db, 'service_role', null, `INSERT INTO public.profiles (id, email, role, is_active) VALUES ('${ID.NEW_USER}', 'tmp@example.test', 'staff', true)`);
        await as(db, 'service_role', null, grant(ID.NEW_USER, 'bookings.view'));
        await as(db, 'service_role', null, `INSERT INTO public.audit_logs (actor_user_id, action) VALUES ('${ID.NEW_USER}', 'user.created')`);
        await as(db, 'service_role', null, `DELETE FROM public.profiles WHERE id = '${ID.NEW_USER}'`);
        assert.equal(await count(db, `SELECT 1 FROM public.user_permissions WHERE user_id = '${ID.NEW_USER}'`), 0, 'permissions cascade');
        const logs = await db.query("SELECT actor_user_id FROM public.audit_logs WHERE action = 'user.created'");
        assert.equal(logs.rows.length, 1);
        assert.equal(logs.rows[0].actor_user_id, null);
        await db.exec('DELETE FROM public.audit_logs');
      });

      // ---- Trusted service-role operations ---------------------------------------------------------------
      test('trusted service_role: the complete user-management sequence used by the API still works', async () => {
        await as(db, 'service_role', null, `INSERT INTO public.profiles (id, email, full_name, role, is_active) VALUES ('${ID.NEW_USER}', 'seq@example.test', 'Seq', 'staff', true)`);
        await as(db, 'service_role', null, `INSERT INTO public.user_permissions (user_id, permission_key) VALUES ('${ID.NEW_USER}', 'bookings.view'), ('${ID.NEW_USER}', 'messages.view') ON CONFLICT (user_id, permission_key) DO NOTHING`);
        await as(db, 'service_role', null, `INSERT INTO public.audit_logs (actor_user_id, action, target_user_id, metadata) VALUES ('${ID.OWNER}', 'user.created', '${ID.NEW_USER}', '{}')`);
        await as(db, 'service_role', null, `UPDATE public.profiles SET role = 'viewer', is_active = false WHERE id = '${ID.NEW_USER}'`);
        await as(db, 'service_role', null, `DELETE FROM public.user_permissions WHERE user_id = '${ID.NEW_USER}'`);
        assert.equal((await as(db, 'service_role', null, 'SELECT id FROM public.profiles')).rows.length, 8);
        assert.equal((await as(db, 'service_role', null, `SELECT id FROM public.audit_logs`)).rows.length, 1);
        await as(db, 'service_role', null, `DELETE FROM public.profiles WHERE id = '${ID.NEW_USER}'`);
        await db.exec('DELETE FROM public.audit_logs');
      });

      // ---- Existing application functionality ------------------------------------------------------------
      test('application regression: bookings and payments policies behave exactly as before (user-token paths of the API)', async () => {
        assert.equal((await as(db, 'authenticated', ID.ADMIN, 'SELECT id FROM public.bookings')).rows.length, 1);
        assert.equal((await as(db, 'authenticated', ID.ADMIN, 'UPDATE public.bookings SET id = id')).affectedRows, 1);
        await as(db, 'authenticated', ID.ADMIN, `INSERT INTO public.payments (user_id) VALUES ('${ID.ADMIN}')`);
        await denied(db, 'authenticated', ID.ADMIN, `INSERT INTO public.payments (user_id) VALUES ('${ID.STAFF}')`);
        assert.equal((await as(db, 'authenticated', ID.ADMIN, 'SELECT id FROM public.payments')).rows.length, 1);
        assert.equal((await as(db, 'authenticated', ID.ADMIN, 'UPDATE public.payments SET user_id = user_id')).affectedRows, 0, 'payments UPDATE is owner-only');
        assert.equal((await as(db, 'authenticated', ID.OWNER, 'UPDATE public.payments SET user_id = user_id')).affectedRows, 1);
        assert.equal((await as(db, 'authenticated', ID.STAFF, 'SELECT id FROM public.bookings')).rows.length, 0);
        await db.exec('DELETE FROM public.payments');
      });
    });

    // -------------------------------------------------------------------------------------------------------------
    describe('PROPOSALS A + B + C (suspended accounts lose database-level access)', () => {
      let db;
      before(async () => { db = await buildDatabase({ variant }); await applyProposals(db, 'A', 'B', 'C'); });
      after(async () => { await db.close(); });

      test('suspended administrator: not admin, no bookings, no payments; can still read their own profile row (so the API can answer 403)', async () => {
        assert.equal((await as(db, 'authenticated', ID.ADMIN_SUSPENDED, 'SELECT public.is_admin() AS a, public.is_owner() AS o')).rows[0].a, false);
        assert.equal((await as(db, 'authenticated', ID.ADMIN_SUSPENDED, 'SELECT id FROM public.bookings')).rows.length, 0);
        assert.equal((await as(db, 'authenticated', ID.ADMIN_SUSPENDED, 'UPDATE public.bookings SET id = id')).affectedRows, 0);
        await denied(db, 'authenticated', ID.ADMIN_SUSPENDED, `INSERT INTO public.payments (user_id) VALUES ('${ID.ADMIN_SUSPENDED}')`);
        assert.equal((await as(db, 'authenticated', ID.ADMIN_SUSPENDED, 'SELECT id FROM public.profiles')).rows.length, 1);
        assert.equal((await as(db, 'authenticated', ID.ADMIN_SUSPENDED, `SELECT is_active FROM public.profiles WHERE id = '${ID.ADMIN_SUSPENDED}'`)).rows[0].is_active, false);
      });

      test('active administrators and the Owner are unaffected; NULL is_active still counts as active (same as the API)', async () => {
        assert.equal((await as(db, 'authenticated', ID.ADMIN, 'SELECT public.is_admin() AS v')).rows[0].v, true);
        assert.equal((await as(db, 'authenticated', ID.OWNER, 'SELECT public.is_owner() AS v')).rows[0].v, true);
        assert.equal((await as(db, 'authenticated', ID.ADMIN, 'SELECT id FROM public.bookings')).rows.length, 1);
        await db.exec(`UPDATE public.profiles SET is_active = NULL WHERE id = '${ID.ADMIN2}'`);
        assert.equal((await as(db, 'authenticated', ID.ADMIN2, 'SELECT public.is_admin() AS v')).rows[0].v, true);
        await db.exec(`UPDATE public.profiles SET is_active = true WHERE id = '${ID.ADMIN2}'`);
      });

      test('helpers are strict booleans now and stay executable by authenticated only', async () => {
        assert.equal((await db.query('SELECT public.is_owner() AS v')).rows[0].v, false);
        assert.equal((await db.query('SELECT has_function_privilege(\'anon\', \'public.is_admin()\', \'EXECUTE\') AS a, has_function_privilege(\'authenticated\', \'public.is_admin()\', \'EXECUTE\') AS b')).rows[0].a, false);
      });

      test('the trusted API still promotes, demotes, suspends and re-activates after C', async () => {
        await as(db, 'service_role', null, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.STAFF}'`);
        await as(db, 'service_role', null, `UPDATE public.profiles SET role = 'staff' WHERE id = '${ID.STAFF}'`);
        await as(db, 'service_role', null, `UPDATE public.profiles SET is_active = true WHERE id = '${ID.ADMIN_SUSPENDED}'`);
        assert.equal((await as(db, 'authenticated', ID.ADMIN_SUSPENDED, 'SELECT public.is_admin() AS v')).rows[0].v, true, 're-activation restores access');
        await as(db, 'service_role', null, `UPDATE public.profiles SET is_active = false WHERE id = '${ID.ADMIN_SUSPENDED}'`);
      });
    });

    // -------------------------------------------------------------------------------------------------------------
    describe('ROLLBACK is exact and reversible', () => {
      for (const [label, stages] of [['A', ['A']], ['B', ['B']], ['A+B', ['A', 'B']], ['A+B+C', ['A', 'B', 'C']]]) {
        test(`apply ${label}, roll back in reverse order: the catalogue is identical to the original (policies, grants, RLS flags, function bodies and ACLs, trigger)`, async () => {
          const db = await buildDatabase({ variant });
          try {
            const original = await catalog(db);
            await applyProposals(db, ...stages);
            assert.notDeepEqual(await catalog(db), original, 'the proposals did change something');
            await rollbackProposals(db, ...[...stages].reverse());
            assert.deepEqual(await catalog(db), original);
          } finally { await db.close(); }
        });
      }

      test('after a full rollback the original weaknesses and variant behaviour are back exactly as the baseline describes, and everything can be re-applied', async () => {
        const db = await buildDatabase({ variant });
        try {
          const original = await catalog(db);
          await applyProposals(db, 'A', 'B', 'C');
          await rollbackProposals(db, 'C', 'B', 'A');
          await as(db, 'authenticated', ID.ADMIN, grant(ID.ADMIN, 'users.manage'));
          await db.exec("DELETE FROM public.user_permissions WHERE permission_key = 'users.manage'");
          assert.equal((await as(db, 'authenticated', ID.ADMIN_SUSPENDED, 'SELECT public.is_admin() AS v')).rows[0].v, true);
          await applyProposals(db, 'A', 'B', 'C');
          await rollbackProposals(db, 'C', 'B', 'A');
          assert.deepEqual(await catalog(db), original, 're-apply + rollback again still restores the ORIGINAL state (snapshots are never overwritten)');
        } finally { await db.close(); }
      });

      test('applying a proposal twice is idempotent and does not corrupt the snapshot (rollback still restores the true original)', async () => {
        const db = await buildDatabase({ variant });
        try {
          const original = await catalog(db);
          for (const name of ['A', 'B', 'C']) { await applyProposals(db, name); await applyProposals(db, name); }
          const afterTwice = await catalog(db);
          await applyProposals(db, 'A', 'B', 'C');
          assert.deepEqual(await catalog(db), afterTwice, 'a third application changes nothing');
          await rollbackProposals(db, 'C', 'B', 'A');
          assert.deepEqual(await catalog(db), original);
        } finally { await db.close(); }
      });

      test('the snapshot table is unreadable by every role the application uses', async () => {
        const db = await buildDatabase({ variant });
        try {
          await applyProposals(db, 'A');
          for (const [role, sub] of [['anon', null], ['authenticated', ID.OWNER], ['authenticated', ID.ADMIN], ['service_role', null]]) {
            await denied(db, role, sub, 'SELECT * FROM public.security_remediation_snapshots', /permission denied/i);
          }
          assert.ok((await db.query('SELECT count(*)::int AS n FROM public.security_remediation_snapshots')).rows[0].n > 0, 'the table owner can read it');
        } finally { await db.close(); }
      });
    });

    // -------------------------------------------------------------------------------------------------------------
    describe('SAFETY: preflight checks and refusals', () => {
      test('rollbacks refuse to run without a snapshot and change nothing', async () => {
        const db = await buildDatabase({ variant });
        try {
          await db.exec('CREATE TABLE IF NOT EXISTS public.security_remediation_snapshots (proposal text NOT NULL, kind text NOT NULL, object_name text NOT NULL, definition text NOT NULL, captured_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (proposal, kind, object_name))');
          const original = await catalog(db);
          for (const name of ['A', 'B', 'C']) await failsCleanly(db, proposals[name].down, /No (complete )?snapshot/i);
          assert.deepEqual(await catalog(db), original);
        } finally { await db.close(); }
      });

      test('B refuses to run unless the role trigger already exists (it never creates security objects)', async () => {
        const db = await buildDatabase({ variant });
        try {
          await db.exec('DROP TRIGGER trg_prevent_role_escalation ON public.profiles');
          await failsCleanly(db, proposals.B.up, /Preflight failed/);
          await db.exec('DROP FUNCTION public.prevent_role_escalation()');
          await failsCleanly(db, proposals.B.up, /Preflight failed/);
        } finally { await db.close(); }
      });

      test('C refuses to run without B, and without the profiles.is_active column', async () => {
        const db = await buildDatabase({ variant });
        try {
          await failsCleanly(db, proposals.C.up, /apply proposal B/i);
          await applyProposals(db, 'B');
          await db.exec('ALTER TABLE public.profiles DROP COLUMN is_active');
          await failsCleanly(db, proposals.C.up, /is_active does not exist/);
        } finally { await db.close(); }
      });

      test('B cannot be rolled back while C is applied', async () => {
        const db = await buildDatabase({ variant });
        try {
          await applyProposals(db, 'A', 'B', 'C');
          await failsCleanly(db, proposals.B.down, /roll back C before B/i);
          await rollbackProposals(db, 'C', 'B', 'A');
        } finally { await db.close(); }
      });

      test('A refuses to run when the identity tables are missing', async () => {
        const empty = new PGlite();
        try {
          await empty.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
          await failsCleanly(empty, proposals.A.up, /Preflight failed/);
        } finally { await empty.close(); }
      });

      test('A does not create a read policy when the user_permissions FOR ALL policy does not exist (no access is invented)', async () => {
        const db = await buildDatabase({ variant });
        try {
          await db.exec('DROP POLICY "user_permissions_manage_owner_admin" ON public.user_permissions');
          await applyProposals(db, 'A');
          assert.equal(await count(db, "SELECT 1 FROM pg_policies WHERE tablename = 'user_permissions' AND cmd = 'SELECT'"), 0);
        } finally { await db.close(); }
      });
    });

    // -------------------------------------------------------------------------------------------------------------
    describe('READ-ONLY scripts', () => {
      test('the inspection script runs and changes nothing; the verification script reports the stage correctly', async () => {
        const db = await buildDatabase({ variant });
        try {
          const original = await catalog(db);
          const results = await db.exec(inspectSql);
          assert.ok(results.length >= 9);
          assert.deepEqual(await catalog(db), original, 'inspection is read-only');

          const verify = async () => Object.fromEntries((await db.query(verifySql)).rows.map((row) => [row.check_name, row.ok]));
          const baseline = await verify();
          for (const name of [
            'A: authenticated/anon/PUBLIC hold no write privilege on the identity tables',
            'A: anon holds no privilege at all on the identity tables',
            'A: no permissive write policy remains on profiles, user_permissions, audit_logs',
            'A: nine restrictive deny policies are present',
            'B: prevent_role_escalation() is SECURITY INVOKER, pins search_path and allows service_role',
            'C: is_admin() and is_owner() require an active profile',
            'ALL: the snapshot table exists and browser roles and service_role cannot read it',
          ]) assert.equal(baseline[name], false, `baseline must fail: ${name}`);

          await applyProposals(db, 'A', 'B', 'C');
          const applied = await verify();
          assert.deepEqual(Object.entries(applied).filter(([, ok]) => !ok), [], 'every check passes after A+B+C');
          assert.deepEqual(await catalog(db).then((c) => c.rls), original.rls);
        } finally { await db.close(); }
      });
    });
  });
}
