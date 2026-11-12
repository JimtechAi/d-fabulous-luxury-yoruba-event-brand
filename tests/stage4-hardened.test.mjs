// STAGE 4, PHASE 2 tests: adapted proposals A, B and C (supabase/staging/install/04..07, rollback/02..04), each separately and combined.
// ALL RESULTS ARE SIMULATED in PGlite (PostgreSQL 18.x, in memory, no network, no Supabase). In particular PostgREST role switching, JWT handling, pooling and
// Auth hooks are emulated with SET ROLE + set_config('request.jwt.claim.sub'); a real Supabase staging test is still required.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { ID, INSTALL, PERSONA, ROLLBACK, asUser, attempt, blocked, denied, freshSupabase, installBaseline, runScript, seedPersonas, tablePriv } from './helpers/stage4-db.mjs';

const PHASE2 = { A: '04_security_A.sql', B: '05_security_B.sql', C: '06_security_C.sql' };
const UNDO = { A: '02_rollback_security_A.sql', B: '03_rollback_security_B.sql', C: '04_rollback_security_C.sql' };

async function build(proposals, { extra = '' } = {}) {
  const db = await freshSupabase();
  await installBaseline(db);
  await runScript(db, INSTALL('02_privilege_normalisation.sql'));
  await seedPersonas(db);
  await db.exec(`
    INSERT INTO public.gallery (title, image_url, alt_text) VALUES ('g', 'u', 'a');
    INSERT INTO public.testimonials (quote, client_names, event_type) VALUES ('q', 'c', 'wedding');
    INSERT INTO public.site_settings (key, value, updated_by) VALUES ('k', '{}', '${ID.ADMIN}');
    INSERT INTO public.blocked_dates (event_date, created_by) VALUES ('2027-07-01', '${ID.ADMIN}'), ('2027-07-02', '${ID.OWNER}'), ('2027-07-03', '${ID.ADMIN_INACTIVE}'), ('2027-07-04', '${ID.OWNER_INACTIVE}');
  `);
  if (extra) await db.exec(extra);
  for (const p of proposals) await runScript(db, INSTALL(PHASE2[p]));
  return db;
}
const validation = async (db) => (await db.exec(INSTALL('07_validate_hardened.sql'))).flatMap((r) => r.rows ?? []).filter((r) => r.check_id);
const policyState = async (db) => JSON.stringify((await db.query(`SELECT tablename, policyname, cmd, permissive, roles::text, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2`)).rows);
const functionState = async (db) => JSON.stringify((await db.query(`SELECT proname, prosecdef, proconfig::text, pg_get_functiondef(oid) d FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('is_admin', 'is_owner', 'prevent_role_escalation') ORDER BY 1`)).rows);
const tableAcl = async (db) => JSON.stringify((await db.query(`SELECT n, array_agg(g ORDER BY g) g FROM (SELECT c.relname n, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || ':' || a.privilege_type g FROM pg_class c, aclexplode(c.relacl) a WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r') q GROUP BY n ORDER BY n`)).rows);

/** Evaluates each policy's boolean expression as a given identity over the seeded rows (no privileges involved: this isolates the RLS predicate). */
async function policyCounts(db) {
  const policies = (await db.query(`SELECT tablename t, policyname n, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND permissive = 'PERMISSIVE' AND (coalesce(qual, '') ~ 'is_(admin|owner)\\(\\)' OR coalesce(with_check, '') ~ 'is_(admin|owner)\\(\\)') ORDER BY 1, 2`)).rows;
  const personas = { admin: ID.ADMIN, owner: ID.OWNER, adminInactive: ID.ADMIN_INACTIVE, ownerInactive: ID.OWNER_INACTIVE, userInactive: ID.USER_INACTIVE, user: ID.USER, staff: ID.STAFF };
  const out = [];
  for (const p of policies) {
    const expr = p.qual ?? p.with_check;
    const counts = {};
    for (const [name, sub] of Object.entries(personas)) {
      await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub]);
      counts[name] = (await db.query(`SELECT count(*)::int n FROM public.${p.t} WHERE (${expr})`)).rows[0].n;
    }
    out.push({ table: p.t, name: p.n, cmd: p.cmd, adminOnly: !/is_owner\(\)/.test(expr) || /is_admin\(\)/.test(expr), ownerOnly: /is_owner\(\)/.test(expr) && !/is_admin\(\)/.test(expr), ...counts });
  }
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  return out;
}

