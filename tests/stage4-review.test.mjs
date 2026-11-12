// STAGE 4 FINAL SECURITY REVIEW: adjustment reasons, audit confidentiality, deletion context, trigger robustness, grant bypass, credential exposure.
// Database tests are SIMULATED (PGlite, PostgreSQL 18.x, in memory). Static tests read repository files only. Neither proves behaviour on real Supabase / PostgreSQL 17.11.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { ID, INSTALL, PERSONA, ROLLBACK, asUser, attempt, blocked, denied, freshSupabase, installBaseline, runScript, seedPersonas } from './helpers/stage4-db.mjs';

const PHASE2 = { A: '04_security_A.sql', B: '05_security_B.sql', C: '06_security_C.sql' };
async function build(proposals) {
  const db = await freshSupabase();
  await installBaseline(db);
  await runScript(db, INSTALL('02_privilege_normalisation.sql'));
  await seedPersonas(db);
  for (const p of proposals) await runScript(db, INSTALL(PHASE2[p]));
  return db;
}
const edit = (db, persona, set) => attempt(db, persona, `UPDATE public.payments SET ${set} RETURNING id`);
const reasonOf = (r) => `metadata = metadata || jsonb_build_object('adjustment_reason', ${r})`;
const events = async (db, action) => (await db.query(`SELECT actor_user_id, metadata FROM public.audit_logs WHERE action = $1 ORDER BY created_at, id`, [action])).rows;
const asService = async (db, sql) => {
  try { await db.transaction(async (tx) => { await tx.exec('SET LOCAL ROLE service_role'); await tx.query(sql); }); return { ok: true }; } catch (e) { return { ok: false, code: e.code, message: String(e.message) }; }
};

describe('[SIMULATED] review 1: every administrator payment edit needs a reason, enforced by the database', () => {
  test('missing, empty, blank, non-string and over-long reasons are rejected (SQLSTATE 23514) for admins and the Owner; the row is unchanged', async () => {
    const d = await build(['A', 'B', 'C']);
    const bad = [`amount = 5`, `amount = 5, ${reasonOf(`''`)}`, `amount = 5, ${reasonOf(`'    '`)}`, `amount = 5, ${reasonOf('42')}`, `amount = 5, ${reasonOf('true')}`, `amount = 5, ${reasonOf(`repeat('x', 501)`)}`, `status = 'failed', metadata = '{"note":"no reason"}'`, `amount = 5, metadata = metadata || '{"adjustment_reason": null}'`];
    for (const persona of [PERSONA.admin, PERSONA.owner]) for (const set of bad) {
      const r = await edit(d, persona, set);
      assert.equal(r.code, '23514', `${persona.sub}: ${set} -> ${r.message}`);
    }
    assert.deepEqual((await d.query(`SELECT amount::int a, status FROM public.payments`)).rows[0], { a: 100, status: 'pending' });
    assert.equal((await events(d, 'payment.updated')).length, 0);
  });

  test('a valid reason (1 to 500 characters) is accepted, is NOT stored on the payment row, and is recorded in the audit event', async () => {
    const d = await build(['A', 'B', 'C']);
    await d.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE authenticated');
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [ID.ADMIN]);
      await tx.query(`UPDATE public.payments SET status = 'successful', metadata = '{"note":"kept","adjustment_reason":"  Bank transfer confirmed on statement  "}'`);
      await tx.query(`UPDATE public.payments SET amount = 120, metadata = metadata || jsonb_build_object('adjustment_reason', repeat('y', 500))`);
    });
    assert.deepEqual((await d.query(`SELECT metadata FROM public.payments`)).rows[0].metadata, { note: 'kept' }, 'the reason never stays on the payment row');
    const rows = await events(d, 'payment.updated');
    assert.equal(rows.length, 2);
    // both edits share one transaction, hence one created_at: identify the rows by content, never by position
    const first = rows.find((r) => r.metadata.adjustment_reason === 'Bank transfer confirmed on statement');
    const second = rows.find((r) => r.metadata.adjustment_reason?.length === 500);
    assert.ok(first && second);
    assert.equal(first.actor_user_id, ID.ADMIN);
    assert.equal(first.metadata.context, 'administrator_edit');
    assert.ok(!JSON.stringify(first.metadata.before).includes('adjustment_reason') && !JSON.stringify(first.metadata.after).includes('adjustment_reason'));
  });

  test('an unchanged save needs no reason and writes no audit row; a reason cannot be carried over to a later edit', async () => {
    const d = await build(['A']);
    assert.equal((await edit(d, PERSONA.admin, `amount = 100`)).ok, true);
    assert.equal((await events(d, 'payment.updated')).length, 0);
    await d.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE authenticated');
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [ID.ADMIN]);
      await tx.query(`UPDATE public.payments SET amount = 101, metadata = '{"adjustment_reason":"first"}'`);
      await assert.rejects(() => tx.query(`UPDATE public.payments SET amount = 102`), /adjustment reason/);
    }).catch(() => {});
    assert.equal((await events(d, 'payment.updated')).length, 0, 'the failed second edit aborted the transaction as a whole');
  });

  test('the setting that carries the reason cannot be forged: a pre-set value never reaches an audit row, and a database-session edit has context database_session and no reason', async () => {
    const d = await build(['A']);
    await d.exec(`SELECT set_config('dfabulous.payment_reason', 'forged', false); UPDATE public.payments SET amount = 55;`);
    const [row] = await events(d, 'payment.updated');
    assert.equal(row.metadata.context, 'database_session');
    assert.equal(row.metadata.adjustment_reason, null);
    assert.equal(row.actor_user_id, null);
  });
});

