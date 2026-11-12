import { backend, call, inDevelopment, inProduction } from './setup.ts';
import { assert, assertEquals, assertFalse } from '@std/assert';
import {
  checkCreateUser,
  checkDeleteUser,
  checkUpdateUser,
  checkUserManager,
  parseBoolean,
  parsePermissionList,
  parseRole,
  type PolicyActor,
} from '../lib/userPolicy.ts';

const newUser = (overrides: Record<string, unknown> = {}) => ({
  email: 'new.person@example.test',
  full_name: 'New Person',
  role: 'staff',
  permissions: ['bookings.view'],
  is_active: true,
  ...overrides,
});

const create = (token: string | undefined, body: unknown, ip?: string) =>
  call('/api/admin/users', { method: 'POST', token, body, ip });
const patch = (token: string | undefined, id: string, body: unknown, ip?: string) =>
  call(`/api/admin/users/${id}`, { method: 'PATCH', token, body, ip });
const remove = (token: string | undefined, id: string, ip?: string) =>
  call(`/api/admin/users/${id}`, { method: 'DELETE', token, ip });

const userWrites = () => backend.writes.filter((write) => /^(auth\.|profiles\.|user_permissions\.)/.test(write));

// ---------------------------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------------------------
Deno.test('users: owner can create an administrator with privileged permissions', async () => {
  backend.reset();
  await inProduction(async () => {
    const res = await create('owner-token', newUser({ role: 'admin', permissions: ['users.manage', 'settings.manage', 'payments.manage'] }));
    assertEquals(res.status, 201);
    const body = await res.json();
    assertEquals(body.data.role, 'admin');
    assertEquals(body.data.permissions, ['users.manage', 'settings.manage', 'payments.manage']);
    assertEquals(backend.authCreates[0].role, 'admin');
  });
});

Deno.test('users: owner can create another owner (existing behaviour preserved)', async () => {
  backend.reset();
  await inProduction(async () => {
    assertEquals((await create('owner-token', newUser({ role: 'owner', permissions: [] }))).status, 201);
  });
});

Deno.test('users: administrator cannot create an administrator or an owner', async () => {
  backend.reset();
  await inProduction(async () => {
    for (const role of ['admin', 'owner']) {
      const res = await create('umadmin-token', newUser({ role }));
      assertEquals(res.status, 403, role);
    }
    assertEquals(userWrites(), [], 'nothing may be created');
  });
});

Deno.test('users: administrator can still create staff and viewer accounts with permissions they hold', async () => {
  backend.reset();
  await inProduction(async () => {
    const staff = await create('umadmin-token', newUser({ role: 'staff', permissions: ['bookings.view', 'bookings.manage'] }));
    assertEquals(staff.status, 201);
    const viewer = await create('umadmin-token', newUser({ role: 'viewer', permissions: [], email: 'v@example.test' }));
    assertEquals(viewer.status, 201);
    assertEquals(backend.authCreates.length, 2);
  });
});

Deno.test('users: administrator cannot grant privileged permissions or permissions they do not hold', async () => {
  backend.reset();
  await inProduction(async () => {
    for (const permission of ['users.manage', 'users.view', 'settings.manage', 'payments.manage']) {
      const res = await create('umadmin-token', newUser({ permissions: [permission] }));
      assertEquals(res.status, 403, permission);
    }
    assertEquals((await create('umadmin-token', newUser({ permissions: ['gallery.manage'] }))).status, 403, 'not held');
    assertEquals(userWrites(), []);
  });
});

Deno.test('users: staff/viewer holding users.manage are refused and consume no quota', async () => {
  backend.reset();
  await inProduction(async () => {
    assertEquals((await create('staffmgr-token', newUser())).status, 403);
    assertEquals((await patch('staffmgr-token', 'staff-1', { role: 'viewer' })).status, 403);
    assertEquals((await remove('staffmgr-token', 'staff-1')).status, 403);
    assertEquals((await create('viewer-token', newUser())).status, 403);
    assertEquals(userWrites(), []);
    assertEquals(backend.rpcCalls.length, 0);
  });
});

