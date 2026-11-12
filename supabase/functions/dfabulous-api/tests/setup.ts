// Test harness for the dfabulous-api Edge Function. It must be the FIRST import of every test file:
// it sets non-secret dummy configuration BEFORE the function's env module is evaluated and replaces
// globalThis.fetch with an in-memory fake of Supabase Auth + PostgREST. No network access, no real
// credentials and no production data are ever involved.
Deno.env.set('VITE_SUPABASE_URL', 'https://test-project.supabase.co');
Deno.env.set('VITE_SUPABASE_ANON_KEY', 'test-anon-key-not-a-secret');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key-not-a-secret');
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'DENO_DEPLOYMENT_ID', 'SB_REGION', 'SB_EXECUTION_ID', 'APP_ENV', 'NODE_ENV', 'RATE_LIMIT_DEV_FALLBACK', 'RESEND_API_KEY', 'CORS_ALLOWED_ORIGINS']) {
  Deno.env.delete(name);
}

export interface FakeUser {
  id: string;
  role: string;
  isActive?: boolean;
  permissions?: string[];
}

export type RpcMode = 'ok' | 'rpc-error' | 'throw' | 'non-boolean';

export interface RpcCall {
  key: string;
  limit: number;
  windowSeconds: number;
}

class FakeBackend {
  users = new Map<string, FakeUser>();
  rpcMode: RpcMode = 'ok';
  rpcCalls: RpcCall[] = [];
  counters = new Map<string, number>();
  writes: string[] = [];
  unhandled: string[] = [];
  auditEntries: Array<{ actor_user_id?: string | null; target_user_id?: string | null; action?: string; metadata?: unknown; accepted: boolean }> = [];
  created = new Map<string, FakeUser>();
  authCreates: Array<{ email: string; role: unknown }> = [];

  reset(): void {
    this.users.clear();
    this.created.clear();
    this.authCreates = [];
    this.rpcMode = 'ok';
    this.rpcCalls = [];
    this.counters.clear();
    this.writes = [];
    this.unhandled = [];
    this.auditEntries = [];
    this.users.set('admin-token', { id: 'admin-1', role: 'admin', permissions: ['bookings.manage', 'settings.manage'] });
    this.users.set('admin2-token', { id: 'admin-2', role: 'admin', permissions: ['bookings.manage', 'settings.manage'] });
    this.users.set('owner-token', { id: 'owner-1', role: 'owner' });
    this.users.set('viewer-token', { id: 'viewer-1', role: 'viewer', permissions: [] });
    this.users.set('inactive-token', { id: 'inactive-1', role: 'admin', isActive: false, permissions: ['bookings.manage'] });
    // User-management fixtures.
    const managerPermissions = ['users.manage', 'users.view', 'bookings.manage', 'bookings.view', 'messages.view'];
    this.users.set('umadmin-token', { id: 'um-admin-1', role: 'admin', permissions: [...managerPermissions] });
    this.users.set('umadmin2-token', { id: 'um-admin-2', role: 'admin', permissions: [...managerPermissions] });
    this.users.set('staffmgr-token', { id: 'staff-mgr-1', role: 'staff', permissions: ['users.manage', 'users.view'] });
    this.users.set('staff-token', { id: 'staff-1', role: 'staff', permissions: ['bookings.view'] });
    this.users.set('target-admin-token', { id: 'admin-target-1', role: 'admin', permissions: ['bookings.manage'] });
    this.users.set('target-payments-token', { id: 'staff-pay-1', role: 'staff', permissions: ['bookings.view', 'payments.manage'] });
    this.users.set('mixedcase-owner-token', { id: 'owner-mixed-1', role: 'Owner' });
  }

  userForToken(authorization: string | null): FakeUser | null {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    return this.users.get(token) ?? null;
  }

  userById(id: string): FakeUser | null {
    for (const user of this.users.values()) if (user.id === id) return user;
    return this.created.get(id) ?? null;
  }

  removeUser(id: string): void {
    for (const [token, user] of this.users) if (user.id === id) this.users.delete(token);
    this.created.delete(id);
  }

  adminRpcCalls(): RpcCall[] {
    return this.rpcCalls.filter((call) => call.key.startsWith('admin_'));
  }
}

export const backend = new FakeBackend();
backend.reset();

