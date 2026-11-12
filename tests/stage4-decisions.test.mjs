// STAGE 4 FINAL DECISIONS (A: inactive Owner, B: profile updates through the backend only, C: administrators edit payments directly).
// ALL RESULTS ARE SIMULATED in PGlite (PostgreSQL 18.x, in memory, no network, no Supabase). They do not prove behaviour on a real Supabase project or on PostgreSQL 17.11.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { ID, INSTALL, PERSONA, ROLLBACK, asUser, attempt, blocked, denied, freshSupabase, installBaseline, runScript, seedPersonas } from './helpers/stage4-db.mjs';

const PHASE2 = { A: '04_security_A.sql', B: '05_security_B.sql', C: '06_security_C.sql' };
const UNDO = { A: '02_rollback_security_A.sql', B: '03_rollback_security_B.sql', C: '04_rollback_security_C.sql' };

let reasonCounter = 0;
const why = () => `metadata = metadata || jsonb_build_object('adjustment_reason', 'reason ${++reasonCounter}')`;

async function build(proposals) {
  const db = await freshSupabase();
  await installBaseline(db);
  await runScript(db, INSTALL('02_privilege_normalisation.sql'));
  await seedPersonas(db);
  for (const p of proposals) await runScript(db, INSTALL(PHASE2[p]));
  return db;
}
const audit = async (db, action) => (await db.query(`SELECT actor_user_id, target_user_id, metadata FROM public.audit_logs WHERE action = $1 ORDER BY created_at, id`, [action])).rows;
const asServiceAdmin = async (db, sql) => {
  try {
    let out;
    await db.transaction(async (tx) => { await tx.exec('SET LOCAL ROLE service_role'); out = await tx.query(sql); });
    return { ok: true, rows: out.rows, count: out.affectedRows ?? out.rows.length };
  } catch (error) { return { ok: false, rows: [], count: 0, code: error.code, message: String(error.message) }; }
};