describe('[SIMULATED] proposal A: direct identity, permission, audit and ledger writes', () => {
  let db;
  before(async () => { db = await build(['A']); });

  test('TEST 6 + 4: no profile can be edited, reactivated or deleted through the database by any browser role, including admins and the owner', async () => {
    for (const [persona, target] of [[PERSONA.userInactive, ID.USER_INACTIVE], [PERSONA.user, ID.USER], [PERSONA.admin, ID.ADMIN], [PERSONA.admin, ID.OWNER], [PERSONA.owner, ID.USER_INACTIVE], [PERSONA.adminInactive, ID.ADMIN_INACTIVE]]) {
      assert.ok(denied(await attempt(db, persona, `UPDATE public.profiles SET is_active = true WHERE id = '${target}'`)), `${persona.sub} -> ${target}`);
      assert.ok(denied(await attempt(db, persona, `UPDATE public.profiles SET full_name = 'x', email = 'y@example.test' WHERE id = '${target}'`)), `fields ${persona.sub} -> ${target}`);
    }
    assert.ok(denied(await attempt(db, PERSONA.admin, `INSERT INTO public.profiles (id, role) VALUES ('${ID.ADMIN}', 'owner')`)));
    assert.ok(denied(await attempt(db, PERSONA.owner, `DELETE FROM public.profiles WHERE id = '${ID.USER}'`)));
  });

  test('TEST 8 + 9: administrators cannot modify permissions (their own or anyone\'s) and cannot self-promote', async () => {
    for (const sql of [`INSERT INTO public.user_permissions (user_id, permission_key) VALUES ('${ID.ADMIN}', 'bookings.manage')`, `UPDATE public.user_permissions SET permission_key = 'users.manage' WHERE user_id = '${ID.STAFF}'`, `DELETE FROM public.user_permissions WHERE user_id = '${ID.ADMIN}'`, `INSERT INTO public.permissions (permission_key) VALUES ('evil')`, `UPDATE public.profiles SET role = 'owner' WHERE id = '${ID.ADMIN}'`]) {
      for (const persona of [PERSONA.admin, PERSONA.owner, PERSONA.staff]) assert.ok(denied(await attempt(db, persona, sql)), `${persona.sub}: ${sql}`);
    }
  });

  test('legitimate reads are preserved: staff and viewers read their own permissions, active admins/owner read permission data, the owner reads audit logs', async () => {
    assert.deepEqual((await attempt(db, PERSONA.staff, 'SELECT permission_key FROM public.user_permissions')).rows, [{ permission_key: 'bookings.manage' }], 'staff reads only their own rows');
    assert.equal((await attempt(db, PERSONA.viewer, 'SELECT * FROM public.user_permissions')).rows.length, 0);
    assert.equal((await attempt(db, PERSONA.admin, 'SELECT * FROM public.user_permissions')).rows.length, 2, 'active admin reads all permission rows');
    assert.equal((await attempt(db, PERSONA.adminInactive, 'SELECT * FROM public.user_permissions')).rows.length, 0, 'a suspended admin reads nothing');
    assert.equal((await attempt(db, PERSONA.admin, 'SELECT * FROM public.permissions')).rows.length, 2);
    assert.equal((await attempt(db, PERSONA.owner, 'SELECT * FROM public.audit_logs')).rows.length, 1);
    assert.equal((await attempt(db, PERSONA.user, 'SELECT id FROM public.profiles')).rows.length, 1, 'users still read their own profile');
    assert.equal((await attempt(db, PERSONA.admin, 'SELECT id FROM public.profiles')).rows.length, Object.keys(ID).length, 'admins still list profiles');
  });

  test('TEST 16: audit_logs cannot be written, rewritten or deleted from a browser; service_role appends and reads only', async () => {
    for (const persona of [PERSONA.anon, PERSONA.user, PERSONA.admin, PERSONA.owner]) for (const sql of [`INSERT INTO public.audit_logs (action) VALUES ('forged')`, `UPDATE public.audit_logs SET action = 'x'`, `DELETE FROM public.audit_logs`]) assert.ok(denied(await attempt(db, persona, sql)), `${persona.role}: ${sql}`);
    assert.ok((await attempt(db, PERSONA.service, `INSERT INTO public.audit_logs (action) VALUES ('svc')`)).ok);
    for (const sql of [`UPDATE public.audit_logs SET action = 'x'`, `DELETE FROM public.audit_logs`]) assert.ok(denied(await attempt(db, PERSONA.service, sql)), sql);
  });

  test('TEST 10 (final decision C): payments: active admins and the owner read, insert and edit the 7 editable columns; nobody deletes; ordinary users cannot edit', async () => {
    assert.ok((await attempt(db, PERSONA.admin, `INSERT INTO public.payments (booking_id, user_id, amount, provider) SELECT id, '${ID.USER}', 5, 'manual' FROM public.bookings LIMIT 1`)).ok);
    for (const persona of [PERSONA.admin, PERSONA.owner]) {
      assert.equal((await attempt(db, persona, `UPDATE public.payments SET amount = 1, status = 'successful', metadata = metadata || '{"adjustment_reason":"test"}' RETURNING id`)).count, 1, `${persona.sub} edits`);
      assert.ok(denied(await attempt(db, persona, `DELETE FROM public.payments`)), `${persona.sub} cannot delete`);
    }
    for (const persona of [PERSONA.user, PERSONA.staff, PERSONA.viewer, PERSONA.userInactive, PERSONA.anon]) assert.ok(blocked(await attempt(db, persona, `UPDATE public.payments SET amount = 1`)), `${persona.role}/${persona.sub} cannot edit`);
  });

  test('service_role keeps the operations the application needs on the proposal A tables', async () => {
    for (const sql of [`SELECT * FROM public.profiles`, `UPDATE public.profiles SET is_active = false WHERE id = '${ID.STAFF}'`, `INSERT INTO public.user_permissions (user_id, permission_key) VALUES ('${ID.VIEWER}', 'bookings.manage')`, `DELETE FROM public.user_permissions WHERE user_id = '${ID.STAFF}'`, `SELECT * FROM public.audit_logs`]) {
      const r = await attempt(db, PERSONA.service, sql); assert.ok(r.ok, `${sql}: ${r.message}`);
    }
  });

  test('RESTRICTIVE policies are necessary: a permissive write policy plus a re-grant reopens the table without them and cannot with them', async () => {
    const reopen = `GRANT UPDATE, INSERT, DELETE ON public.profiles, public.user_permissions TO authenticated;
      CREATE POLICY evil_update ON public.profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
      CREATE POLICY evil_all ON public.user_permissions FOR ALL TO authenticated USING (true) WITH CHECK (true);`;
    const hardened = await build(['A'], {});
    await hardened.exec(reopen);
    assert.ok(blocked(await attempt(hardened, PERSONA.userInactive, `UPDATE public.profiles SET is_active = true WHERE id = '${ID.USER_INACTIVE}'`)), 'with restrictive denies the reopened table stays closed');
    assert.ok(blocked(await attempt(hardened, PERSONA.admin, `INSERT INTO public.user_permissions (user_id, permission_key) VALUES ('${ID.ADMIN}', 'bookings.manage')`)));
    const unprotected = await build(['A']);
    await unprotected.exec(`DROP POLICY stage4_deny_update ON public.profiles; DROP POLICY stage4_deny_insert ON public.user_permissions;`);
    await unprotected.exec(reopen);
    const r = await attempt(unprotected, PERSONA.userInactive, `UPDATE public.profiles SET is_active = true WHERE id = '${ID.USER_INACTIVE}' RETURNING id`);
    assert.equal(r.ok && r.count, 1, 'without the restrictive policy the evil permissive policy reopens self-reactivation');
    assert.ok((await attempt(unprotected, PERSONA.admin, `INSERT INTO public.user_permissions (user_id, permission_key) VALUES ('${ID.ADMIN}', 'bookings.manage')`)).ok, 'and the self-grant');
  });

  test('A repairs privilege drift by itself (it does not rely on 02): re-granted browser privileges are revoked again', async () => {
    const d = await build([], { extra: `GRANT ALL ON public.profiles, public.user_permissions, public.permissions, public.audit_logs, public.payments TO authenticated, anon; GRANT ALL ON public.audit_logs TO service_role;` });
    await runScript(d, INSTALL('04_security_A.sql'));
    for (const t of ['profiles', 'user_permissions', 'permissions', 'audit_logs']) {
      assert.deepEqual(await tablePriv(d, 'anon', t), [], `anon ${t}`);
      assert.deepEqual((await tablePriv(d, 'authenticated', t)).filter((p) => p !== 'SELECT'), [], `authenticated ${t}`);
    }
    assert.deepEqual((await tablePriv(d, 'authenticated', 'payments')).sort(), ['INSERT', 'SELECT']);
    assert.deepEqual((await tablePriv(d, 'service_role', 'audit_logs')).sort(), ['INSERT', 'SELECT']);
  });

  test('A is idempotent and its rollback restores the exact policies and privileges', async () => {
    const d = await build([]);
    const policies = await policyState(d); const acl = await tableAcl(d);
    await runScript(d, INSTALL('04_security_A.sql'));
    const applied = await policyState(d);
    await runScript(d, INSTALL('04_security_A.sql'));
    assert.equal(await policyState(d), applied, 'second run changes nothing');
    assert.notEqual(applied, policies);
    await runScript(d, ROLLBACK(UNDO.A));
    assert.equal(await policyState(d), policies);
    assert.equal(await tableAcl(d), acl);
    await assert.rejects(() => runScript(d, ROLLBACK(UNDO.A)), /not recorded as applied/);
  });
});

