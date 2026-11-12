// End-to-end tests of the REAL Express backend (server.ts) running as a child process. The
// process runs in an empty temporary working directory (so dotenv cannot load any real .env file)
// with dummy configuration, and its fetch is replaced by an in-memory Supabase fake. No real
// credentials, network access or production data are involved.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';

const serverEntry = fileURLToPath(new URL('../server.ts', import.meta.url));
const preload = new URL('./helpers/fake-supabase-preload.mjs', import.meta.url).href;
const tsxLoader = import.meta.resolve('tsx');

const validBooking = {
  full_name: 'Test Customer',
  email: 'customer@example.test',
  phone: '+44 7700 900123',
  event_date: '2027-06-12',
  event_location: 'London',
  services_requested: ['bridal-styling'],
  estimated_guest_count: 100,
};

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

async function startServer(extraEnv = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dfab-express-test-'));
  // The gallery/video endpoints read these directories relative to the working directory.
  for (const dir of ['public/images/gallery', 'public/videos', 'public/images/video-thumbnails']) {
    mkdirSync(join(cwd, dir), { recursive: true });
  }
  const port = await freePort();
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    PORT: String(port),
    NODE_ENV: 'production',
    VITE_SUPABASE_URL: 'https://test-project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key-not-a-secret',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-a-secret',
    ...extraEnv,
  };
  const child = spawn(process.execPath, ['--import', tsxLoader, '--import', preload, serverEntry], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`Express server exited early:\n${output.slice(-1500)}`);
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) throw new Error(`Express server did not start:\n${output.slice(-1500)}`);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return {
    base,
    output: () => output,
    async stop() {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

function request(server, path, { method = 'GET', token, headers = {}, body } = {}) {
  const finalHeaders = { ...headers };
  if (token) finalHeaders.authorization = `Bearer ${token}`;
  if (body !== undefined) finalHeaders['content-type'] = 'application/json';
  return fetch(`${server.base}${path}`, { method, headers: finalHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe('Express backend (no trusted proxy configured)', () => {
  let server;
  before(async () => { server = await startServer(); });
  after(async () => { await server.stop(); });

  const block = (token) => request(server, '/api/admin/blocked-dates', { method: 'POST', token, body: { event_date: '2027-03-01' } });

  test('admin routes reject unauthenticated, invalid-token and non-admin callers', async () => {
    assert.equal((await block(undefined)).status, 401);
    assert.equal((await block('forged-token')).status, 401);
    const viewer = await block('viewer-token');
    assert.equal(viewer.status, 403);
    assert.ok(!JSON.stringify(await viewer.json()).includes('bookings.manage'), 'permission names must not leak');
  });

  test('unauthenticated flooding cannot exhaust an administrator quota (rate limit runs after auth)', async () => {
    for (let index = 0; index < 120; index += 1) {
      assert.equal((await block(undefined)).status, 401);
      assert.equal((await block('viewer-token')).status, 403);
    }
    assert.equal((await block('admin-token')).status, 201);
  });

  test('administrator quota is per administrator; the 31st request is a 429 with Retry-After', async () => {
    for (let index = 0; index < 29; index += 1) assert.equal((await block('admin-token')).status, 201);
    const limited = await block('admin-token');
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '900');
    assert.equal((await block('admin2-token')).status, 201, 'a second administrator is unaffected');
  });

  test('validation precedes authentication and consumes no quota', async () => {
    const res = await request(server, '/api/admin/blocked-dates', { method: 'POST', token: 'admin2-token', body: { event_date: 'nope' } });
    assert.equal(res.status, 400);
  });

  test('settings route is authenticated before limiting and works for authorised admins', async () => {
    assert.equal((await request(server, '/api/admin/settings', { method: 'PUT', body: { values: { a: 'b' } } })).status, 401);
    assert.equal((await request(server, '/api/admin/settings', { method: 'PUT', token: 'viewer-token', body: { values: { a: 'b' } } })).status, 403);
    assert.equal((await request(server, '/api/admin/settings', { method: 'PUT', token: 'admin2-token', body: { values: { a: 'b' } } })).status, 200);
  });

  test('bookings are accepted and limited to 5 per client; forged X-Forwarded-For cannot add buckets', async () => {
    const statuses = [];
    for (let index = 0; index < 8; index += 1) {
      const res = await request(server, '/api/bookings', { method: 'POST', body: validBooking, headers: { 'x-forwarded-for': `10.0.0.${index}` } });
      statuses.push(res.status);
    }
    assert.equal(statuses.filter((status) => status === 200).length, 5);
    assert.equal(statuses.filter((status) => status === 429).length, 3);
  });

  test('CORS: PUT is allowed for allow-listed origins; other origins receive no CORS headers', async () => {
    const allowed = await request(server, '/api/admin/settings', { method: 'OPTIONS', headers: { origin: 'https://dfabulous.co.uk', 'access-control-request-method': 'PUT' } });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://dfabulous.co.uk');
    assert.ok(allowed.headers.get('access-control-allow-methods').split(',').includes('PUT'));

    for (const origin of ['https://evil.example', 'http://localhost:3000', 'https://dfabulous.co.uk.evil.example']) {
      const denied = await request(server, '/api/admin/settings', { method: 'OPTIONS', headers: { origin } });
      assert.equal(denied.headers.get('access-control-allow-origin'), null, origin);
    }
  });

  test('the backend bundle is never served as a static file', async () => {
    for (const path of ['/server.cjs', '/server.cjs.map', '/SERVER.CJS']) {
      const res = await request(server, path);
      assert.equal(res.status, 404, path);
      assert.equal((await res.json()).error, 'Not Found');
    }
  });

  test('existing public and admin read endpoints still respond (no regression)', async () => {
    for (const path of ['/api/health', '/api/diagnostics', '/api/availability', '/api/services', '/api/gallery', '/api/videos', '/api/testimonials']) {
      let res;
      try {
        res = await request(server, path);
      } catch (error) {
        assert.fail(`${path} request failed (${error.cause?.code ?? error.message}). Server output tail:\n${server.output().slice(-1200)}`);
      }
      assert.ok(res.status < 500, `${path} -> ${res.status}`);
    }
    const availability = await (await request(server, '/api/availability')).json();
    assert.equal(availability.success, true);
    const services = await (await request(server, '/api/services')).json();
    assert.equal(services.success, true);
    assert.ok(Array.isArray(services.data));
    const session = await request(server, '/api/admin/session', { token: 'admin-token' });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).data.role, 'admin');
    assert.equal((await request(server, '/api/admin/session')).status, 401);
    assert.equal((await request(server, '/api/admin/users', { token: 'viewer-token' })).status, 403);
  });

  test('server logs never contain the configured service key', async () => {
    assert.ok(!server.output().includes('test-service-role-key-not-a-secret'));
  });
});

describe('Express backend (TRUST_PROXY_HOPS=1)', () => {
  let server;
  before(async () => { server = await startServer({ TRUST_PROXY_HOPS: '1' }); });
  after(async () => { await server.stop(); });

  test('uses the proxy-appended client address, so distinct visitors get distinct quotas', async () => {
    const book = (ip) => request(server, '/api/bookings', { method: 'POST', body: validBooking, headers: { 'x-forwarded-for': ip } });
    for (let index = 0; index < 5; index += 1) assert.equal((await book('198.51.100.1')).status, 200);
    assert.equal((await book('198.51.100.1')).status, 429);
    assert.equal((await book('198.51.100.2')).status, 200);
    // A client-seeded leading entry does not change identity: the last (proxy-appended) entry wins.
    assert.equal((await book('203.0.113.77, 198.51.100.1')).status, 429);
  });
});

describe('Express backend: user-management hierarchy and rate limiting', () => {
  let server;
  before(async () => { server = await startServer(); });
  after(async () => { await server.stop(); });

  const newUser = (overrides = {}) => ({ email: 'new.person@example.test', full_name: 'New Person', role: 'staff', permissions: ['bookings.view'], is_active: true, ...overrides });
  const create = (token, body) => request(server, '/api/admin/users', { method: 'POST', token, body });
  const patch = (token, id, body) => request(server, `/api/admin/users/${id}`, { method: 'PATCH', token, body });
  const remove = (token, id) => request(server, `/api/admin/users/${id}`, { method: 'DELETE', token });
  const roleOf = async (id) => (await (await request(server, '/api/admin/users', { token: 'owner-token' })).json()).data.find((user) => user.id === id)?.role;

  test('owner creates an administrator; administrators cannot create administrators or owners', async () => {
    const ok = await create('owner-token', newUser({ role: 'admin', permissions: ['users.manage', 'payments.manage'], email: 'a1@example.test' }));
    assert.equal(ok.status, 201);
    assert.equal((await ok.json()).data.role, 'admin');
    for (const role of ['admin', 'owner']) assert.equal((await create('umadmin2-token', newUser({ role }))).status, 403, role);
    assert.equal((await create('umadmin2-token', newUser({ role: 'staff', email: 's1@example.test' }))).status, 201, 'staff creation still works');
  });

  test('owner can create another owner; administrators cannot modify, demote, deactivate or delete that owner', async () => {
    const created = await create('owner-token', newUser({ role: 'owner', permissions: [], email: 'second.owner@example.test', full_name: 'Second Owner' }));
    assert.equal(created.status, 201);
    const owner = (await created.json()).data;
    assert.equal(owner.role, 'owner');
    assert.equal(await roleOf(owner.id), 'owner', 'the new account is stored as an owner');

    assert.equal((await patch('umadmin2-token', owner.id, { is_active: false })).status, 403);
    assert.equal((await patch('umadmin2-token', owner.id, { role: 'viewer' })).status, 403);
    assert.equal((await patch('umadmin2-token', owner.id, { permissions: [] })).status, 403);
    assert.equal((await remove('umadmin2-token', owner.id)).status, 403);
    assert.equal(await roleOf(owner.id), 'owner', 'the owner account is untouched');

    // Administrators still cannot mint owners themselves, directly or by promotion.
    assert.equal((await create('umadmin2-token', newUser({ role: 'owner', email: 'x@example.test' }))).status, 403);
    assert.equal((await patch('umadmin2-token', 'staff-1', { role: 'owner' })).status, 403);
  });

  test('administrators cannot create or promote administrators (explicit regression check)', async () => {
    assert.equal((await create('umadmin2-token', newUser({ role: 'admin', email: 'adm@example.test' }))).status, 403);
    assert.equal((await patch('umadmin2-token', 'staff-pay-1', { role: 'admin' })).status, 403);
    assert.equal(await roleOf('staff-pay-1'), 'staff');
  });

  test('administrators cannot grant privileged permissions or permissions they do not hold', async () => {
    for (const permission of ['users.manage', 'users.view', 'settings.manage', 'payments.manage', 'gallery.manage']) {
      assert.equal((await create('umadmin2-token', newUser({ permissions: [permission] }))).status, 403, permission);
    }
    assert.equal((await patch('umadmin2-token', 'staff-1', { permissions: ['bookings.view', 'payments.manage'] })).status, 403);
    assert.equal((await patch('umadmin2-token', 'staff-pay-1', { permissions: [] })).status, 403, 'cannot revoke privileged permissions');
  });

  test('administrators cannot promote accounts or modify/delete owners and administrators', async () => {
    for (const role of ['admin', 'owner']) assert.equal((await patch('umadmin2-token', 'staff-1', { role })).status, 403, role);
    assert.equal(await roleOf('staff-1'), 'staff');
    for (const id of ['owner-1', 'admin-target-1']) {
      assert.equal((await patch('umadmin2-token', id, { is_active: false })).status, 403, `patch ${id}`);
      assert.equal((await remove('umadmin2-token', id)).status, 403, `delete ${id}`);
    }
  });

  test('nobody can change their own account; staff/viewer managers are refused outright', async () => {
    assert.equal((await patch('umadmin2-token', 'um-admin-2', { role: 'owner' })).status, 403);
    assert.equal((await patch('owner-token', 'owner-1', { role: 'viewer' })).status, 403);
    assert.equal((await patch('staffmgr-token', 'staff-mgr-1', { role: 'admin' })).status, 403);
    assert.equal((await patch('viewer-token', 'viewer-1', { role: 'owner' })).status, 403);
    assert.equal((await create('staffmgr-token', newUser())).status, 403);
    assert.equal((await remove('staffmgr-token', 'staff-1')).status, 403);
  });

  test('unauthenticated requests are 401; manipulated bodies are 400', async () => {
    assert.equal((await create(undefined, newUser())).status, 401);
    assert.equal((await patch('forged-token', 'staff-1', { is_active: false })).status, 401);
    assert.equal((await remove(undefined, 'staff-1')).status, 401);
    for (const body of [newUser({ role: ['admin'] }), newUser({ role: 'ADMIN' }), newUser({ permissions: 'users.manage' }), newUser({ permissions: ['bogus'] }), newUser({ is_active: 'false' })]) {
      assert.equal((await create('owner-token', body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await patch('owner-token', 'staff-pay-1', { permissions: 'none' })).status, 400, 'cannot wipe permissions with a malformed value');
  });

  test('legitimate user management keeps working for owners and permissioned administrators', async () => {
    assert.equal((await patch('umadmin2-token', 'staff-1', { role: 'viewer', permissions: ['bookings.view', 'messages.view'], is_active: false })).status, 200);
    assert.equal(await roleOf('staff-1'), 'viewer');
    assert.equal((await patch('owner-token', 'staff-1', { role: 'admin' })).status, 200, 'owner may promote');
    assert.equal((await patch('owner-token', 'staff-pay-1', { permissions: [] })).status, 200, 'owner may revoke privileged permissions');
    assert.equal((await remove('owner-token', 'staff-1')).status, 200);
    assert.equal((await request(server, '/api/admin/users', { token: 'umadmin2-token' })).status, 200);
  });

  test('rate limiting: after auth only, per administrator, 429 with Retry-After', async () => {
    for (let index = 0; index < 100; index += 1) {
      assert.equal((await patch(undefined, 'admin-target-1', { is_active: true })).status, 401);
      assert.equal((await patch('staffmgr-token', 'admin-target-1', { is_active: true })).status, 403);
    }
    // Fill umadmin-token's own quota with authorised requests; the 401/403 floods above must not have used any.
    let limited = null;
    let succeeded = 0;
    for (let index = 0; index < 40 && !limited; index += 1) {
      const res = await patch('umadmin-token', 'staff-pay-1', { is_active: true });
      if (res.status === 429) limited = res;
      else {
        assert.equal(res.status, 200, `request ${index + 1}`);
        succeeded += 1;
      }
    }
    assert.ok(limited, 'quota must eventually be exhausted');
    assert.equal(succeeded, 30, 'exactly 30 authorised requests per window; floods did not spend any');
    assert.equal(limited.headers.get('retry-after'), '900');
    assert.equal((await patch('umadmin2-token', 'staff-pay-1', { is_active: true })).status, 200, 'a separate administrator has an isolated quota');
    assert.equal((await create('owner-token', newUser({ email: 'o1@example.test' }))).status, 201);
  });
});