// ---------------------------------------------------------------------------------------------
// Update / promotion
// ---------------------------------------------------------------------------------------------
Deno.test('users: administrator cannot promote another account to administrator or owner', async () => {
  backend.reset();
  await inProduction(async () => {
    for (const role of ['admin', 'owner']) {
      const res = await patch('umadmin-token', 'staff-1', { role });
      assertEquals(res.status, 403, role);
    }
    assertEquals(backend.userById('staff-1')!.role, 'staff');
    assertEquals(backend.writes.filter((write) => write === 'profiles.update').length, 0);
  });
});

Deno.test('users: administrator cannot promote through permissions, even combined with a legitimate change', async () => {
  backend.reset();
  await inProduction(async () => {
    const res = await patch('umadmin-token', 'staff-1', { role: 'viewer', permissions: ['bookings.view', 'users.manage'], is_active: false });
    assertEquals(res.status, 403);
    const staff = backend.userById('staff-1')!;
    assertEquals(staff.role, 'staff');
    assertEquals(staff.permissions, ['bookings.view']);
    assertEquals(staff.isActive, undefined);
  });
});

Deno.test('users: administrator cannot grant or revoke privileged permissions on an existing account', async () => {
  backend.reset();
  await inProduction(async () => {
    const grant = await patch('umadmin-token', 'staff-1', { permissions: ['bookings.view', 'payments.manage'] });
    assertEquals(grant.status, 403);
    const revoke = await patch('umadmin-token', 'staff-pay-1', { permissions: ['bookings.view'] });
    assertEquals(revoke.status, 403);
    const wipe = await patch('umadmin-token', 'staff-pay-1', { permissions: [] });
    assertEquals(wipe.status, 403);
    assertEquals(backend.userById('staff-pay-1')!.permissions, ['bookings.view', 'payments.manage']);
  });
});

Deno.test('users: administrator can still edit non-privileged permissions, role (staff/viewer) and status of staff', async () => {
  backend.reset();
  await inProduction(async () => {
    const keepPrivileged = await patch('umadmin-token', 'staff-pay-1', { permissions: ['bookings.view', 'payments.manage', 'messages.view'] });
    assertEquals(keepPrivileged.status, 200, 'privileged set unchanged is allowed');
    assertEquals(backend.userById('staff-pay-1')!.permissions!.includes('payments.manage'), true);

    const res = await patch('umadmin-token', 'staff-1', { role: 'viewer', permissions: ['bookings.view', 'messages.view'], is_active: false });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.data.role, 'viewer');
    assertEquals(body.data.is_active, false);
    assertEquals(body.data.permissions.sort(), ['bookings.view', 'messages.view']);
  });
});

Deno.test('users: administrator cannot modify or delete owner or administrator accounts', async () => {
  backend.reset();
  await inProduction(async () => {
    for (const id of ['owner-1', 'admin-target-1', 'owner-mixed-1']) {
      assertEquals((await patch('umadmin-token', id, { is_active: false })).status, 403, `patch ${id}`);
      assertEquals((await patch('umadmin-token', id, { role: 'viewer' })).status, 403, `demote ${id}`);
      assertEquals((await remove('umadmin-token', id)).status, 403, `delete ${id}`);
    }
    assert(backend.userById('owner-1'));
    assertEquals(backend.userById('admin-target-1')!.role, 'admin');
    assertEquals(backend.writes.filter((write) => write === 'profiles.update' || write === 'profiles.delete').length, 0);
  });
});

Deno.test('users: administrator can still delete staff accounts', async () => {
  backend.reset();
  await inProduction(async () => {
    const res = await remove('umadmin-token', 'staff-1');
    assertEquals(res.status, 200);
    assertEquals(backend.userById('staff-1'), null);
  });
});

Deno.test('users: deleting a user records an audit entry that the audit_logs foreign keys accept (target id kept in metadata)', async () => {
  backend.reset();
  await inProduction(async () => {
    const res = await remove('umadmin-token', 'staff-1');
    assertEquals(res.status, 200);
    const entries = backend.auditEntries.filter((entry) => entry.action === 'user.deleted');
    assertEquals(entries.length, 1);
    assertEquals(entries[0].accepted, true, 'the entry must not point at the deleted profile');
    assertEquals(entries[0].target_user_id ?? null, null);
    assertEquals((entries[0].metadata as { deleted_user_id?: string }).deleted_user_id, 'staff-1');
    assertEquals(entries[0].actor_user_id, 'um-admin-1');
  });
});