describe('[SIMULATED] proposal B: role-change trigger', () => {
  let open; let prod;
  before(async () => {
    // "open" = proposal B on a database where authenticated can still UPDATE profiles (proposal A absent / privilege re-granted): exercises the trigger itself.
    open = await build(['B'], { extra: `GRANT UPDATE ON public.profiles TO authenticated;` });
    prod = await build([], { extra: `GRANT UPDATE ON public.profiles TO authenticated;` });
  });

  test('TEST 15: service_role role changes now succeed, including the create-user upsert that changes a role', async () => {
    assert.equal((await attempt(open, PERSONA.service, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.STAFF}' RETURNING id`)).count, 1);
    assert.equal((await attempt(open, PERSONA.service, `INSERT INTO public.profiles (id, email, role) VALUES ('${ID.STAFF}', 'z@example.test', 'owner') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role RETURNING id`)).count, 1);
    const before = await attempt(prod, PERSONA.service, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.STAFF}'`);
    assert.equal(before.ok, false, 'control: the production trigger rejects the same statement');
  });

  test('TEST 9: an administrator cannot promote themselves or anyone else; nobody changes their own role, not even the owner', async () => {
    for (const [persona, target, role] of [[PERSONA.admin, ID.ADMIN, 'owner'], [PERSONA.admin, ID.STAFF, 'admin'], [PERSONA.admin, ID.OWNER, 'user'], [PERSONA.user, ID.USER, 'admin'], [PERSONA.staff, ID.STAFF, 'admin'], [PERSONA.owner, ID.OWNER, 'user']]) {
      const r = await attempt(open, persona, `UPDATE public.profiles SET role = '${role}' WHERE id = '${target}'`);
      assert.equal(r.ok, false, `${persona.sub} -> ${target}`);
      assert.equal(r.code, '42501');
    }
  });

  test('TEST 11: the owner administers other accounts\' roles; unrelated profile updates are not affected by the trigger', async () => {
    assert.equal((await attempt(open, PERSONA.owner, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.STAFF}' RETURNING id`)).count, 1);
    assert.equal((await attempt(open, PERSONA.admin, `UPDATE public.profiles SET full_name = 'New Name' WHERE id = '${ID.STAFF}' RETURNING id`)).count, 1);
  });

  test('NULL is never treated as Owner; SQL-editor roles and unknown roles are denied; the role cannot be spoofed through claims or SET ROLE', async () => {
    const anonymousLike = await attempt(open, { role: 'authenticated', sub: null }, `UPDATE public.profiles SET role = 'owner' WHERE id = '${ID.STAFF}' RETURNING id`);
    assert.ok(blocked(anonymousLike), 'no identity: RLS hides the row (0 rows) or the trigger denies; never allowed');
    assert.equal(anonymousLike.count, 0);
    const editor = await asUser(open, { role: 'postgres', sub: null }, async (tx) => tx.query(`UPDATE public.profiles SET role = 'owner' WHERE id = '${ID.STAFF}'`).then(() => 'allowed', (e) => e.code));
    assert.equal(editor, '42501', 'the SQL editor (postgres) is denied; break glass is DISABLE TRIGGER');
    const spoofClaim = await asUser(open, PERSONA.admin, async (tx) => {
      await tx.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);
      await tx.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
      return tx.query(`UPDATE public.profiles SET role = 'owner' WHERE id = '${ID.ADMIN}'`).then(() => 'allowed', (e) => e.code);
    });
    assert.equal(spoofClaim, '42501', 'claims cannot impersonate service_role');
    // SET ROLE is checked against the SESSION user. Emulate PostgREST (session user = authenticator, member of all three API roles) and a login that is not.
    await open.exec(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator_sim') THEN CREATE ROLE authenticator_sim NOLOGIN NOINHERIT; GRANT anon, authenticated, service_role TO authenticator_sim; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plain_login_sim') THEN CREATE ROLE plain_login_sim NOLOGIN NOINHERIT; GRANT authenticated TO plain_login_sim; END IF; END $$;`);
    const setRole = (login) => open.transaction(async (tx) => {
      await tx.exec(`SET LOCAL SESSION AUTHORIZATION ${login}; SET LOCAL ROLE authenticated`);
      const r = await tx.exec('SET LOCAL ROLE service_role').then(() => 'allowed', (e) => e.code);
      await tx.rollback();
      return r;
    }).catch((e) => e.code);
    assert.equal(await setRole('plain_login_sim'), '42501', 'a login that is not a member of service_role cannot become it');
    assert.equal(await setRole('authenticator_sim'), 'allowed', 'documented limit: the authenticator login can; it must stay secret (API requests cannot run SET ROLE)');
  });

  test('design properties: SECURITY INVOKER, empty search_path, strict IS TRUE test, no claim-based identity, unchanged trigger and ACL', async () => {
    const f = (await open.query(`SELECT prosecdef, proconfig, pg_get_functiondef(oid) d FROM pg_proc WHERE proname = 'prevent_role_escalation'`)).rows[0];
    assert.equal(f.prosecdef, false);
    assert.deepEqual(f.proconfig, ['search_path=""']);
    assert.match(f.d, /current_user = 'service_role'/);
    assert.match(f.d, /public\.is_owner\(\) IS TRUE/);
    assert.doesNotMatch(f.d, /request\.jwt|auth\.role\(\)/);
    const t = (await open.query(`SELECT tgenabled, tgtype FROM pg_trigger WHERE tgname = 'trg_prevent_role_escalation'`)).rows[0];
    assert.equal(t.tgenabled, 'O');
    for (const role of ['anon', 'authenticated', 'service_role']) assert.equal((await open.query(`SELECT has_function_privilege($1, 'public.prevent_role_escalation()', 'EXECUTE') ok`, [role])).rows[0].ok, false);
  });

  test('B is independent (applies without A and C), idempotent, and its rollback restores the production function exactly', async () => {
    const d = await build([]);
    const before = await functionState(d);
    await runScript(d, INSTALL('05_security_B.sql'));
    const applied = await functionState(d);
    await runScript(d, INSTALL('05_security_B.sql'));
    assert.equal(await functionState(d), applied);
    assert.notEqual(applied, before);
    await runScript(d, ROLLBACK(UNDO.B));
    assert.equal(await functionState(d), before);
    assert.equal((await attempt(d, PERSONA.service, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.STAFF}'`)).ok, false, 'the production defect is back after the rollback');
  });
});

