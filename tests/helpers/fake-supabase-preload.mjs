// Preloaded (node --import) into the real Express server process by tests/express-server.test.mjs.
// Replaces globalThis.fetch with an in-memory fake of Supabase Auth + PostgREST so the server can be
// exercised end to end without any network access or real credentials. The fake keeps mutable
// profile/permission state so user-management behaviour can be verified through the HTTP API.
const managerPermissions = ['users.manage', 'users.view', 'bookings.manage', 'bookings.view', 'messages.view'];
const USERS = {
  'admin-token': { id: 'admin-1', role: 'admin', permissions: ['bookings.manage', 'settings.manage'] },
  'admin2-token': { id: 'admin-2', role: 'admin', permissions: ['bookings.manage', 'settings.manage'] },
  'viewer-token': { id: 'viewer-1', role: 'viewer', permissions: [] },
  'owner-token': { id: 'owner-1', role: 'owner', permissions: [] },
  'umadmin-token': { id: 'um-admin-1', role: 'admin', permissions: [...managerPermissions] },
  'umadmin2-token': { id: 'um-admin-2', role: 'admin', permissions: [...managerPermissions] },
  'staffmgr-token': { id: 'staff-mgr-1', role: 'staff', permissions: ['users.manage', 'users.view'] },
  'staff-token': { id: 'staff-1', role: 'staff', permissions: ['bookings.view'] },
  'target-admin-token': { id: 'admin-target-1', role: 'admin', permissions: ['bookings.manage'] },
  'target-payments-token': { id: 'staff-pay-1', role: 'staff', permissions: ['bookings.view', 'payments.manage'] },
};
const created = new Map();
let createdCount = 0;

const allUsers = () => [...Object.values(USERS), ...created.values()];
const userById = (id) => allUsers().find((user) => user.id === id);

function removeUser(id) {
  for (const [token, user] of Object.entries(USERS)) if (user.id === id) delete USERS[token];
  created.delete(id);
}

const profileOf = (user) => ({ id: user.id, email: `${user.id}@example.test`, full_name: 'Test', role: user.role, is_active: user.isActive !== false });

function reply(request, body, status = 200) {
  const wantsObject = (request.headers.get('accept') || '').includes('vnd.pgrst.object');
  const payload = wantsObject && Array.isArray(body) ? body[0] ?? null : body;
  return new Response(payload === undefined ? null : JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const eq = (url, name) => (url.searchParams.get(name) || '').replace('eq.', '');

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/auth/v1/user') {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
    const user = USERS[token];
    if (!user) return reply(request, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }, 401);
    return reply(request, { id: user.id, aud: 'authenticated', role: 'authenticated', email: `${user.id}@example.test`, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
  }
  if (path === '/auth/v1/admin/users' && method === 'POST') {
    const body = await request.json();
    createdCount += 1;
    return reply(request, { id: `created-${createdCount}`, aud: 'authenticated', role: 'authenticated', email: body.email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
  }

  if (path === '/rest/v1/profiles') {
    if (method === 'GET') {
      if (!url.searchParams.has('id')) return reply(request, allUsers().map(profileOf));
      const user = userById(eq(url, 'id'));
      return reply(request, user ? [profileOf(user)] : []);
    }
    if (method === 'POST') {
      const rows = await request.json();
      for (const row of rows) created.set(row.id, { id: row.id, role: row.role, isActive: row.is_active, permissions: [] });
      return reply(request, rows.map((row) => ({ ...row, email: `${row.id}@example.test` })), 201);
    }
    if (method === 'PATCH') {
      const updates = await request.json();
      const user = userById(eq(url, 'id'));
      if (user) {
        if (updates.role !== undefined) user.role = updates.role;
        if (updates.is_active !== undefined) user.isActive = updates.is_active;
      }
      return new Response(null, { status: 204 });
    }
    if (method === 'DELETE') {
      removeUser(eq(url, 'id'));
      return new Response(null, { status: 204 });
    }
  }

  if (path === '/rest/v1/user_permissions') {
    if (method === 'GET') {
      const user = userById(eq(url, 'user_id'));
      return reply(request, (user?.permissions || []).map((permission_key) => ({ permission_key })));
    }
    if (method === 'DELETE') {
      const user = userById(eq(url, 'user_id'));
      if (user) user.permissions = [];
      return new Response(null, { status: 204 });
    }
    if (method === 'POST') {
      for (const row of await request.json()) {
        const user = userById(row.user_id);
        if (user) user.permissions = [...new Set([...(user.permissions || []), row.permission_key])];
      }
      return new Response(null, { status: 201 });
    }
  }

  if (path === '/rest/v1/blocked_dates' && method === 'POST') return reply(request, [{ event_date: '2027-01-01', note: null }], 201);
  if (method === 'GET' && ['/rest/v1/blocked_dates', '/rest/v1/bookings', '/rest/v1/services', '/rest/v1/gallery_items', '/rest/v1/testimonials'].includes(path)) return reply(request, []);
  if (path === '/rest/v1/blocked_dates') return new Response(null, { status: 204 });
  if (path === '/rest/v1/bookings' && method === 'POST') return new Response(null, { status: 201 });
  if (path === '/rest/v1/site_settings') return method === 'GET' ? reply(request, []) : new Response(null, { status: 201 });
  if (path === '/rest/v1/audit_logs') return new Response(null, { status: 201 });
  return reply(request, { code: 'PGRST000', message: 'not mocked' }, 404);
};