Deno.test('users: nobody can modify or delete their own account (no self-promotion)', async () => {
  backend.reset();
  await inProduction(async () => {
    assertEquals((await patch('umadmin-token', 'um-admin-1', { role: 'owner' })).status, 403);
    assertEquals((await patch('umadmin-token', 'um-admin-1', { permissions: ['users.manage', 'payments.manage'] })).status, 403);
    assertEquals((await patch('owner-token', 'owner-1', { role: 'viewer' })).status, 403);
    assertEquals((await remove('owner-token', 'owner-1')).status, 403);
    assertEquals((await remove('umadmin-token', 'um-admin-1')).status, 403);
    // Staff / viewer cannot promote themselves: refused at the user-manager gate.
    assertEquals((await patch('staffmgr-token', 'staff-mgr-1', { role: 'admin' })).status, 403);
    assertEquals((await patch('viewer-token', 'viewer-1', { role: 'owner' })).status, 403);
    assertEquals(backend.userById('um-admin-1')!.role, 'admin');
    assertEquals(backend.userById('staff-mgr-1')!.role, 'staff');
    assertEquals(backend.userById('viewer-1')!.role, 'viewer');
  });
});

Deno.test('users: owner can promote/demote administrators and manage their privileged permissions and accounts', async () => {
  backend.reset();
  await inProduction(async () => {
    assertEquals((await patch('owner-token', 'staff-1', { role: 'admin' })).status, 200);
    assertEquals(backend.userById('staff-1')!.role, 'admin');
    assertEquals((await patch('owner-token', 'staff-1', { permissions: ['users.manage', 'payments.manage'] })).status, 200);
    assertEquals((await patch('owner-token', 'staff-pay-1', { permissions: [] })).status, 200, 'owner may revoke privileged permissions');
    assertEquals((await patch('owner-token', 'admin-target-1', { role: 'staff' })).status, 200, 'owner may demote an administrator');
    assertEquals((await remove('owner-token', 'staff-1')).status, 200, 'owner may delete an administrator');
  });
});

Deno.test('users: unknown targets return 404 for authorised managers', async () => {
  backend.reset();
  await inProduction(async () => {
    assertEquals((await patch('owner-token', 'does-not-exist', { is_active: false })).status, 404);
    assertEquals((await remove('umadmin-token', 'does-not-exist')).status, 404);
  });
});

// ---------------------------------------------------------------------------------------------
// Authentication / validation order
// ---------------------------------------------------------------------------------------------
Deno.test('users: unauthenticated and invalid-token requests are 401 and consume no quota', async () => {
  backend.reset();
  await inProduction(async () => {
    for (const token of [undefined, 'forged-token']) {
      assertEquals((await create(token, newUser())).status, 401);
      assertEquals((await patch(token, 'staff-1', { is_active: false })).status, 401);
      assertEquals((await remove(token, 'staff-1')).status, 401);
    }
    assertEquals(backend.rpcCalls.length, 0);
    assertEquals(userWrites(), []);
  });
});

Deno.test('users: manipulated request bodies are rejected with 400 before authentication or rate limiting', async () => {
  backend.reset();
  await inProduction(async () => {
    const badCreates = [
      newUser({ role: ['admin'] }), newUser({ role: { toString: 'admin' } }), newUser({ role: 'ADMIN' }), newUser({ role: ' admin' }),
      newUser({ role: 'superuser' }), newUser({ permissions: 'users.manage' }), newUser({ permissions: ['not.a.permission'] }),
      newUser({ permissions: [{ key: 'users.manage' }] }), newUser({ is_active: 'false' }), newUser({ email: 'bad' }), newUser({ full_name: '' }),
    ];
    for (const body of badCreates) {
      assertEquals((await create('owner-token', body)).status, 400, JSON.stringify(body));
    }
    for (const body of [{ role: 'god' }, { role: 5 }, { permissions: 'everything' }, { permissions: ['users.admin'] }, { is_active: 'no' }, { is_active: 0 }]) {
      assertEquals((await patch('owner-token', 'staff-1', body)).status, 400, JSON.stringify(body));
    }
    assertEquals((await call('/api/admin/users', { method: 'POST', token: 'owner-token', headers: { 'content-type': 'application/json' }, body: undefined })).status, 400);
    assertEquals(backend.rpcCalls.length, 0);
    assertEquals(userWrites(), []);
  });
});

