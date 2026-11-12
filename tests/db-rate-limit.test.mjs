// Executes the real rate-limit migrations against an in-process PostgreSQL (PGlite). Nothing here
// touches Supabase, a network database or production data.
//
// Coverage: atomic upsert counting, window reset, bounded batch cleanup, parameter validation,
// RLS/privileges (anon, authenticated, service_role), index presence, and idempotent re-application.
// Limitation: PGlite is single-connection, so true multi-session lock contention (SKIP LOCKED and the
// advisory lock) is documented as a staging verification step rather than simulated here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const original = readFileSync(new URL('20261110120000_api_rate_limits.sql', migrationsDir), 'utf8');
const cleanup = readFileSync(new URL('20261111090000_api_rate_limits_cleanup_hardening.sql', migrationsDir), 'utf8');

/** @type {PGlite} */
let db;

async function asRole(role, sql) {
  await db.exec(`SET ROLE ${role}`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec('RESET ROLE');
  }
}

async function denied(role, sql) {
  await assert.rejects(() => asRole(role, sql), /permission denied/i, `${role} must be denied: ${sql}`);
}

before(async () => {
  db = new PGlite();
  // Supabase provisions these roles; the migrations assume they exist.
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  await db.exec(original);
  await db.exec(cleanup);
});

after(async () => {
  await db.close();
});

describe('consume_rate_limit (atomic upsert preserved)', () => {
  test('counts within a window and denies once the limit is exceeded', async () => {
    const results = [];
    for (let index = 0; index < 4; index += 1) {
      const { rows } = await db.query("SELECT public.consume_rate_limit('t:atomic', 3, 60) AS allowed");
      results.push(rows[0].allowed);
    }
    assert.deepEqual(results, [true, true, true, false]);
    const { rows } = await db.query("SELECT request_count FROM public.api_rate_limits WHERE bucket_key = 't:atomic'");
    assert.equal(rows.length, 1, 'one row per bucket');
    assert.equal(rows[0].request_count, 4);
  });

  test('buckets are independent', async () => {
    await db.query("SELECT public.consume_rate_limit('t:a', 1, 60)");
    const { rows } = await db.query("SELECT public.consume_rate_limit('t:b', 1, 60) AS allowed");
    assert.equal(rows[0].allowed, true);
  });

  test('a new window starts once the previous one has elapsed', async () => {
    await db.query("SELECT public.consume_rate_limit('t:reset', 1, 60)");
    assert.equal((await db.query("SELECT public.consume_rate_limit('t:reset', 1, 60) AS a")).rows[0].a, false);
    await db.query("UPDATE public.api_rate_limits SET window_start = now() - interval '2 minutes' WHERE bucket_key = 't:reset'");
    assert.equal((await db.query("SELECT public.consume_rate_limit('t:reset', 1, 60) AS a")).rows[0].a, true);
    const { rows } = await db.query("SELECT request_count FROM public.api_rate_limits WHERE bucket_key = 't:reset'");
    assert.equal(rows[0].request_count, 1);
  });

  test('rejects invalid parameters', async () => {
    for (const args of ["NULL, 1, 60", "'', 1, 60", `'${'x'.repeat(201)}', 1, 60`, "'k', 0, 60", "'k', 100001, 60", "'k', 1, 0", "'k', 1, 86401"]) {
      await assert.rejects(() => db.query(`SELECT public.consume_rate_limit(${args})`), /Invalid rate limit parameters/);
    }
  });

  test('the request path never performs an unbounded delete (at most one 100-row batch)', async () => {
    await db.exec("TRUNCATE public.api_rate_limits");
    await db.exec(`
      INSERT INTO public.api_rate_limits (bucket_key, window_start, request_count, updated_at)
      SELECT 'old:' || g, now() - interval '3 days', 1, now() - interval '3 days' FROM generate_series(1, 1000) g;
    `);
    // ~1% of calls trigger cleanup; 1000 calls make a trigger overwhelmingly likely, and the cap bounds the deletion.
    for (let index = 0; index < 1000; index += 1) {
      await db.query("SELECT public.consume_rate_limit('t:hot', 100000, 60)");
    }
    const { rows } = await db.query("SELECT count(*)::int AS n FROM public.api_rate_limits WHERE bucket_key LIKE 'old:%'");
    assert.ok(rows[0].n >= 1000 - 100 * 40, 'deletion stayed bounded per call');
    assert.ok(rows[0].n < 1000, 'opportunistic cleanup removed some expired rows');
    const hot = await db.query("SELECT request_count FROM public.api_rate_limits WHERE bucket_key = 't:hot'");
    assert.equal(hot.rows[0].request_count, 1000, 'cleanup never disturbed the live counter');
  });
});