function json(body: unknown, status: number, request: Request): Response {
  const wantsObject = (request.headers.get('accept') ?? '').includes('vnd.pgrst.object');
  const payload = wantsObject && Array.isArray(body) ? body[0] ?? null : body;
  return new Response(payload === undefined ? null : JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/auth/v1/user') {
    const user = backend.userForToken(request.headers.get('authorization'));
    if (!user) return json({ code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }, 401, request);
    return json({
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: `${user.id}@example.test`,
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    }, 200, request);
  }

  if (path === '/rest/v1/profiles' && request.method === 'GET') {
    const idFilter = url.searchParams.get('id');
    if (idFilter === null) {
      const all = [...backend.users.values(), ...backend.created.values()];
      return json(all.map((user) => ({ id: user.id, email: `${user.id}@example.test`, full_name: 'Test User', role: user.role, is_active: user.isActive !== false })), 200, request);
    }
    const user = backend.userById(idFilter.replace('eq.', ''));
    if (!user) return json([], 200, request);
    return json([{
      id: user.id,
      email: `${user.id}@example.test`,
      full_name: 'Test User',
      role: user.role,
      is_active: user.isActive !== false,
    }], 200, request);
  }

  if (path === '/auth/v1/admin/users' && request.method === 'POST') {
    const body = await request.json() as { email: string; app_metadata?: { role?: unknown } };
    backend.authCreates.push({ email: body.email, role: body.app_metadata?.role });
    backend.writes.push('auth.createUser');
    const id = `created-${backend.authCreates.length}`;
    return json({ id, aud: 'authenticated', role: 'authenticated', email: body.email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }, 200, request);
  }

  if (path === '/rest/v1/profiles' && request.method === 'POST') {
    const rows = await request.json() as Array<{ id: string; role: string; is_active: boolean }>;
    for (const row of rows) backend.created.set(row.id, { id: row.id, role: row.role, isActive: row.is_active, permissions: [] });
    backend.writes.push('profiles.upsert');
    return json(rows.map((row) => ({ ...row, email: `${row.id}@example.test` })), 201, request);
  }
  if (path === '/rest/v1/profiles' && request.method === 'PATCH') {
    const id = (url.searchParams.get('id') ?? '').replace('eq.', '');
    const updates = await request.json() as { role?: string; is_active?: boolean };
    const user = backend.userById(id);
    if (user) {
      if (updates.role !== undefined) user.role = updates.role;
      if (updates.is_active !== undefined) user.isActive = updates.is_active;
    }
    backend.writes.push('profiles.update');
    return new Response(null, { status: 204 });
  }
  if (path === '/rest/v1/profiles' && request.method === 'DELETE') {
    backend.removeUser((url.searchParams.get('id') ?? '').replace('eq.', ''));
    backend.writes.push('profiles.delete');
    return new Response(null, { status: 204 });
  }
  if (path === '/rest/v1/user_permissions' && request.method === 'DELETE') {
    const user = backend.userById((url.searchParams.get('user_id') ?? '').replace('eq.', ''));
    if (user) user.permissions = [];
    backend.writes.push('user_permissions.delete');
    return new Response(null, { status: 204 });
  }
  if (path === '/rest/v1/user_permissions' && request.method === 'POST') {
    const rows = await request.json() as Array<{ user_id: string; permission_key: string }>;
    for (const row of rows) {
      const user = backend.userById(row.user_id);
      if (user) user.permissions = [...new Set([...(user.permissions ?? []), row.permission_key])];
    }
    backend.writes.push('user_permissions.upsert');
    return new Response(null, { status: 201 });
  }

  if (path === '/rest/v1/user_permissions' && request.method === 'GET') {
    const id = (url.searchParams.get('user_id') ?? '').replace('eq.', '');
    const permissions = backend.userById(id)?.permissions ?? [];
    return json(permissions.map((permission_key) => ({ permission_key })), 200, request);
  }

  if (path === '/rest/v1/rpc/consume_rate_limit') {
    const body = await request.json() as { p_bucket_key: string; p_limit: number; p_window_seconds: number };
    backend.rpcCalls.push({ key: body.p_bucket_key, limit: body.p_limit, windowSeconds: body.p_window_seconds });
    if (backend.rpcMode === 'throw') throw new TypeError('network down');
    if (backend.rpcMode === 'rpc-error') return json({ code: 'XX000', message: 'database unavailable', details: null, hint: null }, 500, request);
    if (backend.rpcMode === 'non-boolean') return json({ unexpected: true }, 200, request);
    const count = (backend.counters.get(body.p_bucket_key) ?? 0) + 1;
    backend.counters.set(body.p_bucket_key, count);
    return json(count <= body.p_limit, 200, request);
  }

  if (path === '/rest/v1/blocked_dates' && request.method === 'POST') {
    backend.writes.push('blocked_dates.insert');
    return json([{ event_date: '2027-01-01', note: null }], 201, request);
  }
  if (path === '/rest/v1/blocked_dates' && request.method === 'DELETE') {
    backend.writes.push('blocked_dates.delete');
    return new Response(null, { status: 204 });
  }
  if (path === '/rest/v1/bookings' && request.method === 'POST') {
    backend.writes.push('bookings.insert');
    return new Response(null, { status: 201 });
  }
  if (path === '/rest/v1/site_settings') {
    if (request.method === 'GET') return json([], 200, request);
    backend.writes.push('site_settings.write');
    return new Response(null, { status: 201 });
  }
  if (path === '/rest/v1/messages' && request.method === 'POST') {
    backend.writes.push('messages.insert');
    return new Response(null, { status: 201 });
  }
  if (path === '/rest/v1/audit_logs') {
    // Emulates audit_logs.target_user_id / actor_user_id REFERENCES profiles(id): an entry that points at a profile that no longer exists is rejected (23503).
    const rows = await request.clone().json().catch(() => []) as Array<{ actor_user_id?: string | null; target_user_id?: string | null; action?: string; metadata?: unknown }>;
    for (const row of Array.isArray(rows) ? rows : [rows]) {
      const dangling = (row.target_user_id && !backend.userById(row.target_user_id)) || (row.actor_user_id && !backend.userById(row.actor_user_id));
      backend.auditEntries.push({ ...row, accepted: !dangling });
      if (dangling) return json({ code: '23503', message: 'insert or update on table "audit_logs" violates foreign key constraint' }, 409, request);
    }
    return new Response(null, { status: 201 });
  }

  backend.unhandled.push(`${request.method} ${path}`);
  return json({ code: 'PGRST000', message: 'not mocked' }, 404, request);
}

globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
  return handle(new Request(input, init));
};

// Silence expected error/warn logging from the function under test to keep test output readable.
console.error = () => {};
console.warn = () => {};
console.info = () => {};

const PRODUCTION_VARS = ['DENO_DEPLOYMENT_ID', 'SB_REGION', 'SB_EXECUTION_ID', 'SUPABASE_URL', 'APP_ENV', 'NODE_ENV', 'RATE_LIMIT_DEV_FALLBACK'];

/** Runs fn with the given environment variables (undefined deletes), restoring afterwards. */
export async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(vars)) {
    previous.set(name, Deno.env.get(name));
    if (value === undefined) Deno.env.delete(name);
    else Deno.env.set(name, value);
  }
  try {
    return await fn();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}

/** Simulates the hosted Supabase platform (production). */
export function inProduction<T>(fn: () => Promise<T> | T, extra: Record<string, string | undefined> = {}): Promise<T> {
  return withEnv({ DENO_DEPLOYMENT_ID: 'test-deployment', ...extra }, fn);
}

/** Simulates a local/development runtime: no production signal of any kind. */
export function inDevelopment<T>(fn: () => Promise<T> | T, extra: Record<string, string | undefined> = {}): Promise<T> {
  const cleared = Object.fromEntries(PRODUCTION_VARS.map((name) => [name, undefined]));
  return withEnv({ ...cleared, ...extra }, fn);
}

export interface TestRequestOptions {
  method?: string;
  token?: string;
  ip?: string | null;
  headers?: Record<string, string>;
  body?: unknown;
}

export async function call(path: string, options: TestRequestOptions = {}): Promise<Response> {
  const { app } = await import('../app.ts');
  const headers = new Headers(options.headers);
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.ip !== null) headers.set('cf-connecting-ip', options.ip ?? '203.0.113.10');
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  return app.request(`/dfabulous-api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export const validBooking = {
  full_name: 'Test Customer',
  email: 'customer@example.test',
  phone: '+44 7700 900123',
  event_date: '2027-06-12',
  event_location: 'London',
  services_requested: ['bridal-styling'],
  estimated_guest_count: 100,
  celebration_details: 'Test booking',
};
