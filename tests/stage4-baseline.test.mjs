// STAGE 4, PHASE 1 tests: production-equivalent baseline + privilege normalisation (supabase/staging/install/01..03, rollback/01a, 01).
// ALL RESULTS ARE SIMULATED in PGlite (PostgreSQL 18.x, in memory, no network, no Supabase). They show how the SQL behaves in an emulation of a fresh Supabase
// project (roles, auth.uid(), default privileges). They do NOT prove behaviour on a real Supabase project or on PostgreSQL 17.11.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { SOURCE_SHA256, buildBaselineFile, readSource, verifyDerivation } from '../scripts/build-stage4-baseline.mjs';
import { ID, INSTALL, PERSONA, ROLLBACK, acl, arm, asUser, attempt, blocked, denied, freshSupabase, installBaseline, read, runScript, seedPersonas, tablePriv } from './helpers/stage4-db.mjs';

const TABLES = ['audit_logs', 'blocked_dates', 'bookings', 'gallery', 'messages', 'payments', 'permissions', 'profiles', 'services', 'site_settings', 'testimonials', 'user_permissions'];
const verdict = async (db) => {
  const rows = (await db.exec(INSTALL('03_validate_baseline.sql'))).flatMap((r) => r.rows ?? []).filter((r) => r.check_id);
  return { rows, failing: rows.filter((r) => r.status !== 'PASS').map((r) => r.check_id), zz: rows.find((r) => r.check_id === 'ZZ').status };
};
const normalise = (rows) => JSON.stringify(rows);
const aclSets = async (db) => {
  const g = (alias) => `CASE WHEN ${alias}.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(${alias}.grantee) END || ':' || ${alias}.privilege_type`;
  return {
    relations: (await db.query(`SELECT n, coalesce(array_agg(g ORDER BY g) FILTER (WHERE g IS NOT NULL), '{}') AS g FROM (SELECT c.relname AS n, ${g('a')} AS g FROM pg_class c LEFT JOIN LATERAL aclexplode(c.relacl) a ON true
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','S')) q GROUP BY n ORDER BY n`)).rows,
    functions: (await db.query(`SELECT n, coalesce(array_agg(g ORDER BY g) FILTER (WHERE g IS NOT NULL), '{}') AS g FROM (SELECT p.proname AS n, ${g('a')} AS g FROM pg_proc p LEFT JOIN LATERAL aclexplode(p.proacl) a ON true
      WHERE p.pronamespace = 'public'::regnamespace) q GROUP BY n ORDER BY n`)).rows,
    schema: (await db.query(`SELECT array_agg(g ORDER BY g) AS g FROM (SELECT ${g('a')} AS g FROM pg_namespace n, aclexplode(n.nspacl) a WHERE n.nspname = 'public') q`)).rows,
    defaults: (await db.query(`SELECT r, s, t, array_agg(g ORDER BY g) AS g FROM (SELECT rl.rolname AS r, coalesce(n.nspname, '*') AS s, d.defaclobjtype AS t, ${g('a')} AS g
      FROM pg_default_acl d JOIN pg_roles rl ON rl.oid = d.defaclrole LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) a) q GROUP BY r, s, t ORDER BY r, s, t`)).rows,
  };
};