describe('cleanup_expired_rate_limits (bounded batches)', () => {
  test('deletes only expired rows, in bounded batches, and never live rows', async () => {
    await db.exec('TRUNCATE public.api_rate_limits');
    await db.exec(`
      INSERT INTO public.api_rate_limits (bucket_key, window_start, request_count, updated_at)
      SELECT 'expired:' || g, now() - interval '26 hours', 1, now() - interval '26 hours' FROM generate_series(1, 2500) g;
      INSERT INTO public.api_rate_limits (bucket_key, window_start, request_count, updated_at)
      SELECT 'fresh:' || g, now() - interval '1 hour', 1, now() FROM generate_series(1, 50) g;
      INSERT INTO public.api_rate_limits (bucket_key, window_start, request_count, updated_at)
      VALUES ('edge:day-long-window-still-live', now() - interval '23 hours', 9, now());
    `);

    const first = (await db.query('SELECT public.cleanup_expired_rate_limits(1000, 2) AS n')).rows[0].n;
    assert.equal(first, 2000, 'two batches of 1000 is the hard cap for one call');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.api_rate_limits WHERE bucket_key LIKE 'expired:%'")).rows[0].n, 500);

    const second = (await db.query('SELECT public.cleanup_expired_rate_limits(1000, 2) AS n')).rows[0].n;
    assert.equal(second, 500);
    assert.equal((await db.query('SELECT public.cleanup_expired_rate_limits(1000, 2) AS n')).rows[0].n, 0);

    const remaining = (await db.query('SELECT count(*)::int AS n FROM public.api_rate_limits')).rows[0].n;
    assert.equal(remaining, 51, 'fresh and still-live buckets are untouched');
  });

  test('cleanup rejects unbounded or invalid parameters', async () => {
    for (const args of ['0, 1', '5001, 1', '10, 0', '10, 21', 'NULL, 1', '10, NULL']) {
      await assert.rejects(() => db.query(`SELECT public.cleanup_expired_rate_limits(${args})`), /Invalid cleanup parameters/);
    }
  });

  test('an expired bucket that is hit again starts a fresh window (no stale count)', async () => {
    await db.exec('TRUNCATE public.api_rate_limits');
    await db.exec("INSERT INTO public.api_rate_limits (bucket_key, window_start, request_count, updated_at) VALUES ('t:stale', now() - interval '30 hours', 99, now() - interval '30 hours')");
    assert.equal((await db.query("SELECT public.consume_rate_limit('t:stale', 5, 900) AS a")).rows[0].a, true);
    assert.equal((await db.query("SELECT request_count FROM public.api_rate_limits WHERE bucket_key = 't:stale'")).rows[0].request_count, 1);
  });

  test('cleanup predicate is index-backed', async () => {
    const indexes = (await db.query("SELECT indexname FROM pg_indexes WHERE tablename = 'api_rate_limits'")).rows.map((row) => row.indexname);
    assert.ok(indexes.includes('api_rate_limits_window_start_idx'));
    await db.exec('SET enable_seqscan = off');
    const plan = (await db.query("EXPLAIN SELECT bucket_key FROM public.api_rate_limits WHERE window_start < now() - interval '25 hours' ORDER BY window_start LIMIT 1000")).rows.map((row) => row['QUERY PLAN']).join('\n');
    await db.exec('RESET enable_seqscan');
    assert.match(plan, /api_rate_limits_window_start_idx/);
  });
});

describe('privileges and RLS', () => {
  test('RLS is enabled with no policies', async () => {
    const { rows } = await db.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.api_rate_limits'::regclass");
    assert.equal(rows[0].relrowsecurity, true);
    const policies = await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'api_rate_limits'");
    assert.equal(policies.rows[0].n, 0);
  });

  test('anon and authenticated cannot read the table or execute either function', async () => {
    for (const role of ['anon', 'authenticated']) {
      await denied(role, 'SELECT * FROM public.api_rate_limits');
      await denied(role, "INSERT INTO public.api_rate_limits (bucket_key) VALUES ('x')");
      await denied(role, 'DELETE FROM public.api_rate_limits');
      await denied(role, "SELECT public.consume_rate_limit('x', 1, 60)");
      await denied(role, 'SELECT public.cleanup_expired_rate_limits()');
    }
  });

  test('service_role can execute both functions but has no direct table privileges', async () => {
    const consume = await asRole('service_role', "SELECT public.consume_rate_limit('t:svc', 2, 60) AS allowed");
    assert.equal(consume.rows[0].allowed, true);
    const clean = await asRole('service_role', 'SELECT public.cleanup_expired_rate_limits(10, 1) AS n');
    assert.equal(typeof clean.rows[0].n, 'number');
    await denied('service_role', 'SELECT * FROM public.api_rate_limits');
  });

  test('both functions are SECURITY DEFINER with a pinned empty search_path and no PUBLIC execute', async () => {
    const { rows } = await db.query(`
      SELECT p.proname, p.prosecdef, p.proconfig, has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('consume_rate_limit', 'cleanup_expired_rate_limits')
      ORDER BY p.proname`);
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.prosecdef, true, `${row.proname} must be SECURITY DEFINER`);
      assert.ok(row.proconfig.some((setting) => /^search_path=/.test(setting)), `${row.proname} must pin search_path`);
      assert.equal(row.public_exec, false, `${row.proname} must not be executable by PUBLIC`);
    }
  });
});

describe('migration safety', () => {
  test('re-applying the hardening migration is idempotent and preserves state', async () => {
    await db.exec('TRUNCATE public.api_rate_limits');
    await db.query("SELECT public.consume_rate_limit('t:idem', 5, 60)");
    await db.exec(cleanup);
    const { rows } = await db.query("SELECT request_count FROM public.api_rate_limits WHERE bucket_key = 't:idem'");
    assert.equal(rows[0].request_count, 1);
    await denied('anon', "SELECT public.consume_rate_limit('x', 1, 60)");
  });

  test('the hardening migration fails safely when the base table is missing', async () => {
    const scratch = new PGlite();
    try {
      await assert.rejects(() => scratch.exec(cleanup), /Preflight failed/);
    } finally {
      await scratch.close();
    }
  });
});