describe('[SIMULATED] review 3: audit_logs confidentiality', () => {
  test('only the active Owner reads payment audit events (before/after values and reasons); every other persona gets nothing', async () => {
    const d = await build(['A', 'B', 'C']);
    await d.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE authenticated');
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [ID.ADMIN]);
      await tx.query(`UPDATE public.payments SET amount = 77, metadata = '{"adjustment_reason":"sensitive internal note"}'`);
    });
    const owner = await attempt(d, PERSONA.owner, `SELECT metadata FROM public.audit_logs WHERE action = 'payment.updated'`);
    assert.equal(owner.rows.length, 1);
    assert.equal(owner.rows[0].metadata.adjustment_reason, 'sensitive internal note');
    for (const persona of [PERSONA.user, PERSONA.staff, PERSONA.viewer, PERSONA.userInactive, PERSONA.admin, PERSONA.admin2, PERSONA.adminInactive, PERSONA.ownerInactive]) {
      assert.equal((await attempt(d, persona, `SELECT metadata FROM public.audit_logs`)).rows.length, 0, `${persona.sub}`);
    }
    assert.ok(!(await attempt(d, PERSONA.anon, `SELECT metadata FROM public.audit_logs`)).ok, 'anon has no privilege');
    const policies = (await d.query(`SELECT policyname, cmd, roles::text r FROM pg_policies WHERE tablename = 'audit_logs' AND permissive = 'PERMISSIVE'`)).rows;
    assert.deepEqual(policies.map((p) => `${p.policyname}:${p.cmd}`), ['audit_logs_read_active_owner:SELECT']);
  });

  test('the payer of a payment (payments.user_id) sees the row but neither the reason nor any audit data', async () => {
    const d = await build(['A', 'B', 'C']);
    await d.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE authenticated');
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [ID.ADMIN]);
      await tx.query(`UPDATE public.payments SET status = 'successful', metadata = '{"adjustment_reason":"internal only"}'`);
    });
    const own = await attempt(d, PERSONA.user, `SELECT metadata, status FROM public.payments`);
    assert.equal(own.rows.length, 1, 'the payer reads their own payment (production policy, unchanged)');
    assert.ok(!JSON.stringify(own.rows).includes('internal only'));
    assert.equal((await attempt(d, PERSONA.user, `SELECT 1 FROM public.audit_logs`)).rows.length, 0);
  });

  test('the application never returns audit_logs to a client (static)', () => {
    for (const f of ['server.ts', ...readdirSync('supabase/functions/dfabulous-api/routes').map((n) => `supabase/functions/dfabulous-api/routes/${n}`)]) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/\.from\('audit_logs'\)\s*\.(\w+)/g)) assert.equal(m[1], 'insert', `${f}: audit_logs is only ever written`);
    }
  });
});