describe('[SIMULATED] phase 1: the restore copy is the unchanged production export plus documented changes only', () => {
  test('the original export is unchanged (SHA-256 and size) and the committed restore copy is exactly what the builder produces', () => {
    const bytes = readFileSync(new URL('../supabase/staging/source/production_public_schema.sql', import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), SOURCE_SHA256);
    assert.equal(bytes.length, 52351);
    assert.equal(read('supabase/staging/install/01_production_schema.sql'), buildBaselineFile(), 'run npm run stage4:build');
  });

  test('derivation proof: every export statement is present, every addition is an allowed guard/marker/post-condition', () => {
    assert.deepEqual(verifyDerivation(readSource(), read('supabase/staging/install/01_production_schema.sql')), []);
  });

  test('derivation proof detects tampering (negative control)', () => {
    const tampered = read('supabase/staging/install/01_production_schema.sql').replace('CREATE TABLE "public"."services"', 'CREATE TABLE "public"."servicez"');
    assert.ok(verifyDerivation(readSource(), tampered).length > 0);
  });

  test('the restore copy carries no data, role, extension, cron job or Auth/Storage statement', () => {
    const sql = read('supabase/staging/install/01_production_schema.sql').split('\n').filter((l) => !l.startsWith('--')).join('\n');
    assert.doesNotMatch(sql, /^COPY /m);
    assert.doesNotMatch(sql, /\bCREATE (ROLE|USER|EXTENSION|SERVER|PUBLICATION|SUBSCRIPTION|EVENT TRIGGER)\b/i);
    assert.doesNotMatch(sql, /pg_cron|cron\.schedule|\bcron\./i);
    assert.doesNotMatch(sql, /\b(auth|storage)\."?(users|objects|buckets)"?\s*\(/i, 'no definition of managed tables');
    assert.doesNotMatch(sql, /^INSERT INTO "?public/mi);
  });
});

describe('[SIMULATED] phase 1: guards and preconditions', () => {
  test('01 refuses to run unarmed, outside PostgreSQL 17 without the simulation override, and on a non-empty public schema (production would stop here)', async () => {
    let db = await freshSupabase();
    await assert.rejects(() => db.exec(INSTALL('01_production_schema.sql')), /not armed/);
    await db.exec('ROLLBACK').catch(() => {});
    await db.exec(`SELECT set_config('dfabulous.confirm_project', 'qwoxxroszmwobnzqgndr', false)`);
    await assert.rejects(() => db.exec(INSTALL('01_production_schema.sql')), /must be PostgreSQL 17/);
    await db.exec('ROLLBACK').catch(() => {});
    db = await freshSupabase();
    await db.exec('CREATE TABLE public.profiles (id uuid)');
    await assert.rejects(() => runScript(db, INSTALL('01_production_schema.sql')), /public schema is not empty/);
    db = await freshSupabase();
    await installBaseline(db);
    await assert.rejects(() => runScript(db, INSTALL('01_production_schema.sql')), /public schema is not empty|already exists/);
  });

  test('02 and the validation need the staging marker: they refuse on a database that never ran 01 (a production-like database)', async () => {
    const db = await freshSupabase();
    await assert.rejects(() => runScript(db, INSTALL('02_privilege_normalisation.sql')), /install marker/);
    await assert.rejects(() => runScript(db, ROLLBACK('01a_rollback_privilege_normalisation.sql')), /install marker|nothing to roll back/);
    await assert.rejects(() => runScript(db, ROLLBACK('01_rollback_baseline.sql')), /not armed|destruction not confirmed|install marker/);
  });

  test('02 refuses to run as a role other than postgres and without being armed', async () => {
    const db = await freshSupabase();
    await installBaseline(db);
    await db.exec(`SELECT set_config('dfabulous.confirm_project', '', false)`);
    await assert.rejects(() => db.exec(INSTALL('02_privilege_normalisation.sql')), /not armed/);
    await db.exec('ROLLBACK').catch(() => {});
  });

  test('a rls_auto_enable() that the platform already owns is kept and not overwritten (conditional block)', async () => {
    const db = await freshSupabase();
    await db.exec(`CREATE ROLE platform_owner NOLOGIN; CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN RAISE LOG 'platform copy'; END $$; ALTER FUNCTION public.rls_auto_enable() OWNER TO platform_owner;`);
    await installBaseline(db);
    assert.equal((await db.query(`SELECT pg_get_userbyid(proowner) o, prosrc FROM pg_proc WHERE proname = 'rls_auto_enable'`)).rows[0].o, 'platform_owner');
    assert.match((await db.query(`SELECT prosrc FROM pg_proc WHERE proname = 'rls_auto_enable'`)).rows[0].prosrc, /platform copy/);
  });
});

describe('[SIMULATED] phase 1: production-equivalent baseline (01 only) and the privilege hazard it carries', () => {
  let db;
  before(async () => { db = await freshSupabase(); await installBaseline(db); });

  test('structure equals the export: the generated checks V01-V11 pass; only the privilege/default checks fail (the documented additive-privilege hazard)', async () => {
    const v = await verdict(db);
    assert.equal(v.zz, 'FAIL');
    for (const id of ['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07', 'V08', 'V09', 'V10', 'V11', 'V21', 'V22']) assert.ok(!v.failing.includes(id), `${id} should pass on the raw restore`);
    for (const id of ['V12', 'V13', 'V14', 'V15', 'V17', 'V19']) assert.ok(v.failing.includes(id), `${id} should fail until 02`);
  });

  test('a verbatim restore leaves anon with ALL on bookings and EXECUTE on the destructive purge function (more open than production)', async () => {
    assert.deepEqual((await tablePriv(db, 'anon', 'bookings')).sort(), ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']);
    assert.equal((await db.query(`SELECT has_function_privilege('anon', 'public.purge_archived_bookings()', 'EXECUTE') ok`)).rows[0].ok, true);
    assert.equal((await db.query(`SELECT has_function_privilege('anon', 'public.block_event_date(date, text)', 'EXECUTE') ok`)).rows[0].ok, true);
  });

  test('the production defects are reproduced faithfully by the baseline (S1: service_role role change is rejected; S4: self-reactivation works)', async () => {
    const d = await freshSupabase(); await installBaseline(d); await seedPersonas(d);
    const roleChange = await attempt(d, PERSONA.service, `UPDATE public.profiles SET role = 'admin' WHERE id = $1`, [ID.STAFF]);
    assert.equal(roleChange.ok, false);
    assert.match(roleChange.message, /Only the owner can change user roles/);
    const reactivate = await attempt(d, PERSONA.userInactive, `UPDATE public.profiles SET is_active = true WHERE id = $1 RETURNING id`, [ID.USER_INACTIVE]);
    assert.equal(reactivate.ok && reactivate.count, 1, 'baseline still lets a suspended user reactivate themselves');
  });
});

describe('[SIMULATED] phase 1: privilege normalisation (01 + 02)', () => {
  let db;
  before(async () => { db = await freshSupabase(); await installBaseline(db); await runScript(db, INSTALL('02_privilege_normalisation.sql')); await seedPersonas(db); });

  test('validation 03 passes completely after 01 + 02', async () => {
    const v = await verdict(db);
    assert.equal(v.zz, 'PASS', JSON.stringify(v.rows.filter((r) => r.status !== 'PASS')));
    assert.equal(v.rows.length, 23);
  });

  test('02 is idempotent: running it again changes nothing and keeps the original snapshot', async () => {
    const before = normalise(await aclSets(db));
    const snapshotRows = (await db.query('SELECT count(*)::int n FROM dfabulous_stage4.privilege_snapshot')).rows[0].n;
    await runScript(db, INSTALL('02_privilege_normalisation.sql'));
    assert.equal(normalise(await aclSets(db)), before);
    assert.equal((await db.query('SELECT count(*)::int n FROM dfabulous_stage4.privilege_snapshot')).rows[0].n, snapshotRows);
  });

  test('TEST 22: no TRUNCATE, TRIGGER, REFERENCES or MAINTAIN for anon/authenticated/service_role on any table, and no write for anon', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const table of TABLES) {
        const privs = await tablePriv(db, role, table);
        for (const p of ['TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN']) assert.ok(!privs.includes(p), `${role}.${table} must not hold ${p}`);
        if (role === 'anon') assert.deepEqual(privs, table === 'services' ? ['SELECT'] : [], `anon.${table}`);
      }
    }
    for (const persona of [PERSONA.anon, PERSONA.user, PERSONA.admin, PERSONA.owner]) {
      for (const table of TABLES) assert.ok(denied(await attempt(db, persona, `TRUNCATE public.${table}`)), `${persona.role} TRUNCATE ${table}`);
    }
  });

  test('TEST 21: function EXECUTE: is_admin/is_owner -> authenticated only, purge -> service_role only, nothing for anon or PUBLIC', async () => {
    const rows = (await db.query(`SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth, has_function_privilege('service_role', p.oid, 'EXECUTE') svc,
      EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0) pub FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace`)).rows;
    assert.equal(rows.length, 12);
    for (const r of rows) {
      assert.equal(r.anon, false, `${r.proname} anon`);
      assert.equal(r.pub, false, `${r.proname} PUBLIC`);
      assert.equal(r.auth, ['is_admin', 'is_owner'].includes(r.proname), `${r.proname} authenticated`);
      assert.equal(r.svc, r.proname === 'purge_archived_bookings', `${r.proname} service_role`);
    }
  });

  test('TEST 2: anonymous access to administrative and SECURITY DEFINER functions is denied (42501)', async () => {
    for (const call of [`SELECT public.purge_archived_bookings()`, `SELECT public.block_event_date('2027-02-01', 'x')`, `SELECT public.unblock_event_date('2027-02-01')`, `SELECT * FROM public.get_event_availability('2027-02-01', '2027-02-03')`, `SELECT public.is_admin()`, `SELECT public.is_owner()`, `SELECT public.handle_new_user()`]) {
      assert.ok(denied(await attempt(db, PERSONA.anon, call)), call);
    }
    for (const call of [`SELECT public.purge_archived_bookings()`, `SELECT public.block_event_date('2027-02-01', 'x')`, `SELECT public.unblock_event_date('2027-02-01')`]) assert.ok(denied(await attempt(db, PERSONA.admin, call)), `authenticated admin: ${call}`);
  });

  test('TEST 1: anonymous visitors still read public services (deliberately public content) and nothing else', async () => {
    const services = await attempt(db, PERSONA.anon, 'SELECT slug FROM public.services ORDER BY slug');
    assert.ok(services.ok);
    assert.deepEqual(services.rows.map((r) => r.slug), ['s-active', 's-hidden'], 'production policy USING (true) exposes inactive rows too; preserved on purpose (decision pending, finding S9)');
    for (const table of TABLES.filter((t) => t !== 'services')) assert.ok(denied(await attempt(db, PERSONA.anon, `SELECT 1 FROM public.${table} LIMIT 1`)), `anon ${table}`);
    assert.ok(denied(await attempt(db, PERSONA.anon, `SELECT nextval('public.booking_reference_seq')`)));
  });

  test('TEST 3-6: an ordinary user reads their own profile; cannot edit it, change a role or reactivate (no direct profile writes at all)', async () => {
    const own = await attempt(db, PERSONA.user, 'SELECT id, role FROM public.profiles');
    assert.deepEqual(own.rows.map((r) => r.id), [ID.USER], 'only the own profile is visible');
    for (const sql of [`UPDATE public.profiles SET full_name = 'x' WHERE id = '${ID.USER}'`, `UPDATE public.profiles SET role = 'owner' WHERE id = '${ID.USER}'`, `INSERT INTO public.profiles (id, role) VALUES ('${ID.USER}', 'owner')`, `DELETE FROM public.profiles WHERE id = '${ID.USER}'`]) {
      assert.ok(denied(await attempt(db, PERSONA.user, sql)), sql);
    }
    assert.ok(denied(await attempt(db, PERSONA.userInactive, `UPDATE public.profiles SET is_active = true WHERE id = '${ID.USER_INACTIVE}'`)), 'inactive user cannot reactivate themselves');
    const inactiveRead = await attempt(db, PERSONA.userInactive, 'SELECT is_active FROM public.profiles');
    assert.deepEqual(inactiveRead.rows, [{ is_active: false }], 'a suspended user can still read their own row (to be told they are suspended)');
  });

  test('TEST 7-10: admin reads permitted administrative records; cannot modify permissions, promote self or touch payments', async () => {
    assert.equal((await attempt(db, PERSONA.admin, 'SELECT id FROM public.bookings')).rows.length, 1);
    assert.equal((await attempt(db, PERSONA.admin, 'SELECT id FROM public.payments')).rows.length, 1);
    assert.equal((await attempt(db, PERSONA.admin, 'SELECT id FROM public.profiles')).rows.length, Object.keys(ID).length, 'admin lists all profiles');
    assert.ok(denied(await attempt(db, PERSONA.admin, `INSERT INTO public.user_permissions (user_id, permission_key) VALUES ('${ID.ADMIN}', 'bookings.manage')`)), 'self-grant of a permission');
    assert.ok(denied(await attempt(db, PERSONA.admin, `DELETE FROM public.user_permissions WHERE user_id = '${ID.STAFF}'`)), 'stripping another user');
    assert.ok(denied(await attempt(db, PERSONA.admin, `UPDATE public.profiles SET role = 'owner' WHERE id = '${ID.ADMIN}'`)), 'self-promotion');
    assert.ok(denied(await attempt(db, PERSONA.admin, `UPDATE public.payments SET amount = 1`)), 'payment modification');
    assert.ok(denied(await attempt(db, PERSONA.admin, `DELETE FROM public.payments`)), 'payment deletion');
    assert.ok(denied(await attempt(db, PERSONA.owner, `UPDATE public.payments SET amount = 1`)), 'even the owner cannot rewrite the ledger through the browser');
  });

  test('TEST 18-19: admins update and delete bookings and insert payments; users read only their own bookings and payments; staff cannot update', async () => {
    assert.equal((await attempt(db, PERSONA.admin, `UPDATE public.bookings SET status = 'confirmed' RETURNING id`)).count, 1);
    assert.equal((await attempt(db, PERSONA.staff, `UPDATE public.bookings SET status = 'confirmed' RETURNING id`)).count, 0, 'staff has no update policy');
    assert.equal((await attempt(db, PERSONA.user, `UPDATE public.bookings SET status = 'cancelled' RETURNING id`)).count, 0, 'customers cannot update bookings');
    assert.equal((await attempt(db, PERSONA.admin, `DELETE FROM public.bookings RETURNING id`)).count, 1);
    const inserted = await attempt(db, PERSONA.admin, `INSERT INTO public.payments (booking_id, user_id, amount, provider) SELECT id, '${ID.USER}', 50, 'manual' FROM public.bookings LIMIT 1 RETURNING id`);
    assert.ok(inserted.ok && inserted.count === 1, JSON.stringify(inserted));
    assert.equal((await attempt(db, PERSONA.user, 'SELECT id FROM public.bookings')).rows.length, 1);
    assert.equal((await attempt(db, PERSONA.user, 'SELECT id FROM public.payments')).rows.length, 1);
    assert.equal((await attempt(db, PERSONA.viewer, 'SELECT id FROM public.bookings')).rows.length, 0, 'a viewer sees nobody else\'s bookings');
    assert.ok(denied(await attempt(db, PERSONA.user, `INSERT INTO public.payments (booking_id, user_id, amount, provider) SELECT id, '${ID.USER}', 1, 'manual' FROM public.bookings LIMIT 1`)));
  });

  test('TEST 17: bookings are created by the backend only; references are generated; blocked dates are enforced by the trigger', async () => {
    for (const persona of [PERSONA.anon, PERSONA.user, PERSONA.admin]) assert.ok(denied(await attempt(db, persona, `INSERT INTO public.bookings (full_name, email, event_date, event_location) VALUES ('x', 'x@example.test', '2027-03-01', 'x')`)), persona.role);
    const created = await asUser(db, PERSONA.service, async (tx) => {
      const r = await tx.query(`INSERT INTO public.bookings (full_name, email, event_date, event_location) VALUES ('Svc', 's@example.test', '2027-03-01', 'Lagos') RETURNING booking_reference`);
      return r.rows[0];
    });
    assert.match(created.booking_reference, /^DF-\d{4}$/);
    await db.query(`INSERT INTO public.blocked_dates (event_date) VALUES ('2027-04-01')`);
    const clash = await attempt(db, PERSONA.service, `INSERT INTO public.bookings (full_name, email, event_date, event_location) VALUES ('Svc', 's@example.test', '2027-04-01', 'Lagos')`);
    assert.match(clash.message, /date is unavailable/);
    await db.query(`DELETE FROM public.blocked_dates WHERE event_date = '2027-04-01'`);
  });

  test('TEST 20: blocked dates are managed by the backend only (browser roles have no privilege)', async () => {
    assert.ok((await attempt(db, PERSONA.service, `INSERT INTO public.blocked_dates (event_date, note, created_by) VALUES ('2027-05-01', 'x', '${ID.ADMIN}') RETURNING event_date`)).ok);
    assert.equal((await attempt(db, PERSONA.service, `DELETE FROM public.blocked_dates`)).ok, true);
    for (const persona of [PERSONA.anon, PERSONA.user, PERSONA.admin, PERSONA.owner]) {
      assert.ok(denied(await attempt(db, persona, 'SELECT 1 FROM public.blocked_dates')), `${persona.role} select`);
      assert.ok(denied(await attempt(db, persona, `INSERT INTO public.blocked_dates (event_date) VALUES ('2027-05-02')`)), `${persona.role} insert`);
    }
  });

  test('TEST 16: audit_logs: browser roles cannot write; service_role may append and read but not rewrite, delete or truncate; owner reads', async () => {
    for (const persona of [PERSONA.anon, PERSONA.user, PERSONA.admin, PERSONA.owner]) {
      for (const sql of [`INSERT INTO public.audit_logs (action) VALUES ('forged')`, `UPDATE public.audit_logs SET action = 'x'`, `DELETE FROM public.audit_logs`]) assert.ok(denied(await attempt(db, persona, sql)), `${persona.role}: ${sql}`);
    }
    assert.ok((await attempt(db, PERSONA.service, `INSERT INTO public.audit_logs (actor_user_id, action) VALUES ('${ID.OWNER}', 'svc')`)).ok);
    for (const sql of [`UPDATE public.audit_logs SET action = 'x'`, `DELETE FROM public.audit_logs`, `TRUNCATE public.audit_logs`]) assert.ok(denied(await attempt(db, PERSONA.service, sql)), `service_role: ${sql}`);
    assert.equal((await attempt(db, PERSONA.owner, 'SELECT id FROM public.audit_logs')).rows.length, 1, 'active owner reads the audit log');
    assert.equal((await attempt(db, PERSONA.admin, 'SELECT id FROM public.audit_logs')).rows.length, 0, 'administrators do not');
  });

  test('TEST 14: service_role deletes a profile; related business and audit rows survive (SET NULL); permissions cascade; referential integrity holds', async () => {
    const result = await asUser(db, PERSONA.service, async (tx) => {
      await tx.query(`INSERT INTO public.audit_logs (actor_user_id, target_user_id, action) VALUES ('${ID.OWNER}', '${ID.USER}', 'user.updated')`);
      await tx.query(`DELETE FROM public.user_permissions WHERE user_id = '${ID.USER}'`);
      const del = await tx.query(`DELETE FROM public.profiles WHERE id = '${ID.USER}' RETURNING id`);
      const bookings = await tx.query(`SELECT user_id FROM public.bookings`);
      const payments = await tx.query(`SELECT user_id FROM public.payments`);
      const audit = await tx.query(`SELECT target_user_id FROM public.audit_logs WHERE action = 'user.updated'`);
      const auth = await tx.query(`SELECT count(*)::int n FROM auth.users WHERE id = '${ID.USER}'`).catch(() => ({ rows: [{ n: -1 }] }));
      return { deleted: del.rows.length, bookings: bookings.rows, payments: payments.rows, audit: audit.rows, auth: auth.rows[0].n };
    });
    assert.equal(result.deleted, 1);
    assert.deepEqual(result.bookings, [{ user_id: null }], 'the booking is kept');
    assert.deepEqual(result.payments, [{ user_id: null }], 'the payment is kept');
    assert.deepEqual(result.audit, [{ target_user_id: null }], 'the audit row is kept with the target cleared');
    assert.ok(result.auth === 1 || result.auth === -1, 'the Auth user is NOT deleted by a profile deletion (auth.users untouched)');
  });

  test('TEST 14b: a deletion audit entry that still points at the deleted profile violates the foreign key (why the API must store the id in metadata)', async () => {
    const r = await asUser(db, PERSONA.service, async (tx) => {
      await tx.exec('SAVEPOINT s');
      await tx.query(`DELETE FROM public.user_permissions WHERE user_id = '${ID.VIEWER}'`);
      await tx.query(`DELETE FROM public.profiles WHERE id = '${ID.VIEWER}'`);
      let code = null;
      try { await tx.query(`INSERT INTO public.audit_logs (actor_user_id, target_user_id, action) VALUES ('${ID.OWNER}', '${ID.VIEWER}', 'user.deleted')`); } catch (e) { code = e.code; }
      await tx.exec('ROLLBACK TO SAVEPOINT s');
      return code;
    });
    assert.equal(r, '23503');
  });

  test('TEST 15 (preserved production defect until proposal B): service_role role changes are still rejected by the baseline trigger', async () => {
    const r = await attempt(db, PERSONA.service, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.STAFF}'`);
    assert.equal(r.ok, false);
    assert.match(r.message, /Only the owner can change user roles/);
  });

  test('TEST 12-13 (preserved production defect until proposal C): suspended administrators and owners keep database access after Phase 1', async () => {
    for (const persona of [PERSONA.adminInactive, PERSONA.ownerInactive]) {
      assert.equal((await attempt(db, persona, 'SELECT id FROM public.bookings')).rows.length, 1, `${persona.sub} still reads bookings before C`);
      assert.equal((await attempt(db, persona, `UPDATE public.bookings SET status = 'confirmed' RETURNING id`)).count, 1);
    }
  });

  test('service_role keeps every operation the application performs and gains nothing it does not use', async () => {
    const ok = async (sql) => { const r = await attempt(db, PERSONA.service, sql); assert.ok(r.ok, `${sql}: ${r.message}`); };
    const no = async (sql) => assert.ok(denied(await attempt(db, PERSONA.service, sql)), sql);
    await ok(`SELECT * FROM public.services`); await ok(`SELECT * FROM public.gallery`); await ok(`SELECT * FROM public.testimonials`); await ok(`SELECT * FROM public.payments`);
    await ok(`INSERT INTO public.messages (full_name, email, message) VALUES ('a', 'a@example.test', 'm') RETURNING id`);
    await ok(`UPDATE public.messages SET status = 'read'`);
    await ok(`INSERT INTO public.site_settings (key, value) VALUES ('k', '{}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    await ok(`INSERT INTO public.profiles (id, email, role) VALUES ('${ID.ADMIN}', 'a@example.test', 'admin') ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`);
    await ok(`INSERT INTO public.user_permissions (user_id, permission_key) VALUES ('${ID.STAFF}', 'users.manage') ON CONFLICT (user_id, permission_key) DO NOTHING`);
    await ok(`DELETE FROM public.user_permissions WHERE user_id = '${ID.STAFF}'`);
    await ok(`UPDATE public.profiles SET is_active = false WHERE id = '${ID.STAFF}'`);
    await ok(`UPDATE public.bookings SET status = 'archived', archived_at = now()`);
    await ok(`SELECT public.purge_archived_bookings()`);
    await no(`INSERT INTO public.payments (booking_id, amount, provider) SELECT id, 1, 'manual' FROM public.bookings LIMIT 1`);
    await no(`UPDATE public.payments SET amount = 2`);
    await no(`INSERT INTO public.services (slug, title, short_description) VALUES ('z', 'z', 'z')`);
    await no(`DELETE FROM public.bookings`);
    await no(`SELECT * FROM public.permissions`);
    await no(`TRUNCATE public.profiles`);
    await no(`SELECT public.block_event_date('2027-06-01', 'x')`);
  });

  test('normalisation also removes what a table-level REVOKE alone would miss: column privileges, grant options, unknown objects, function PUBLIC grants', async () => {
    const d = await freshSupabase(); await installBaseline(d);
    await d.exec(`
      GRANT SELECT (email) ON public.profiles TO anon;
      GRANT SELECT ON public.bookings TO authenticated WITH GRANT OPTION;
      CREATE TABLE public.unlisted_table (a int); GRANT ALL ON public.unlisted_table TO anon, authenticated;
      CREATE FUNCTION public.unlisted_fn() RETURNS int LANGUAGE sql AS 'SELECT 1'; GRANT EXECUTE ON FUNCTION public.unlisted_fn() TO PUBLIC, anon;
    `);
    await runScript(d, INSTALL('02_privilege_normalisation.sql'));
    assert.equal((await d.query(`SELECT has_column_privilege('anon', 'public.profiles', 'email', 'SELECT') ok`)).rows[0].ok, false);
    assert.equal((await d.query(`SELECT has_table_privilege('authenticated', 'public.bookings', 'SELECT WITH GRANT OPTION') ok`)).rows[0].ok, false);
    assert.deepEqual(await tablePriv(d, 'anon', 'unlisted_table'), []);
    assert.deepEqual(await tablePriv(d, 'authenticated', 'unlisted_table'), []);
    assert.equal((await d.query(`SELECT has_function_privilege('anon', 'public.unlisted_fn()', 'EXECUTE') a, has_function_privilege('authenticated', 'public.unlisted_fn()', 'EXECUTE') b`)).rows[0].a, false);
    assert.equal((await d.query(`SELECT has_function_privilege('authenticated', 'public.unlisted_fn()', 'EXECUTE') b`)).rows[0].b, false);
    assert.equal((await d.query(`SELECT has_schema_privilege('authenticated', 'public', 'CREATE') c`)).rows[0].c, false);
  });

  test('TEST 23: default privilege inheritance: objects created after normalisation get no API privileges (and DO get them before it)', async () => {
    const before = await freshSupabase(); await installBaseline(before);
    await before.exec(`CREATE TABLE public.zz_before (a int); CREATE FUNCTION public.zz_before_fn() RETURNS int LANGUAGE sql AS 'SELECT 1'; CREATE SEQUENCE public.zz_before_seq;`);
    assert.ok((await tablePriv(before, 'anon', 'zz_before')).length > 0, 'hazard: without 02 a new table is open to anon');
    assert.equal((await before.query(`SELECT has_function_privilege('anon', 'public.zz_before_fn()', 'EXECUTE') ok`)).rows[0].ok, true);

    await db.exec(`CREATE TABLE public.zz_after (a int); CREATE FUNCTION public.zz_after_fn() RETURNS int LANGUAGE sql AS 'SELECT 1'; CREATE SEQUENCE public.zz_after_seq;`);
    for (const role of ['anon', 'authenticated', 'service_role']) assert.deepEqual(await tablePriv(db, role, 'zz_after'), [], role);
    const fn = (await db.query(`SELECT has_function_privilege('anon','public.zz_after_fn()','EXECUTE') a, has_function_privilege('authenticated','public.zz_after_fn()','EXECUTE') b, has_function_privilege('service_role','public.zz_after_fn()','EXECUTE') c`)).rows[0];
    assert.deepEqual(fn, { a: false, b: false, c: false });
    assert.equal((await db.query(`SELECT has_sequence_privilege('anon','public.zz_after_seq','USAGE') a, has_sequence_privilege('authenticated','public.zz_after_seq','USAGE') b`)).rows[0].a, false);
    await db.exec('DROP TABLE public.zz_after; DROP FUNCTION public.zz_after_fn(); DROP SEQUENCE public.zz_after_seq;');
  });

  test('optional rate-limit migrations apply after Phase 1 and remain unreachable by anon/authenticated', async () => {
    const d = await freshSupabase(); await installBaseline(d); await runScript(d, INSTALL('02_privilege_normalisation.sql'));
    await d.exec(read('supabase/migrations/20261110120000_api_rate_limits.sql'));
    await d.exec(read('supabase/migrations/20261111090000_api_rate_limits_cleanup_hardening.sql'));
    assert.ok(denied(await attempt(d, PERSONA.anon, `SELECT public.consume_rate_limit('k', 1, 1)`)));
    assert.ok(denied(await attempt(d, PERSONA.admin, `SELECT * FROM public.api_rate_limits`)));
    assert.ok((await attempt(d, PERSONA.service, `SELECT public.consume_rate_limit('k', 5, 60)`)).ok);
    assert.equal((await verdict(d)).zz, 'PASS', 'validation tolerates the optional rate-limit objects');
  });
});

describe('[SIMULATED] phase 1: rollback (TEST 24)', () => {
  test('01a restores the exact pre-normalisation privilege state (schema, relations, functions, default privileges), repeatedly', async () => {
    const db = await freshSupabase(); await installBaseline(db);
    const before = normalise(await aclSets(db));
    await runScript(db, INSTALL('02_privilege_normalisation.sql'));
    assert.notEqual(normalise(await aclSets(db)), before);
    await runScript(db, ROLLBACK('01a_rollback_privilege_normalisation.sql'));
    assert.equal(normalise(await aclSets(db)), before);
    await runScript(db, INSTALL('02_privilege_normalisation.sql'));
    await runScript(db, ROLLBACK('01a_rollback_privilege_normalisation.sql'));
    assert.equal(normalise(await aclSets(db)), before, 'second cycle');
    assert.equal((await verdict(db)).zz, 'FAIL', 'after the rollback the baseline is open again (that is what it restores)');
  });

  test('01a restores column privileges and grant options that existed before normalisation', async () => {
    const db = await freshSupabase(); await installBaseline(db);
    await db.exec(`GRANT SELECT (email) ON public.profiles TO anon; GRANT SELECT ON public.bookings TO authenticated WITH GRANT OPTION;`);
    const before = normalise(await aclSets(db));
    const col = (await db.query(`SELECT has_column_privilege('anon', 'public.profiles', 'email', 'SELECT') ok`)).rows[0].ok;
    await runScript(db, INSTALL('02_privilege_normalisation.sql'));
    await runScript(db, ROLLBACK('01a_rollback_privilege_normalisation.sql'));
    assert.equal((await db.query(`SELECT has_column_privilege('anon', 'public.profiles', 'email', 'SELECT') ok`)).rows[0].ok, col);
    assert.equal(normalise(await aclSets(db)), before);
  });

  test('01 removes the whole baseline and restores schema/default privileges to the state before the restore; a fresh install works again', async () => {
    const db = await freshSupabase();
    const before = normalise({ schema: (await aclSets(db)).schema, defaults: (await aclSets(db)).defaults });
    await installBaseline(db); await runScript(db, INSTALL('02_privilege_normalisation.sql')); await seedPersonas(db);
    await db.exec(`SELECT set_config('dfabulous.confirm_drop', 'DROP STAGING BASELINE OBJECTS', false)`);
    await assert.rejects(() => runScript(db, ROLLBACK('01_rollback_baseline.sql')), /contains rows/);
    await db.exec(`SELECT set_config('dfabulous.allow_drop_data', 'yes-delete-staging-test-data', false)`);
    await runScript(db, ROLLBACK('01_rollback_baseline.sql'));
    const after = await aclSets(db);
    assert.equal(normalise({ schema: after.schema, defaults: after.defaults }), before);
    assert.equal((await db.query(`SELECT count(*)::int n FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','S')`)).rows[0].n, 0);
    assert.equal((await db.query(`SELECT count(*)::int n FROM pg_proc WHERE pronamespace = 'public'::regnamespace`)).rows[0].n, 0);
    assert.equal(await db.query(`SELECT to_regnamespace('dfabulous_stage4') n`).then((r) => r.rows[0].n), null);
    await installBaseline(db);
    assert.equal((await db.query(`SELECT count(*)::int n FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`)).rows[0].n, 12);
  });

  test('01 refuses while a Phase 2 proposal is applied, and without the destruction confirmation', async () => {
    const db = await freshSupabase(); await installBaseline(db); await runScript(db, INSTALL('02_privilege_normalisation.sql'));
    await assert.rejects(() => runScript(db, ROLLBACK('01_rollback_baseline.sql')), /destruction not confirmed/);
    await runScript(db, INSTALL('05_security_B.sql'));
    await db.exec(`SELECT set_config('dfabulous.confirm_drop', 'DROP STAGING BASELINE OBJECTS', false)`);
    await assert.rejects(() => runScript(db, ROLLBACK('01_rollback_baseline.sql')), /Phase 2 proposals still applied/);
  });
});

after(() => {});