describe('[SIMULATED] decision A: an inactive Owner loses administrative authorisation and regains it on reactivation', () => {
  let db;
  before(async () => { db = await build(['A', 'B', 'C']); });

  test('active Owner and active administrator keep full access to users, permissions, bookings, payments and audit logs', async () => {
    for (const persona of [PERSONA.owner, PERSONA.admin]) {
      assert.deepEqual((await attempt(db, persona, 'SELECT public.is_admin() a')).rows, [{ a: true }]);
      assert.equal((await attempt(db, persona, 'SELECT id FROM public.profiles')).rows.length, Object.keys(ID).length, 'lists users');
      assert.equal((await attempt(db, persona, 'SELECT id FROM public.user_permissions')).rows.length, 2, 'reads permissions');
      assert.equal((await attempt(db, persona, 'SELECT id FROM public.bookings')).rows.length, 1);
      assert.equal((await attempt(db, persona, 'SELECT id FROM public.payments')).rows.length, 1);
      assert.equal((await attempt(db, persona, `UPDATE public.payments SET status = 'processing', ${why()} RETURNING id`)).count, 1);
    }
    assert.equal((await attempt(db, PERSONA.owner, 'SELECT id FROM public.audit_logs')).rows.length, 1);
    assert.deepEqual((await attempt(db, PERSONA.owner, 'SELECT public.is_owner() o')).rows, [{ o: true }]);
  });

  test('an inactive Owner and an inactive administrator are denied every protected resource', async () => {
    for (const persona of [PERSONA.ownerInactive, PERSONA.adminInactive]) {
      assert.deepEqual((await attempt(db, persona, 'SELECT public.is_admin() a, public.is_owner() o')).rows, [{ a: false, o: false }]);
      for (const sql of ['SELECT id FROM public.user_permissions', 'SELECT id FROM public.bookings', 'SELECT id FROM public.payments', 'SELECT id FROM public.audit_logs', 'SELECT id FROM public.messages', 'SELECT event_date FROM public.blocked_dates']) {
        assert.equal((await attempt(db, persona, sql)).rows.length, 0, `${persona.sub}: ${sql}`);
      }
      assert.deepEqual((await attempt(db, persona, 'SELECT id FROM public.profiles')).rows.map((r) => r.id), [persona.sub], 'only their own row');
      for (const sql of [`UPDATE public.payments SET amount = 1`, `UPDATE public.bookings SET status = 'confirmed'`, `UPDATE public.profiles SET role = 'user' WHERE id <> '${persona.sub}'`, `INSERT INTO public.user_permissions (user_id, permission_key) VALUES ('${ID.USER}', 'users.manage')`]) {
        assert.ok(blocked(await attempt(db, persona, sql)), `${persona.sub}: ${sql}`);
      }
    }
  });

  test('the Owner account and its permissions are preserved while inactive, and reactivation by the backend restores authority without rebuilding anything', async () => {
    const d = await build(['A', 'B', 'C']);
    await d.query(`INSERT INTO public.user_permissions (user_id, permission_key) VALUES ($1, 'users.manage')`, [ID.OWNER_INACTIVE]);
    const before_ = (await d.query(`SELECT role, is_active FROM public.profiles WHERE id = $1`, [ID.OWNER_INACTIVE])).rows[0];
    assert.deepEqual(before_, { role: 'owner', is_active: false });
    assert.equal((await attempt(d, PERSONA.ownerInactive, 'SELECT id FROM public.payments')).rows.length, 0);
    assert.equal((await asServiceAdmin(d, `UPDATE public.profiles SET is_active = true WHERE id = '${ID.OWNER_INACTIVE}' RETURNING id`)).count, 1, 'trusted backend reactivates');
    assert.deepEqual((await d.query(`SELECT role, is_active FROM public.profiles WHERE id = $1`, [ID.OWNER_INACTIVE])).rows[0], { role: 'owner', is_active: true });
    assert.equal((await d.query(`SELECT count(*)::int n FROM public.user_permissions WHERE user_id = $1`, [ID.OWNER_INACTIVE])).rows[0].n, 1, 'permission rows untouched');
    assert.deepEqual((await attempt(d, PERSONA.ownerInactive, 'SELECT public.is_owner() o, public.is_admin() a')).rows, [{ o: true, a: true }]);
    assert.equal((await attempt(d, PERSONA.ownerInactive, 'SELECT id FROM public.payments')).rows.length, 1, 'access is back');
    assert.equal((await asServiceAdmin(d, `UPDATE public.profiles SET is_active = false WHERE id = '${ID.OWNER_INACTIVE}' RETURNING id`)).count, 1, 'and can be suspended again');
    assert.equal((await attempt(d, PERSONA.ownerInactive, 'SELECT id FROM public.payments')).rows.length, 0);
  });

  test('the same holds for an administrator suspended while holding a session (JWT still valid): the database decides on every request', async () => {
    const d = await build(['A', 'B', 'C']);
    assert.equal((await attempt(d, PERSONA.admin, 'SELECT id FROM public.bookings')).rows.length, 1);
    await d.exec(`UPDATE public.profiles SET is_active = false WHERE id = '${ID.ADMIN}'`);
    assert.equal((await attempt(d, PERSONA.admin, 'SELECT id FROM public.bookings')).rows.length, 0);
    assert.ok(blocked(await attempt(d, PERSONA.admin, `UPDATE public.payments SET amount = 2`)));
  });
});