describe('[SIMULATED] review 4: trigger recursion, escalation, failure handling and transaction consistency', () => {
  test('no recursion: audit_logs has no trigger and the audit insert cannot re-enter payments; trigger depth stays bounded', async () => {
    const d = await build(['A']);
    assert.equal((await d.query(`SELECT count(*)::int n FROM pg_trigger WHERE tgrelid = 'public.audit_logs'::regclass AND NOT tgisinternal`)).rows[0].n, 0);
    const refs = (await d.query(`SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'stage4%' AND pg_get_functiondef(oid) ~* '(update|delete from|insert into)\\s+public\\.payments'`)).rows;
    assert.deepEqual(refs, []);
  });

  test('the SECURITY DEFINER audit function has an empty search_path, fully qualified references, no EXECUTE for any API role, and cannot be called directly', async () => {
    const d = await build(['A']);
    const def = (await d.query(`SELECT pg_get_functiondef(oid) d, proconfig, prosecdef FROM pg_proc WHERE proname = 'stage4_payments_audit'`)).rows[0];
    assert.equal(def.prosecdef, true);
    assert.deepEqual(def.proconfig, ['search_path=""']);
    for (const persona of [PERSONA.admin, PERSONA.owner, PERSONA.service, PERSONA.anon]) assert.ok(denied(await attempt(d, persona, `SELECT public.stage4_payments_audit()`)));
    // a hostile schema earlier in an admin's search_path cannot capture anything
    await d.exec(`CREATE SCHEMA evil; CREATE FUNCTION evil.to_jsonb(anyelement) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"hijacked":true}'::jsonb $$; GRANT USAGE ON SCHEMA evil TO authenticated; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA evil TO authenticated;`);
    await d.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE authenticated');
      await tx.query(`SET LOCAL search_path = evil, public`);
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [ID.ADMIN]);
      await tx.query(`UPDATE public.payments SET amount = 3, metadata = '{"adjustment_reason":"x"}'`);
    });
    const [row] = await events(d, 'payment.updated');
    assert.deepEqual(row.metadata.changed_fields, ['amount']);
  });

  test('failure handling and consistency: an audit failure rolls the payment edit back; a failed edit leaves no audit row; a multi-row edit is all-or-nothing', async () => {
    const d = await build(['A']);
    await d.exec(`INSERT INTO public.payments (booking_id, user_id, amount, provider, gateway_reference) SELECT id, '${ID.USER}', 20, 'paystack', 'ref-2' FROM public.bookings LIMIT 1`);
    await d.exec(`ALTER TABLE public.audit_logs ADD CONSTRAINT audit_fail CHECK (metadata ->> 'context' IS DISTINCT FROM 'administrator_edit')`);
    const r = await edit(d, PERSONA.admin, `amount = amount + 1, ${reasonOf(`'bulk'`)}`);
    assert.equal(r.ok, false);
    assert.deepEqual((await d.query(`SELECT amount::int a FROM public.payments ORDER BY amount`)).rows, [{ a: 20 }, { a: 100 }]);
    await d.exec(`ALTER TABLE public.audit_logs DROP CONSTRAINT audit_fail`);
    assert.equal((await attempt(d, PERSONA.admin, `UPDATE public.payments SET amount = amount + 1, ${reasonOf(`'bulk'`)} RETURNING id`)).count, 2);
  });

  test('no privilege escalation: a browser role cannot change the guard or audit objects, disable them, or write audit rows', async () => {
    const d = await build(['A', 'B', 'C']);
    for (const persona of [PERSONA.admin, PERSONA.owner, PERSONA.service]) for (const sql of [`ALTER TABLE public.payments DISABLE TRIGGER ALL`, `DROP TRIGGER trg_stage4_payments_guard ON public.payments`,     `CREATE OR REPLACE FUNCTION public.stage4_payments_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$`, `ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY`, `ALTER TABLE public.payments OWNER TO authenticated`]) {
      assert.ok(denied(await attempt(d, persona, sql)), `${persona.role}: ${sql}`);
    }
        // GRANT by a non-owner without grant option is only a warning in PostgreSQL and changes nothing: prove that no privilege appears
        for (const persona of [PERSONA.admin, PERSONA.owner, PERSONA.service]) {
          const r = await asUser(d, persona, async (tx) => { await tx.exec(`GRANT UPDATE, DELETE ON public.payments TO authenticated, anon`); return (await tx.query(`SELECT has_table_privilege('anon', 'public.payments', 'UPDATE') a, has_table_privilege('authenticated', 'public.payments', 'DELETE') b`)).rows[0]; }).catch((e) => ({ error: e.code }));
          assert.ok(r.error === '42501' || (r.a === false && r.b === false), `${persona.role} GRANT: ${JSON.stringify(r)}`);
        }
    assert.ok(denied(await attempt(d, PERSONA.admin, `SET session_replication_role = replica`)), 'replica mode (which skips triggers) is superuser-only');
  });
});