Deno.test('users: a malformed permissions value can never wipe an existing permission set', async () => {
  backend.reset();
  await inProduction(async () => {
    assertEquals((await patch('owner-token', 'staff-pay-1', { permissions: 'none' })).status, 400);
    assertEquals(backend.userById('staff-pay-1')!.permissions, ['bookings.view', 'payments.manage']);
  });
});

Deno.test('users: mixed-case stored roles cannot be used to bypass owner protection', async () => {
  backend.reset();
  await inProduction(async () => {
    assertEquals((await patch('umadmin-token', 'owner-mixed-1', { is_active: false })).status, 403);
    assertEquals((await remove('umadmin-token', 'owner-mixed-1')).status, 403);
  });
});

// ---------------------------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------------------------
Deno.test('users: user-management requests are limited by hashed administrator id and trusted IP', async () => {
  backend.reset();
  await inProduction(async () => {
    assertEquals((await create('umadmin-token', newUser(), '198.51.100.30')).status, 201);
    const calls = backend.adminRpcCalls();
    assertEquals(calls.length, 2);
    assert(calls[0].key.startsWith('admin_users:user:'));
    assert(calls[1].key.startsWith('admin_users:ip:'));
    assertFalse(calls.some((rpcCall) => rpcCall.key.includes('um-admin-1') || rpcCall.key.includes('198.51.100.30')));
    assertEquals([calls[0].limit, calls[1].limit], [30, 90]);
  });
});

Deno.test('users: the 31st user-management request is 429 with Retry-After and is not executed', async () => {
  backend.reset();
  await inProduction(async () => {
    for (let index = 0; index < 30; index += 1) {
      assertEquals((await patch('umadmin-token', 'staff-1', { is_active: index % 2 === 0 })).status, 200, `request ${index + 1}`);
    }
    const writesBefore = backend.writes.length;
    const limited = await patch('umadmin-token', 'staff-1', { is_active: false });
    assertEquals(limited.status, 429);
    assertEquals(limited.headers.get('retry-after'), '900');
    assertEquals((await limited.json()).error, 'Too Many Requests');
    assertEquals(backend.writes.length, writesBefore);
    assertEquals((await create('umadmin-token', newUser())).status, 429, 'quota is shared by create/update/delete');
    assertEquals((await remove('umadmin-token', 'staff-1')).status, 429);
  });
});

Deno.test('users: separate administrators have isolated quotas, even from the same IP', async () => {
  backend.reset();
  await inProduction(async () => {
    for (let index = 0; index < 30; index += 1) await patch('umadmin-token', 'staff-1', { is_active: true }, '198.51.100.40');
    assertEquals((await patch('umadmin-token', 'staff-1', { is_active: true }, '198.51.100.40')).status, 429);
    assertEquals((await patch('umadmin2-token', 'staff-1', { is_active: true }, '198.51.100.40')).status, 200);
    assertEquals((await create('owner-token', newUser(), '198.51.100.40')).status, 201);
  });
});

Deno.test('users: unauthenticated or unauthorised flooding cannot consume an administrator quota', async () => {
  backend.reset();
  await inProduction(async () => {
    for (let index = 0; index < 100; index += 1) {
      assertEquals((await patch(undefined, 'staff-1', { is_active: false }, '198.51.100.50')).status, 401);
      assertEquals((await patch('staffmgr-token', 'staff-1', { is_active: false }, '198.51.100.50')).status, 403);
      assertEquals((await create('umadmin-token', newUser({ role: 'admin' }), '198.51.100.50')).status, 403, 'policy denials are not rate limited');
    }
    assertEquals(backend.rpcCalls.length, 0);
    assertEquals((await patch('umadmin-token', 'staff-1', { is_active: true }, '198.51.100.50')).status, 200);
  });
});