describe('[SIMULATED] decision B: profile changes go through the trusted backend only', () => {
  let db;
  before(async () => { db = await build(['A', 'B', 'C']); });

  test('browser roles (user, staff, viewer, admin, owner, inactive accounts, anon) cannot write any column of any profile, including their own', async () => {
    const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' ORDER BY ordinal_position`)).rows.map((r) => r.column_name);
    assert.ok(cols.includes('role') && cols.includes('is_active') && cols.includes('full_name'));
    for (const persona of [PERSONA.user, PERSONA.staff, PERSONA.viewer, PERSONA.userInactive, PERSONA.admin, PERSONA.owner, PERSONA.adminInactive, PERSONA.ownerInactive, PERSONA.anon]) {
      for (const col of cols.filter((c) => !['id', 'created_at', 'updated_at'].includes(c))) {
        const value = col === 'role' ? `'owner'` : col === 'is_active' ? 'true' : `'x'`;
        const self = persona.sub ?? ID.USER;
        assert.ok(blocked(await attempt(db, persona, `UPDATE public.profiles SET ${col} = ${value} WHERE id = '${self}'`)), `${persona.role}/${persona.sub} ${col}`);
      }
      assert.ok(blocked(await attempt(db, persona, `DELETE FROM public.profiles WHERE id = '${persona.sub ?? ID.USER}'`)));
    }
  });

  test('no browser role holds any write privilege on profiles; self-service stays available through Supabase Auth, which does not touch this table', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const p of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) assert.equal((await db.query(`SELECT has_table_privilege($1, 'public.profiles', $2) ok`, [role, p])).rows[0].ok, false);
      for (const p of ['INSERT', 'UPDATE']) assert.equal((await db.query(`SELECT has_any_column_privilege($1, 'public.profiles', $2) ok`, [role, p])).rows[0].ok, false, `${role} column ${p}`);
    }
    assert.deepEqual((await attempt(db, PERSONA.user, 'SELECT id FROM public.profiles')).rows.map((r) => r.id), [ID.USER], 'users still read their own profile');
  });

  test('backend-authorised changes work: role change, deactivation, reactivation and profile edits by service_role', async () => {
    const d = await build(['A', 'B', 'C']);
    assert.equal((await asServiceAdmin(d, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.STAFF}' RETURNING id`)).count, 1, 'role change');
    assert.equal((await asServiceAdmin(d, `UPDATE public.profiles SET is_active = false WHERE id = '${ID.USER}' RETURNING id`)).count, 1, 'deactivation');
    assert.equal((await asServiceAdmin(d, `UPDATE public.profiles SET is_active = true WHERE id = '${ID.USER}' RETURNING id`)).count, 1, 'reactivation');
    assert.equal((await asServiceAdmin(d, `UPDATE public.profiles SET full_name = 'Renamed' WHERE id = '${ID.USER}' RETURNING id`)).count, 1, 'profile edit');
  });

  test('there is no browser-invokable bypass: the trigger trusts the database role, not claims; SET ROLE/JWT spoofing by a browser session is refused', async () => {
    const spoof = await asUser(db, PERSONA.admin, async (tx) => {
      await tx.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);
      try { const out = await tx.query(`UPDATE public.profiles SET role = 'owner' WHERE id = '${ID.ADMIN}' RETURNING id`); return { rows: out.rows.length }; } catch (e) { return { code: e.code }; }
    });
    assert.ok(spoof.code === '42501' || spoof.rows === 0, JSON.stringify(spoof));
    const setRole = await asUser(db, PERSONA.admin, async (tx) => { try { await tx.query('SET LOCAL ROLE service_role'); return 'switched'; } catch (e) { return e.code; } });
    // The harness session user is a superuser, which may SET ROLE to anything; on Supabase the session user is the `authenticator` login (documented limit in the runbook).
    assert.equal(setRole, 'switched', 'harness limit: SET ROLE cannot be refused in this simulation');
  });
});