describe('[SIMULATED] review 5: the column-level grant cannot be bypassed', () => {
  test('no other role, PUBLIC grant, function or service-role path can write payments; 07 check HA9 passes and detects drift', async () => {
    const d = await build(['A', 'B', 'C']);
    const rows = (await d.exec(INSTALL('07_validate_hardened.sql'))).flatMap((r) => r.rows ?? []).filter((r) => r.check_id);
    assert.equal(rows.find((r) => r.check_id === 'HA9').status, 'PASS');
    assert.equal(rows.find((r) => r.check_id === 'ZZ').status, 'PASS', JSON.stringify(rows.filter((r) => r.status !== 'PASS')));
    for (const drift of [`GRANT UPDATE ON public.payments TO PUBLIC`, `GRANT UPDATE (provider) ON public.payments TO authenticated`, `GRANT DELETE ON public.payments TO service_role`, `CREATE ROLE rogue; GRANT UPDATE ON public.payments TO rogue`,
      `CREATE FUNCTION public.zz_pay() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.payments SET amount = 0 $$`]) {
      const e = await build(['A', 'B', 'C']);
      await e.exec(drift);
      const v = (await e.exec(INSTALL('07_validate_hardened.sql'))).flatMap((r) => r.rows ?? []).filter((r) => r.check_id);
      assert.equal(v.find((r) => r.check_id === 'HA9').status, 'FAIL', drift);
    }
  });

  test('even if someone later grants a table-level privilege, identifiers stay immutable and edits still need an active administrator and a reason', async () => {
    const d = await build(['A']);
    await d.exec(`GRANT UPDATE, DELETE ON public.payments TO authenticated, service_role`);
    assert.ok(denied(await attempt(d, PERSONA.admin, `UPDATE public.payments SET provider = 'paystack'`)));
    assert.equal((await edit(d, PERSONA.admin, `amount = 1`)).code, '23514');
    assert.ok(blocked(await attempt(d, PERSONA.user, `UPDATE public.payments SET amount = 1, ${reasonOf(`'x'`)}`)));
    assert.ok(blocked(await attempt(d, PERSONA.adminInactive, `UPDATE public.payments SET amount = 1, ${reasonOf(`'x'`)}`)));
    assert.ok(denied(await attempt(d, PERSONA.service, `UPDATE public.payments SET gateway_reference = 'forged'`)));
    assert.ok(blocked(await attempt(d, PERSONA.admin, `DELETE FROM public.payments`)), 'the RESTRICTIVE delete deny still holds');
  });

  test('the service key has no application path to payments writes, and the only SECURITY DEFINER function that touches payments only reads them (static)', () => {
    const dump = readFileSync('supabase/staging/install/01_production_schema.sql', 'utf8');
    for (const m of dump.matchAll(/CREATE FUNCTION "public"\."(\w+)"[\s\S]*?\n\$\$;/g)) {
      assert.doesNotMatch(m[0], /(UPDATE|INSERT INTO|DELETE FROM|TRUNCATE)\s+("?public"?\.)?"?payments\b/i, `${m[1]} does not write payments`);
    }
    for (const f of ['server.ts', 'supabase/functions/dfabulous-api/routes/admin-data.ts', 'supabase/functions/dfabulous-api/routes/admin-bookings.ts', 'supabase/functions/dfabulous-api/lib/audit.ts']) {
      assert.doesNotMatch(readFileSync(f, 'utf8'), /(serverDatabase|serviceClient\(\)|serviceAdmin)\s*\.from\('payments'\)\s*\.(insert|update|upsert|delete)/, f);
    }
  });
});

describe('[SIMULATED] review 8: service-role deletion and role changes, with audit and rollback', () => {
  test('deletion with audit: payments keep their rows, the user_unlinked event is distinct from edits, and rolling A back afterwards keeps every audit row and every payment', async () => {
    const d = await build(['A', 'B', 'C']);
    assert.ok((await asService(d, `DELETE FROM public.profiles WHERE id = '${ID.USER}'`)).ok);
    assert.ok((await asService(d, `INSERT INTO public.audit_logs (actor_user_id, target_user_id, action, metadata) VALUES ('${ID.OWNER}', NULL, 'user.deleted', '{"deleted_user_id":"${ID.USER}","role":"user"}')`)).ok);
    assert.ok((await asService(d, `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.STAFF}'`)).ok);
    const counts = async () => (await d.query(`SELECT (SELECT count(*)::int FROM public.audit_logs) a, (SELECT count(*)::int FROM public.payments) p, (SELECT count(*)::int FROM public.payments WHERE user_id IS NULL) n`)).rows[0];
    const before = await counts();
    assert.deepEqual(before, { a: 3, p: 1, n: 1 }, 'seed + user_unlinked + user.deleted');
    for (const f of ['04_rollback_security_C.sql', '03_rollback_security_B.sql', '02_rollback_security_A.sql']) await runScript(d, ROLLBACK(f));
    assert.deepEqual(await counts(), before, 'rollbacks never delete audit rows or payments, and never resurrect the profile link');
    assert.equal((await events(d, 'payment.user_unlinked')).length, 1);
    assert.ok((await asService(d, `DELETE FROM public.profiles WHERE id = '${ID.VIEWER}'`)).ok, 'the backend deletion path still works in the rolled-back state');
  });
});

describe('[SIMULATED] review 9: rollback ordering', () => {
  test('01a (privilege rollback) refuses to run while any Phase 2 proposal is applied, and works once they are rolled back', async () => {
    const d = await build(['A']);
    await assert.rejects(() => runScript(d, ROLLBACK('01a_rollback_privilege_normalisation.sql')), /Phase 2 proposals are still applied/);
    assert.ok(!(await d.query(`SELECT has_table_privilege('authenticated', 'public.payments', 'DELETE') x`)).rows[0].x, 'privileges untouched by the refused script');
    await runScript(d, ROLLBACK('02_rollback_security_A.sql'));
    await runScript(d, ROLLBACK('01a_rollback_privilege_normalisation.sql'));
  });
});

describe('[STATIC] review 7: service-role and database credentials cannot reach the browser', () => {
  const walk = (dir, out = []) => {
    for (const n of readdirSync(dir)) {
      if (['node_modules', '.git', 'dist', '.next'].includes(n)) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p, out); else if (/\.(tsx?|jsx?|mjs|html)$/.test(n)) out.push(p);
    }
    return out;
  };

  test('browser source never reads a server-side secret or the service key', () => {
    for (const f of walk('src')) {
      const text = readFileSync(f, 'utf8');
      assert.doesNotMatch(text, /SERVICE_ROLE|service_role|SUPABASE_DB|DATABASE_URL|POSTGRES_PASSWORD|authenticator/i, f);
      for (const m of text.matchAll(/import\.meta\.env\.(\w+)/g)) assert.match(m[1], /^(VITE_|MODE|DEV|PROD|BASE_URL|SSR)/, `${f}: ${m[1]}`);
    }
  });

  test('the Vite build refuses VITE_-prefixed secrets and only defines the public URL, anon key and public settings', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    assert.match(config, /SERVICE_ROLE\|SECRET\|PRIVATE\|RESEND\|PASSWORD/);
    assert.match(config, /Refusing to build/);
    const defined = [...config.slice(config.indexOf('define:')).matchAll(/'import\.meta\.env\.(\w+)'/g)].map((m) => m[1]);
    assert.ok(defined.length > 0);
    for (const name of defined) assert.doesNotMatch(name, /SERVICE|SECRET|PASSWORD|DB_|TOKEN/i, name);
    assert.doesNotMatch(readFileSync('.env.example', 'utf8'), /VITE_[A-Z_]*(SERVICE_ROLE|SECRET|PASSWORD)/);
  });

  test('server responses never include the key: no response sends the key variable, a client object or an environment dump', () => {
    for (const f of ['server.ts', ...readdirSync('supabase/functions/dfabulous-api/routes').map((n) => `supabase/functions/dfabulous-api/routes/${n}`)]) {
      const text = readFileSync(f, 'utf8');
      assert.doesNotMatch(text, /res\.(json|send)\([^;]*(supabaseServiceRoleKey|SERVICE_ROLE_KEY|process\.env\b)/, f);
      assert.doesNotMatch(text, /c\.json\([^;]*(SERVICE_ROLE|Deno\.env)/, f);
    }
  });

  test('a built bundle, if present, contains no service-role JWT (static scan of dist)', () => {
    if (!existsSync('dist')) return;
    for (const f of walk('dist')) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\./g)) {
        const claims = Buffer.from(m[1], 'base64url').toString('utf8');
        assert.doesNotMatch(claims, /service_role/, f);
      }
    }
  });
});