Deno.test('users: fail-closed when the rate limiter is unavailable (no user is created or changed)', async () => {
  backend.reset();
  backend.rpcMode = 'rpc-error';
  await inProduction(async () => {
    assertEquals((await create('owner-token', newUser())).status, 503);
    assertEquals((await patch('owner-token', 'staff-1', { is_active: false })).status, 503);
    assertEquals((await remove('owner-token', 'staff-1')).status, 503);
    assertEquals(userWrites(), []);
    assertEquals((await create(undefined, newUser())).status, 401);
  });
});

Deno.test('users: read-only listing keeps working for permissioned users (no regression)', async () => {
  backend.reset();
  await inDevelopment(async () => {
    const res = await call('/api/admin/users', { token: 'umadmin-token' });
    assertEquals(res.status, 200);
    assert(Array.isArray((await res.json()).data));
    assertEquals((await call('/api/admin/users', { token: 'admin-token' })).status, 403, 'no users.view permission');
  });
});

// ---------------------------------------------------------------------------------------------
// Policy unit tests
// ---------------------------------------------------------------------------------------------
const actor = (role: string, permissions: string[] = [], userId = 'actor-1'): PolicyActor => ({
  userId, role, isOwner: role === 'owner', isAdmin: role === 'admin' || role === 'owner', permissions: new Set(permissions),
});

Deno.test('policy: hierarchy table', () => {
  const owner = actor('owner');
  const admin = actor('admin', ['users.manage', 'bookings.view']);
  const adminNoPerm = actor('admin', ['bookings.view']);
  const staff = actor('staff', ['users.manage']);

  assertEquals(checkUserManager(owner), null);
  assertEquals(checkUserManager(admin), null);
  assertEquals(checkUserManager(adminNoPerm)?.status, 403);
  assertEquals(checkUserManager(staff)?.status, 403);
  assertEquals(checkUserManager(actor('viewer', ['users.manage']))?.status, 403);

  assertEquals(checkCreateUser(owner, 'admin', ['users.manage']), null);
  assertEquals(checkCreateUser(admin, 'admin', [])?.status, 403);
  assertEquals(checkCreateUser(admin, 'staff', ['bookings.view']), null);
  assertEquals(checkCreateUser(admin, 'staff', ['users.view'])?.status, 403);

  const target = { id: 't1', role: 'staff' };
  assertEquals(checkUpdateUser(admin, target, { role: 'admin', currentPermissions: [] })?.status, 403);
  assertEquals(checkUpdateUser(admin, target, { role: 'viewer', currentPermissions: [] }), null);
  assertEquals(checkUpdateUser(admin, { id: 't2', role: 'ADMIN' }, { currentPermissions: [] })?.status, 403);
  assertEquals(checkUpdateUser(admin, { id: 't3', role: 'Owner' }, { currentPermissions: [] })?.status, 403);
  assertEquals(checkUpdateUser(admin, { id: admin.userId, role: 'staff' }, { currentPermissions: [] })?.status, 403);
  assertEquals(checkUpdateUser(owner, { id: owner.userId, role: 'owner' }, { currentPermissions: [] })?.status, 403);
  assertEquals(checkUpdateUser(owner, { id: 't4', role: 'admin' }, { role: 'staff', currentPermissions: [] }), null);

  assertEquals(checkDeleteUser(admin, { id: 'x', role: 'admin' })?.status, 403);
  assertEquals(checkDeleteUser(admin, { id: 'x', role: 'staff' }), null);
  assertEquals(checkDeleteUser(owner, { id: 'x', role: 'admin' }), null);
});

Deno.test('policy: strict parsers', () => {
  assertEquals(parseRole('admin').ok, true);
  for (const bad of ['Admin', ' admin', 'root', 1, null, undefined, ['admin'], {}]) assertEquals(parseRole(bad).ok, false);
  assertEquals(parsePermissionList(['users.manage', 'users.manage']), { ok: true, value: ['users.manage'] });
  for (const bad of ['users.manage', [1], ['nope'], null, {}, new Array(50).fill('users.manage')]) assertEquals(parsePermissionList(bad).ok, false);
  assertEquals(parseBoolean(false), { ok: true, value: false });
  for (const bad of ['false', 0, 1, null, undefined]) assertEquals(parseBoolean(bad).ok, false);
});