describe('[SIMULATED] proposal C: active-account enforcement', () => {
  let before_; let after_;
  before(async () => { before_ = await build(['B']); after_ = await build(['B', 'C']); });

  test('C refuses to run without B', async () => {
    const d = await build([]);
    await assert.rejects(() => runScript(d, INSTALL('06_security_C.sql')), /proposal B .* not applied/);
  });

  test('the finding is reproduced before C: 26 of the 30 helper-based policies admit a suspended administrator/owner beyond their own row; after C none does', async () => {
    const pre = await policyCounts(before_);
    assert.equal(pre.length, 30);
    const leaking = pre.filter((p) => p.adminInactive > p.userInactive || p.ownerInactive > p.userInactive);
    assert.equal(leaking.length, 26, leaking.map((p) => p.name).join(', '));
    const post = await policyCounts(after_);
    assert.equal(post.length, 30);
    for (const p of post) {
      assert.equal(p.adminInactive, p.userInactive, `${p.table}: ${p.name} still admits a suspended administrator`);
      assert.equal(p.ownerInactive, p.userInactive, `${p.table}: ${p.name} still admits a suspended owner`);
    }
  });

  test('TEST 12 + 13 after C: suspended administrators and owners lose every administrative read and write; active ones keep them', async () => {
    for (const persona of [PERSONA.adminInactive, PERSONA.ownerInactive]) {
      assert.equal((await attempt(after_, persona, 'SELECT id FROM public.bookings')).rows.length, 0);
      assert.equal((await attempt(after_, persona, 'SELECT id FROM public.payments')).rows.length, 0);
      assert.equal((await attempt(after_, persona, `UPDATE public.bookings SET status = 'confirmed' RETURNING id`)).count, 0);
      assert.equal((await attempt(after_, persona, `DELETE FROM public.bookings RETURNING id`)).count, 0);
      assert.ok(blocked(await attempt(after_, persona, `INSERT INTO public.payments (booking_id, user_id, amount, provider) SELECT id, '${ID.USER}', 1, 'manual' FROM public.bookings LIMIT 1`)));
      assert.equal((await attempt(after_, persona, 'SELECT * FROM public.audit_logs')).rows.length, 0);
    }
    assert.equal((await attempt(before_, PERSONA.adminInactive, 'SELECT id FROM public.bookings')).rows.length, 1, 'control: before C the suspended admin reads bookings');
    assert.equal((await attempt(after_, PERSONA.admin, 'SELECT id FROM public.bookings')).rows.length, 1);
    assert.equal((await attempt(after_, PERSONA.owner, 'SELECT * FROM public.audit_logs')).rows.length, 1);
    assert.equal((await attempt(after_, PERSONA.owner, `UPDATE public.bookings SET status = 'confirmed' RETURNING id`)).count, 1);
    assert.deepEqual((await attempt(after_, PERSONA.owner, 'SELECT public.is_owner() o, public.is_admin() a')).rows, [{ o: true, a: true }]);
    assert.deepEqual((await attempt(after_, PERSONA.admin, 'SELECT public.is_owner() o, public.is_admin() a')).rows, [{ o: false, a: true }]);
    assert.deepEqual((await attempt(after_, PERSONA.ownerInactive, 'SELECT public.is_owner() o, public.is_admin() a')).rows, [{ o: false, a: false }]);
  });

  test('ordinary users keep their own-profile access, including suspended users; unknown identities get false, never NULL', async () => {
    assert.deepEqual((await attempt(after_, PERSONA.user, 'SELECT id FROM public.profiles')).rows.map((r) => r.id), [ID.USER]);
    assert.deepEqual((await attempt(after_, PERSONA.userInactive, 'SELECT id, is_active FROM public.profiles')).rows, [{ id: ID.USER_INACTIVE, is_active: false }]);
    assert.deepEqual((await attempt(after_, { role: 'authenticated', sub: '99999999-0000-0000-0000-000000000000' }, 'SELECT public.is_admin() a, public.is_owner() o')).rows, [{ a: false, o: false }]);
    assert.deepEqual((await attempt(after_, { role: 'authenticated', sub: null }, 'SELECT public.is_admin() a, public.is_owner() o')).rows, [{ a: false, o: false }]);
  });

  test('service_role operations are unaffected by C (it bypasses RLS and does not call the helpers)', async () => {
    assert.ok((await attempt(after_, PERSONA.service, `UPDATE public.bookings SET status = 'confirmed' RETURNING id`)).ok);
    assert.equal((await attempt(after_, PERSONA.service, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.STAFF}' RETURNING id`)).count, 1, 'B + C together still let the backend change roles');
  });

  test('helper ACLs and attributes are preserved; C is idempotent; its rollback restores production helpers exactly', async () => {
    const d = await build(['B']);
    const original = await functionState(d);
    await runScript(d, INSTALL('06_security_C.sql'));
    const applied = await functionState(d);
    await runScript(d, INSTALL('06_security_C.sql'));
    assert.equal(await functionState(d), applied);
    for (const fn of ['is_admin', 'is_owner']) {
      assert.deepEqual((await d.query(`SELECT has_function_privilege('anon', $1, 'EXECUTE') a, has_function_privilege('authenticated', $1, 'EXECUTE') b, has_function_privilege('service_role', $1, 'EXECUTE') c`, [`public.${fn}()`])).rows[0], { a: false, b: true, c: false });
    }
    await runScript(d, ROLLBACK(UNDO.C));
    assert.equal(await functionState(d), original);
  });
});

describe('[SIMULATED] hardened state (A + B + C) and the 24-scenario matrix, phase 2 expectations', () => {
  let db;
  before(async () => { db = await build(['A', 'B', 'C']); });

  test('07 validation passes in full only when A, B and C are all applied; rows are attributable per proposal', async () => {
    const rows = await validation(db);
    assert.equal(rows.find((r) => r.check_id === 'ZZ').status, 'PASS', JSON.stringify(rows.filter((r) => r.status !== 'PASS')));
    const combos = { A: ['HA1', 'HA2', 'HA3', 'HA4', 'HA5'], B: ['HB1', 'HB2'], C: ['HC1', 'HC2'] };
    for (const [subset, expectPass] of [[['A'], ['A']], [['B'], ['B']], [['A', 'B'], ['A', 'B']], [['B', 'C'], ['B', 'C']]]) {
      const d = await build(subset);
      const r = await validation(d);
      for (const p of ['A', 'B', 'C']) for (const id of combos[p]) assert.equal(r.find((x) => x.check_id === id).status, expectPass.includes(p) ? 'PASS' : 'FAIL', `${subset.join('+')}: ${id}`);
      assert.equal(r.find((x) => x.check_id === 'ZZ').status, 'FAIL');
    }
  });

  test('07 detects regressions: re-opening a privilege or a policy flips the verdict', async () => {
    const d = await build(['A', 'B', 'C']);
    await d.exec(`GRANT UPDATE ON public.profiles TO authenticated`);
    assert.equal((await validation(d)).find((r) => r.check_id === 'ZZ').status, 'FAIL');
    const e = await build(['A', 'B', 'C']);
    await e.exec(`CREATE POLICY sneaky ON public.profiles FOR UPDATE TO authenticated USING (true)`);
    assert.equal((await validation(e)).find((r) => r.check_id === 'HA5').status, 'FAIL');
  });

  test('TESTS 1-3: public services stay readable by anon; anonymous administrative calls stay denied; users read their own profile', async () => {
    assert.equal((await attempt(db, PERSONA.anon, 'SELECT slug FROM public.services')).rows.length, 2);
    for (const call of [`SELECT public.purge_archived_bookings()`, `SELECT public.block_event_date('2027-02-01', 'x')`, `SELECT public.is_admin()`]) assert.ok(denied(await attempt(db, PERSONA.anon, call)), call);
    assert.deepEqual((await attempt(db, PERSONA.user, 'SELECT id FROM public.profiles')).rows.map((r) => r.id), [ID.USER]);
  });

  test('TESTS 5, 6, 9: role change, reactivation and self-promotion are all blocked for every browser persona', async () => {
    for (const persona of [PERSONA.user, PERSONA.staff, PERSONA.viewer, PERSONA.admin, PERSONA.owner, PERSONA.userInactive, PERSONA.adminInactive]) {
      assert.ok(blocked(await attempt(db, persona, `UPDATE public.profiles SET role = 'owner' WHERE id = '${persona.sub}'`)), `${persona.sub} role`);
      assert.ok(blocked(await attempt(db, persona, `UPDATE public.profiles SET is_active = true WHERE id = '${persona.sub}'`)), `${persona.sub} reactivation`);
    }
  });

  test('TEST 7 + 17-20: administrative access works for active admins; bookings, payments and blocked dates behave as designed', async () => {
    assert.equal((await attempt(db, PERSONA.admin, 'SELECT id FROM public.bookings')).rows.length, 1);
    assert.equal((await attempt(db, PERSONA.admin, `UPDATE public.bookings SET status = 'confirmed' RETURNING id`)).count, 1);
    assert.equal((await attempt(db, PERSONA.admin, `DELETE FROM public.bookings RETURNING id`)).count, 1);
    assert.ok((await attempt(db, PERSONA.admin, `INSERT INTO public.payments (booking_id, user_id, amount, provider) SELECT id, '${ID.USER}', 5, 'manual' FROM public.bookings LIMIT 1`)).ok);
    assert.equal((await attempt(db, PERSONA.admin, `UPDATE public.payments SET amount = 1, metadata = metadata || '{"adjustment_reason":"test"}' RETURNING id`)).count, 1, 'final decision C: an active administrator edits a payment');
    assert.ok(denied(await attempt(db, PERSONA.admin, `UPDATE public.payments SET booking_id = booking_id`)) || denied(await attempt(db, PERSONA.admin, `UPDATE public.payments SET gateway_reference = 'x'`)), 'identifiers stay protected');
    assert.ok((await attempt(db, PERSONA.service, `INSERT INTO public.bookings (full_name, email, event_date, event_location) VALUES ('S', 's@example.test', '2027-08-01', 'x') RETURNING booking_reference`)).ok);
    assert.match((await attempt(db, PERSONA.service, `INSERT INTO public.bookings (full_name, email, event_date, event_location) VALUES ('S', 's@example.test', '2027-07-01', 'x')`)).message, /date is unavailable/);
    assert.ok((await attempt(db, PERSONA.service, `DELETE FROM public.blocked_dates WHERE event_date = '2027-07-01'`)).ok);
    assert.ok(denied(await attempt(db, PERSONA.admin, `DELETE FROM public.blocked_dates`)));
  });

  test('TESTS 14 + 15 (the two service-role corrections): the backend deletes a profile and changes a role; the deletion audit entry must not point at the deleted profile', async () => {
    const r = await asUser(db, PERSONA.service, async (tx) => {
      const role = await tx.query(`UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.STAFF}' RETURNING role`);
      await tx.query(`DELETE FROM public.user_permissions WHERE user_id = '${ID.VIEWER}'`);
      const del = await tx.query(`DELETE FROM public.profiles WHERE id = '${ID.VIEWER}' RETURNING id`);
      await tx.exec('SAVEPOINT a');
      let dangling = null;
      try { await tx.query(`INSERT INTO public.audit_logs (actor_user_id, target_user_id, action) VALUES ('${ID.OWNER}', '${ID.VIEWER}', 'user.deleted')`); } catch (e) { dangling = e.code; }
      await tx.exec('ROLLBACK TO SAVEPOINT a');
      const corrected = await tx.query(`INSERT INTO public.audit_logs (actor_user_id, target_user_id, action, metadata) VALUES ('${ID.OWNER}', NULL, 'user.deleted', '{"deleted_user_id":"${ID.VIEWER}","role":"user"}') RETURNING id`);
      return { role: role.rows[0].role, deleted: del.rows.length, dangling, corrected: corrected.rows.length };
    });
    assert.deepEqual(r, { role: 'admin', deleted: 1, dangling: '23503', corrected: 1 });
  });

  test('TESTS 21-23 still hold in the hardened state: function EXECUTE, TRUNCATE and default privileges', async () => {
    const f = (await db.query(`SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') b, has_function_privilege('service_role', p.oid, 'EXECUTE') c FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace`)).rows;
    for (const r of f) {
      assert.equal(r.a, false, `${r.proname} anon`);
      assert.equal(r.b, ['is_admin', 'is_owner'].includes(r.proname), `${r.proname} authenticated`);
      assert.equal(r.c, r.proname === 'purge_archived_bookings', `${r.proname} service_role`);
    }
    for (const t of ['audit_logs', 'bookings', 'payments', 'profiles', 'services', 'user_permissions']) assert.ok(denied(await attempt(db, PERSONA.admin, `TRUNCATE public.${t}`)), t);
    await db.exec(`CREATE TABLE public.zz_phase2 (a int)`);
    for (const role of ['anon', 'authenticated', 'service_role']) assert.deepEqual(await tablePriv(db, role, 'zz_phase2'), []);
    await db.exec(`DROP TABLE public.zz_phase2`);
  });

  test('every policy that calls the helpers is covered after A + C: 28 policies, none admits a suspended administrator or owner', async () => {
    const post = await policyCounts(db);
    assert.equal(post.length, 28);
    for (const p of post) { assert.equal(p.adminInactive, p.userInactive, p.name); assert.equal(p.ownerInactive, p.userInactive, p.name); }
    for (const p of post) assert.ok(p.owner >= 1, `${p.table}: ${p.name} keeps the active owner working`);
    for (const p of post.filter((x) => !x.ownerOnly)) assert.ok(p.admin >= 1, `${p.table}: ${p.name} keeps the active administrator working`);
  });

  test('TEST 24: rolling back C, B, A (in that order) restores the Phase 1 state exactly; out-of-order rollbacks are refused', async () => {
    const phase1 = await build([]);
    const policies = await policyState(phase1); const fns = await functionState(phase1); const acl = await tableAcl(phase1);
    const d = await build(['A', 'B', 'C']);
    await assert.rejects(() => runScript(d, ROLLBACK(UNDO.B)), /proposal C is applied/);
    await runScript(d, ROLLBACK(UNDO.C)); await runScript(d, ROLLBACK(UNDO.B)); await runScript(d, ROLLBACK(UNDO.A));
    assert.equal(await policyState(d), policies);
    assert.equal(await functionState(d), fns);
    assert.equal(await tableAcl(d), acl);
    assert.equal((await db.query(`SELECT count(*)::int n FROM dfabulous_stage4.phase2_state`)).rows[0].n, 3);
    assert.equal((await d.query(`SELECT count(*)::int n FROM dfabulous_stage4.phase2_state`)).rows[0].n, 0);
    const rows = (await d.exec(INSTALL('03_validate_baseline.sql'))).flatMap((r) => r.rows ?? []).filter((r) => r.check_id);
    assert.equal(rows.find((r) => r.check_id === 'ZZ').status, 'PASS', 'Phase 1 validation passes again after the Phase 2 rollback');
    for (const p of ['A', 'B', 'C']) await runScript(d, INSTALL(PHASE2[p]));
    assert.equal((await validation(d)).find((r) => r.check_id === 'ZZ').status, 'PASS', 'and Phase 2 re-applies cleanly');
  });

  test('Phase 2 refuses to run before Phase 1 is complete or when unarmed', async () => {
    const d = await freshSupabase(); await installBaseline(d);
    for (const f of Object.values(PHASE2)) await assert.rejects(() => runScript(d, INSTALL(f)), /02_privilege_normalisation|has not been run/);
    await d.exec(`SELECT set_config('dfabulous.confirm_project', '', false)`);
    await assert.rejects(() => d.exec(INSTALL('04_security_A.sql')), /not armed/);
    await d.exec('ROLLBACK').catch(() => {});
  });
});