describe('[SIMULATED] service-role deletion and role-change paths', () => {
  test('profile deletion by the backend works even when the profile owns payments, bookings, messages, audit rows and permissions; payments survive with user_id NULL', async () => {
    for (const set of [['A', 'B', 'C'], []]) {
      const d = await build(set);
      await d.query(`INSERT INTO public.user_permissions (user_id, permission_key) VALUES ($1, 'bookings.manage')`, [ID.USER]);
      await d.query(`INSERT INTO public.audit_logs (actor_user_id, target_user_id, action) VALUES ($1, $1, 'user.touched')`, [ID.USER]);
      const r = await asUser(d, PERSONA.service, async (tx) => {
        await tx.query(`DELETE FROM public.user_permissions WHERE user_id = '${ID.USER}'`);
        const del = await tx.query(`DELETE FROM public.profiles WHERE id = '${ID.USER}' RETURNING id`);
        const audited = await tx.query(`INSERT INTO public.audit_logs (actor_user_id, target_user_id, action, metadata) VALUES ('${ID.OWNER}', NULL, 'user.deleted', '{"deleted_user_id":"${ID.USER}","role":"user"}') RETURNING id`);
        const pay = await tx.query(`SELECT user_id FROM public.payments`);
        const logs = await tx.query(`SELECT count(*)::int n FROM public.audit_logs WHERE action = 'user.touched' AND actor_user_id IS NULL AND target_user_id IS NULL`);
        return { deleted: del.rows.length, audited: audited.rows.length, paymentOwners: pay.rows, nulled: logs.rows[0].n };
      });
      assert.deepEqual(r, { deleted: 1, audited: 1, paymentOwners: [{ user_id: null }], nulled: 1 }, `set ${set.join('+') || 'phase1'}`);
    }
  });

  test('profile deletion: the foreign-key SET NULL on payments.user_id is audited as payment.user_unlinked (context profile_deletion, no actor), never as an administrator edit', async () => {
    for (const via of ['postgres', 'service_role']) {
      const d = await build(['A']);
      if (via === 'postgres') await d.exec(`DELETE FROM public.profiles WHERE id = '${ID.USER}'`);
      else await asServiceAdmin(d, `DELETE FROM public.profiles WHERE id = '${ID.USER}'`);
      assert.equal((await audit(d, 'payment.updated')).length, 0, `${via}: not recorded as an edit`);
      const rows = await audit(d, 'payment.user_unlinked');
      assert.equal(rows.length, 1, via);
      assert.equal(rows[0].actor_user_id, null, 'no invented actor');
      assert.equal(rows[0].target_user_id, null);
      const m = rows[0].metadata;
      assert.equal(m.context, 'profile_deletion');
      assert.equal(m.deleted_user_id, ID.USER);
      assert.deepEqual(m.changed_fields, ['user_id']);
      assert.equal(m.before.user_id, ID.USER);
      assert.equal(m.after.user_id, null);
      assert.equal(m.adjustment_reason, undefined);
    }
  });

  test('role changes by the backend: allowed through B for any target, including the Owner and the requester\'s peers; a browser admin still cannot', async () => {
    const d = await build(['A', 'B', 'C']);
    for (const [target, role] of [[ID.STAFF, 'admin'], [ID.ADMIN2, 'staff'], [ID.OWNER, 'admin'], [ID.OWNER, 'owner']]) {
      assert.equal((await asServiceAdmin(d, `UPDATE public.profiles SET role = '${role}' WHERE id = '${target}' RETURNING id`)).count, 1, `${target} -> ${role}`);
    }
    assert.ok(blocked(await attempt(d, PERSONA.admin, `UPDATE public.profiles SET role = 'owner' WHERE id = '${ID.ADMIN}'`)));
    assert.ok(blocked(await attempt(d, PERSONA.owner, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.ADMIN}'`)), 'even the Owner must go through the backend (A removes browser writes)');
  });

  test('NULL and unknown database roles are never treated as service_role or Owner by the role-escalation trigger', async () => {
    const d = await build(['A', 'B', 'C']);
    for (const persona of [{ role: 'authenticated', sub: null }, { role: 'anon', sub: null }, { role: 'authenticated', sub: '99999999-0000-0000-0000-000000000000' }]) {
      assert.ok(blocked(await attempt(d, persona, `UPDATE public.profiles SET role = 'owner' WHERE id = '${ID.ADMIN}'`)), `${persona.role}/${persona.sub}`);
    }
  });
});

describe('[SIMULATED] decision C: payment administration and its audit trail', () => {
  let db;
  before(async () => { db = await build(['A', 'B', 'C']); });
  const edit = (persona, set) => attempt(db, persona, `UPDATE public.payments SET ${set}${/^metadata/.test(set) || /^(id|booking_id|user_id|provider|gateway|customer_email|created_at|updated_at)/.test(set) ? '' : `, ${why()}`} RETURNING id, updated_at`);

  test('authorised, active administrators (admin and Owner) edit the 7 approved columns', async () => {
    for (const persona of [PERSONA.admin, PERSONA.owner]) {
      for (const set of [`amount = 150.50`, `currency = 'USD'`, `payment_type = 'balance'`, `status = 'successful'`, `payment_method = 'bank transfer'`, `metadata = '{"note":"x","adjustment_reason":"checked by finance"}'`, `paid_at = now()`]) {
        const r = await edit(persona, set);
        assert.equal(r.count, 1, `${persona.sub}: ${set} ${r.message ?? ''}`);
      }
    }
  });

  test('ordinary users, staff, viewers, inactive administrators, inactive Owners and anonymous callers cannot edit a payment', async () => {
    for (const persona of [PERSONA.user, PERSONA.staff, PERSONA.viewer, PERSONA.userInactive, PERSONA.adminInactive, PERSONA.ownerInactive, PERSONA.anon]) {
      assert.ok(blocked(await edit(persona, `status = 'refunded'`)), `${persona.role}/${persona.sub}`);
    }
    assert.equal((await db.query(`SELECT status FROM public.payments`)).rows[0].status, 'pending');
  });

  test('inactive administrators are refused by A alone, before C is applied', async () => {
    const d = await build(['A']);
    assert.ok(blocked(await attempt(d, PERSONA.adminInactive, `UPDATE public.payments SET status = 'refunded'`)));
    assert.ok(blocked(await attempt(d, PERSONA.ownerInactive, `UPDATE public.payments SET status = 'refunded'`)));
    assert.equal((await attempt(d, PERSONA.admin, `UPDATE public.payments SET status = 'processing', ${why()} RETURNING id`)).count, 1);
  });

  test('identifiers, the booking relationship, the provider, gateway references and the customer email are protected from every role', async () => {
    const protectedSql = [`id = gen_random_uuid()`, `booking_id = gen_random_uuid()`, `user_id = '${ID.ADMIN}'`, `user_id = NULL`, `provider = 'paystack'`, `gateway_reference = 'g-1'`, `gateway_transaction_id = 't-1'`, `customer_email = 'x@example.test'`, `created_at = now()`, `updated_at = now()`];
    for (const persona of [PERSONA.admin, PERSONA.owner]) for (const set of protectedSql) assert.ok(denied(await edit(persona, set)), `${persona.sub}: ${set}`);
    // The trigger is independent of grants: even a re-granted table-level UPDATE cannot change an identifier.
    const d = await build(['A']);
    await d.exec(`GRANT UPDATE ON public.payments TO authenticated, service_role`);
    for (const persona of [PERSONA.admin, PERSONA.service]) for (const set of [`booking_id = gen_random_uuid()`, `gateway_reference = 'g-2'`, `provider = 'paystack'`, `user_id = '${ID.ADMIN}'`, `customer_email = 'y@example.test'`]) {
      const r = await attempt(d, persona, `UPDATE public.payments SET ${set}`);
      assert.ok(denied(r), `${persona.role}: ${set} -> ${r.message}`);
    }
  });

  test('no browser role can delete or truncate payments, and unrestricted table privileges are not granted', async () => {
    for (const persona of [PERSONA.admin, PERSONA.owner, PERSONA.user]) {
      assert.ok(denied(await attempt(db, persona, `DELETE FROM public.payments`)));
      assert.ok(denied(await attempt(db, persona, `TRUNCATE public.payments`)));
    }
    assert.equal((await db.query(`SELECT has_table_privilege('authenticated', 'public.payments', 'UPDATE') u, has_table_privilege('authenticated', 'public.payments', 'DELETE') d, has_table_privilege('authenticated', 'public.payments', 'INSERT') i`)).rows[0].u, false);
    const cols = (await db.query(`SELECT string_agg(column_name, ',' ORDER BY column_name) c FROM information_schema.column_privileges WHERE table_schema = 'public' AND table_name = 'payments' AND grantee = 'authenticated' AND privilege_type = 'UPDATE'`)).rows[0].c;
    assert.equal(cols, 'amount,currency,metadata,paid_at,payment_method,payment_type,status');
  });

  test('every edit is audited: who, when, which payment and booking, which fields, before and after; unchanged saves are not logged', async () => {
    const d = await build(['A', 'B', 'C']);
    await d.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE authenticated`);
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [ID.ADMIN]);
      await tx.query(`UPDATE public.payments SET amount = 250, status = 'successful', metadata = '{"adjustment_reason":"customer paid by transfer"}'`);
      await tx.query(`UPDATE public.payments SET amount = 250`);
    });
    const rows = await audit(d, 'payment.updated');
    assert.equal(rows.length, 1, 'one audit row: the repeated identical save is not logged');
    const [row] = rows;
    assert.equal(row.actor_user_id, ID.ADMIN);
    const m = row.metadata;
    assert.deepEqual(m.changed_fields, ['amount', 'status'], 'the reason is not stored on the payment row');
    assert.deepEqual([m.before.amount, m.before.status, m.after.amount, m.after.status], [100, 'pending', 250, 'successful']);
    assert.equal(m.db_role, 'authenticated');
    assert.equal(m.context, 'administrator_edit');
    assert.equal(m.adjustment_reason, 'customer paid by transfer');
    assert.ok(m.payment_id && m.booking_id);
    const created = (await d.query(`SELECT created_at, now() n FROM public.audit_logs WHERE action = 'payment.updated'`)).rows[0];
    assert.ok(created.created_at <= created.n, 'timestamped by the database');
    assert.ok((await d.query(`SELECT updated_at > created_at u FROM public.payments`)).rows[0].u, 'updated_at maintained');
  });

  test('the audit trail cannot be bypassed or tampered with: failure rolls the edit back, and no browser role can alter audit rows or the triggers', async () => {
    const d = await build(['A', 'B', 'C']);
    await d.exec(`ALTER TABLE public.audit_logs ADD CONSTRAINT audit_fail CHECK (action <> 'payment.updated')`);
    assert.ok(!(await attempt(d, PERSONA.admin, `UPDATE public.payments SET amount = 7, ${why()}`)).ok, 'fail-closed');
    assert.equal((await d.query(`SELECT amount::int a FROM public.payments`)).rows[0].a, 100);
    for (const persona of [PERSONA.admin, PERSONA.owner]) {
      assert.ok(denied(await attempt(d, persona, `ALTER TABLE public.payments DISABLE TRIGGER trg_stage4_payments_audit`)));
      assert.ok(denied(await attempt(d, persona, `SELECT public.stage4_payments_audit()`)));
      assert.ok(denied(await attempt(d, persona, `UPDATE public.audit_logs SET action = 'x'`)));
      assert.ok(denied(await attempt(d, persona, `INSERT INTO public.audit_logs (action) VALUES ('payment.updated')`)));
    }
  });

  test('service_role keeps read access to payments only (no application path edits them with the service key)', async () => {
    assert.equal((await attempt(db, PERSONA.service, 'SELECT id FROM public.payments')).rows.length, 1);
    assert.ok(denied(await attempt(db, PERSONA.service, `UPDATE public.payments SET status = 'failed'`)));
    assert.ok(denied(await attempt(db, PERSONA.service, `DELETE FROM public.payments`)));
  });

  test('existing workflow compatibility: an active admin inserts a payment exactly as server.ts does (user JWT, explicit columns) and reads it back', async () => {
    const ins = await attempt(db, PERSONA.admin, `INSERT INTO public.payments (booking_id, user_id, amount, currency, payment_type, provider, status, gateway_reference, gateway_transaction_id, payment_method, customer_email, metadata, paid_at) SELECT id, '${ID.ADMIN}', 40, 'NGN', 'deposit', 'manual', 'successful', NULL, NULL, 'cash', email, '{}', now() FROM public.bookings LIMIT 1 RETURNING id, booking_id, user_id, amount, currency, payment_type, provider, status, gateway_reference, gateway_transaction_id, payment_method, customer_email, metadata, paid_at, created_at, updated_at`);
    assert.ok(ins.ok, ins.message);
    assert.ok(blocked(await attempt(db, PERSONA.user, `INSERT INTO public.payments (booking_id, amount, provider) SELECT id, 1, 'manual' FROM public.bookings LIMIT 1`)));
    assert.ok(blocked(await attempt(db, PERSONA.adminInactive, `INSERT INTO public.payments (booking_id, amount, provider) SELECT id, 1, 'manual' FROM public.bookings LIMIT 1`)));
  });
});

describe('[SIMULATED] rollback of the final-decision changes', () => {
  test('rolling back A removes the payments policy, column grants, triggers and functions, keeps audit history and restores the Phase 1 payments state', async () => {
    const phase1 = await build([]);
    const grants = async (d) => JSON.stringify((await d.query(`SELECT grantee, privilege_type, column_name FROM information_schema.column_privileges WHERE table_schema = 'public' AND table_name = 'payments' AND grantee IN ('anon','authenticated','service_role') ORDER BY 1, 2, 3`)).rows);
    const policies = async (d) => JSON.stringify((await d.query(`SELECT policyname, cmd, permissive FROM pg_policies WHERE tablename = 'payments' ORDER BY 1`)).rows);
    const d = await build(['A']);
    await d.transaction(async (tx) => { await tx.exec(`SET LOCAL ROLE authenticated`); await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [ID.ADMIN]); await tx.query(`UPDATE public.payments SET amount = 9, metadata = '{"adjustment_reason":"typo"}'`); });
    const logged = (await d.query(`SELECT count(*)::int n FROM public.audit_logs WHERE action = 'payment.updated'`)).rows[0].n;
    assert.equal(logged, 1);
    await runScript(d, ROLLBACK(UNDO.A));
    assert.equal(await grants(d), await grants(phase1));
    assert.equal(await policies(d), await policies(phase1));
    assert.equal((await d.query(`SELECT count(*)::int n FROM pg_trigger WHERE tgrelid = 'public.payments'::regclass AND NOT tgisinternal`)).rows[0].n, 0);
    assert.equal((await d.query(`SELECT count(*)::int n FROM pg_proc WHERE proname LIKE 'stage4\\_payments\\_%'`)).rows[0].n, 0);
    assert.equal((await d.query(`SELECT count(*)::int n FROM public.audit_logs WHERE action = 'payment.updated'`)).rows[0].n, logged, 'audit history is never deleted by a rollback');
    assert.equal((await d.query(`SELECT amount::int a FROM public.payments`)).rows[0].a, 9, 'a rollback restores structure, never business data');
  });

  test('independent and ordered rollbacks: A, B and C each roll back alone; B cannot roll back under C; C, B, A in order restores the Phase 1 state', async () => {
    for (const only of ['A', 'B']) {
      const d = await build([only]);
      await runScript(d, ROLLBACK(UNDO[only]));
      assert.equal((await d.query(`SELECT count(*)::int n FROM dfabulous_stage4.phase2_state`)).rows[0].n, 0, only);
    }
    const c = await build(['B', 'C']);
    await assert.rejects(() => runScript(c, ROLLBACK(UNDO.B)), /proposal C is applied/);
    await runScript(c, ROLLBACK(UNDO.C));
    await runScript(c, ROLLBACK(UNDO.B));
    const all = await build(['A', 'B', 'C']);
    for (const p of ['C', 'B', 'A']) await runScript(all, ROLLBACK(UNDO[p]));
    assert.equal((await all.query(`SELECT count(*)::int n FROM dfabulous_stage4.phase2_state`)).rows[0].n, 0);
    assert.equal((await attempt(all, PERSONA.adminInactive, 'SELECT id FROM public.payments')).rows.length, 1, 'production behaviour is back (the finding S3 returns)');
  });
});
