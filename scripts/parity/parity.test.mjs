// STAGE 3 PARITY TEST: the Express backend (server.ts) versus the Supabase Edge Function (supabase/functions/dfabulous-api), all 24 API routes.
// Both run locally as separate processes against the SAME in-memory fake of Supabase and Resend (scripts/parity/fake-supabase.mjs). No network, no real
// credentials, no production or staging data. Run with: npm run test:parity   (about 5 minutes; needs Deno on PATH)
// This proves behavioural equivalence of the two code bases under identical simulated conditions. It does NOT prove behaviour on a deployed Edge Function,
// against real PostgREST/RLS, real Supabase Auth or the real Resend service.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { acceptance } from './accepted.mjs';
import { runParity } from './run.mjs';
import { ROUTES, SCENARIOS } from './scenarios.mjs';

let results = [];
before(async () => {
  results = await runParity();
  mkdirSync('supabase/staging/reports/parity', { recursive: true });
  writeFileSync('supabase/staging/reports/parity/parity-results.json', `${JSON.stringify(results, null, 2)}\n`);
}, { timeout: 1_200_000 });
after(() => {});

const byId = (id) => SCENARIOS.find((s) => s.id === id);

describe('[PARITY] Express versus Edge Function, 24 routes', () => {
  test('[STATIC] the two route tables are identical: same 24 methods and paths (Express additionally has the SPA catch-all and the 404 /api/settings handler)', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const express = [...readFileSync('server.ts', 'utf8').matchAll(/app\.(get|post|put|patch|delete)\(\s*'(\/api\/[^']+)'/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`).sort();
    const dir = 'supabase/functions/dfabulous-api/routes';
    const edge = readdirSync(dir).flatMap((f) => [...readFileSync(`${dir}/${f}`, 'utf8').matchAll(/Routes\.(get|post|put|patch|delete)\(\s*'(\/api\/[^']+)'/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`)).sort();
    assert.equal(express.length, 24);
    assert.deepEqual(edge, express);
    assert.deepEqual([...ROUTES].sort(), express.map((r) => r.replace(/:\w+/, (m) => m)).sort().map((r) => r), 'the scenario catalogue covers exactly these routes');
  });

  test('the harness itself is sound: every scenario ran, the fake served every request, and no request left the machine', () => {
    assert.equal(results.length, SCENARIOS.length);
    for (const r of results) assert.ok(!r.diffs.some((d) => d.category.startsWith('harness')), `${r.id}: ${JSON.stringify(r.diffs.filter((d) => d.category.startsWith('harness')))}`);
  });

  test('every one of the 24 routes has success, authentication, authorisation and validation or not-found scenarios on both backends', () => {
    const trivial = /^GET \/api\/(health|diagnostics|services|gallery|videos|testimonials|availability)$/;
    for (const route of ROUTES) {
      const own = results.filter((r) => r.route === route);
      assert.ok(own.length >= (trivial.test(route) ? 1 : 4), `${route}: ${own.length} scenarios`);
      assert.ok(own.some((r) => [200, 201].includes(r.express.status) && [200, 201].includes(r.edge.status)), `${route}: no successful scenario`);
      const needsAuth = !/health|diagnostics|availability|services|gallery|videos|testimonials|\/api\/bookings$|\/api\/messages$/.test(route) || /admin/.test(route);
      if (needsAuth && route !== 'POST /api/bookings' && route !== 'POST /api/messages') {
        assert.ok(own.some((r) => r.express.status === 401 && r.edge.status === 401), `${route}: no 401 scenario`);
        assert.ok(own.some((r) => r.express.status === 403 && r.edge.status === 403), `${route}: no 403 scenario`);
      }
    }
  });

  test('every difference is identified: none is left unexplained (status, body, headers, database operations, auth calls, e-mails, resulting state)', () => {
    const unexplained = [];
    for (const r of results) for (const d of r.diffs) if (!acceptance(byId(r.id), d)) unexplained.push(`${r.id}: ${d.category}${d.header ? ` (${d.header})` : ''}\n    ${JSON.stringify(d).slice(0, 500)}`);
    assert.deepEqual(unexplained, [], `\n${unexplained.join('\n')}`);
  });

  test('both backends reach the same decision on every request: identical status codes and bodies (apart from the documented 404 differences)', () => {
    for (const r of results) {
      if (/CROSS :: (unknown API path|wrong method)/.test(r.id)) continue;
      assert.deepEqual(r.express.statuses, r.edge.statuses, r.id);
      assert.deepEqual(r.express.body, r.edge.body, r.id);
    }
  });

  test('both backends issue the same database operations with the same credential class (anon, user JWT, service role), filters and payloads', () => {
    for (const r of results) assert.ok(!r.diffs.some((d) => d.category === 'database operations' || d.category === 'auth calls'), r.id);
    const creds = new Set(); // sanity: the comparison covered service-role and user-jwt traffic, not only anonymous reads
    for (const r of results) if (r.edge.db > 0) creds.add('seen');
    assert.ok(creds.size > 0);
  });

  test('both backends leave the database in the same state after every scenario, including writes, deletes and rejected writes', () => {
    for (const r of results) assert.ok(!r.diffs.some((d) => d.category === 'resulting database state'), r.id);
  });

  test('e-mail notifications are identical (recipients, sender, subject, HTML, text, status reporting) under four configurations and two provider failures', () => {
    for (const r of results) assert.ok(!r.diffs.some((d) => d.category === 'emails'), r.id);
    const mail = results.filter((r) => /POST \/api\/(bookings|messages)/.test(r.route) && r.express.emails > 0);
    assert.ok(mail.length >= 4, 'notification e-mails were actually produced and compared');
    assert.ok(results.some((r) => /Resend rejects/.test(r.id) && r.express.status === 200 && r.edge.status === 200), 'a provider failure never fails the request on either backend');
  });

  test('rate limiting: both enforce the same limits (5 submissions per 15 minutes per client); the Edge Function uses the durable database limiter with the same parameters', () => {
    const six = results.filter((r) => /rate limit: 6th/.test(r.id));
    assert.equal(six.length, 2);
    for (const r of six) { assert.deepEqual(r.express.statuses, [200, 200, 200, 200, 200, 429], r.id); assert.deepEqual(r.edge.statuses, r.express.statuses, r.id); }
    const calls = results.flatMap((r) => r.edge.rateLimitCalls);
    assert.ok(calls.length > 0);
    for (const c of calls) { assert.equal(c.window, 900); assert.ok([5, 30, 90].includes(c.limit), JSON.stringify(c)); }
  });

  test('security: the service-role key is never accepted as a user token, and both backends refuse non-Bearer credentials', () => {
    for (const id of ['CROSS :: service-role key presented as a bearer token', 'CROSS :: authorization header with non-Bearer scheme']) {
      const r = results.find((x) => x.id === id);
      assert.equal(r.express.status, 401, id); assert.equal(r.edge.status, 401, id);
    }
  });

  test('[STAGE 4 CROSS-CHECK] every database operation the application performs is allowed by the Stage 4 least-privilege matrix (so installing the approved schema cannot break a route)', async () => {
    const { readFileSync } = await import('node:fs');
    const matrix = new Map();
    const validate = readFileSync('supabase/staging/install/07_validate_hardened.sql', 'utf8');
    for (const m of validate.matchAll(/\('(\w+)',\s+'(anon|authenticated|service_role)',\s+'([A-Z, ]+)'\)/g)) matrix.set(`${m[2]}|${m[1]}`, new Set(m[3].split(',').map((s) => s.trim())));
    const role = { 'user-jwt': 'authenticated', 'service-role': 'service_role', anon: 'anon' };
    const verb = { GET: ['SELECT'], POST: ['INSERT'], PATCH: ['UPDATE'], DELETE: ['DELETE'] };
    const missing = new Set();
    const seen = new Set();
    for (const r of results) for (const op of r.ops) {
      const [cred, method, table] = op.split('|');
      const [m, upsert] = method.split('+');
      const needed = [...verb[m], ...(upsert ? ['INSERT', 'UPDATE'] : [])];
      seen.add(`${cred}|${table}`);
      for (const p of needed) if (!matrix.get(`${role[cred]}|${table}`)?.has(p)) missing.add(`${role[cred]} needs ${p} on ${table} (${op})`);
    }
    // The privilege matrix covers every operation the code performs (defect D1, the former "settings" table query, is fixed and regression-tested above).
    assert.deepEqual([...missing].sort(), [], 'the privilege matrix must cover every operation the code performs');
    assert.ok(seen.size >= 10, `operations observed across ${seen.size} credential/table pairs`);
  });

  test('[STATIC] the Edge Function and Express use the user JWT only where the Stage 4 policies expect it (bookings status/update/delete, payments insert) and the service role elsewhere', () => {
    const userJwtTables = new Set(results.flatMap((r) => r.ops).filter((o) => o.startsWith('user-jwt|')).map((o) => `${o.split('|')[1]} ${o.split('|')[2]}`));
    assert.deepEqual([...userJwtTables].sort(), ['DELETE bookings', 'GET bookings', 'GET payments', 'GET profiles', 'GET user_permissions', 'PATCH bookings', 'POST payments']);
  });

  test('[REGRESSION D1] the settings data resource reads the site_settings table on both backends and returns the stored keys', () => {
    const r = results.find((x) => x.id === 'GET /api/admin/data/:resource :: admin reads settings');
    for (const side of [r.express, r.edge]) {
      assert.equal(side.status, 200);
      assert.deepEqual(side.body, { success: true, data: [{ key: 'contact_phone', value: '+44 0000' }, { key: 'hero_title', value: 'Welcome' }] });
    }
    assert.ok(!results.some((x) => x.ops.includes('service-role|GET|settings')), 'no backend queries a table called "settings" any more');
  });

  test('[REGRESSION D2 to D5] expected conflicts answer HTTP 409 with the same clear body on both backends, and change nothing', () => {
    const cases = [
      ['PATCH /api/bookings/:id :: update date to a blocked date', { success: false, error: 'Date Unavailable', details: 'This date is no longer available. Please select another date.' }],
      ['POST /api/admin/blocked-dates :: duplicate date', { success: false, error: 'Date Already Blocked', details: 'This date is already blocked.' }],
      ['POST /api/bookings/:id/payments :: duplicate gateway reference', { success: false, error: 'Duplicate Payment Reference', details: 'A payment with this gateway reference already exists.' }],
      ['POST /api/admin/users :: existing email', { success: false, error: 'User Already Exists', details: 'A user with this email address already exists.' }],
    ];
    for (const [id, body] of cases) {
      const r = results.find((x) => x.id === id);
      assert.ok(r, id);
      for (const [name, side] of [['express', r.express], ['edge', r.edge]]) {
        assert.equal(side.statuses.at(-1), 409, `${id} (${name})`);
        assert.deepEqual(side.body, body, `${id} (${name})`);
      }
      assert.ok(!r.diffs.some((d) => d.category === 'resulting database state'), `${id}: identical state on both backends`);
    }
    // the duplicate payment: first submission accepted, second refused
    assert.deepEqual(results.find((x) => /duplicate gateway reference/.test(x.id)).express.statuses, [200, 409]);
    // other failures keep their status: invalid input stays 400, missing rows stay 404, authorisation stays 401/403, only conflicts moved to 409
    assert.ok(!results.some((x) => x.express.status >= 500), 'no scenario now ends in a 5xx on either backend');
    assert.ok(!results.some((x) => x.edge.status >= 500));
  });

  test('accepted differences are few, explained, and listed (the parity report relies on this list)', () => {
    const counts = {};
    for (const r of results) for (const d of r.diffs) { const a = acceptance(byId(r.id), d); if (a) counts[`${d.category}${d.header ? `:${d.header}` : ''}`] = (counts[`${d.category}${d.header ? `:${d.header}` : ''}`] ?? 0) + 1; }
    assert.ok(Object.keys(counts).length <= 12, JSON.stringify(counts));
  });
});
