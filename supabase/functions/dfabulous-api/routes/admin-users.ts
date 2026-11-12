// Admin user management: list, create, update, delete.
// Ported from server.ts. Authorisation follows the hierarchy in lib/userPolicy.ts, shared with the
// Express backend:
//   * Only the owner can create/promote/demote administrators, grant or revoke privileged
//     permissions, or modify/delete administrator and owner accounts.
//   * Administrators need the explicit users.manage permission and can only manage staff/viewer
//     accounts with non-privileged permissions they hold themselves.
//   * Staff/viewer accounts can never manage users. Nobody can change or delete their own account.
// Mutating routes run: validate request -> authenticate -> verify role/permissions ->
// administrator rate limit -> execute.
// Deleting a user removes user_permissions and the profile row only; the
// auth.users record is intentionally left, matching the Express behavior.
import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { serviceClient } from '../lib/supabase.ts';
import { supabaseServiceRoleKey, supabaseUrl } from '../lib/env.ts';
import { requireAdminAccess } from '../lib/auth.ts';
import { guardAdminRequest } from '../lib/adminGuard.ts';
import { appendAuditLog } from '../lib/audit.ts';
import { readJsonBody } from '../lib/http.ts';
import { isValidEmail, readText, sanitizeUserRecord } from '../lib/validation.ts';
import {
  checkCreateUser,
  checkDeleteUser,
  checkUpdateUser,
  checkUserManager,
  parseBoolean,
  parsePermissionList,
  parseRole,
} from '../lib/userPolicy.ts';

export const adminUserRoutes = new Hono();

adminUserRoutes.get('/api/admin/users', async (c) => {
  const accessCheck = await requireAdminAccess(c.req.header('authorization'), ['users.view']);
  if (accessCheck.response) {
    return c.json(accessCheck.response.json, accessCheck.response.status as 401);
  }

  try {
    const { data, error } = await serviceClient()
      .from('profiles')
      .select('id, email, full_name, role, is_active, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Edge API] Admin user list error:', error);
      return c.json({ success: false, error: 'Server Error', details: 'Unable to load users.' }, 500);
    }

    const users = (data || []).map((record: Record<string, unknown>) => sanitizeUserRecord(record));
    return c.json({ success: true, data: users });
  } catch (error) {
    console.error('[Edge API] Unexpected admin user list error:', error);
    return c.json({ success: false, error: 'Server Error', details: 'Unable to load users.' }, 500);
  }
});

adminUserRoutes.post('/api/admin/users', async (c) => {
  // 1. Validate the request.
  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const roleResult = parseRole(body.role);

  if (!isValidEmail(email) || !roleResult.ok || !fullName) {
    return c.json({ success: false, error: 'Validation Error', details: 'Email, name, and role are required.' }, 400);
  }
  const permissionsResult = body.permissions === undefined ? { ok: true as const, value: [] as string[] } : parsePermissionList(body.permissions);
  if (!permissionsResult.ok) return c.json({ success: false, error: permissionsResult.denial.error, details: permissionsResult.denial.details }, 400);
  const activeResult = body.is_active === undefined ? { ok: true as const, value: true } : parseBoolean(body.is_active);
  if (!activeResult.ok) return c.json({ success: false, error: activeResult.denial.error, details: activeResult.denial.details }, 400);

  const role = roleResult.value;
  const permissions = permissionsResult.value;
  const isActive = activeResult.value;

  // 2-4. Authenticate, verify user-management authority (hierarchy), then rate limit.
  const guard = await guardAdminRequest(c, ['users.manage'], {
    rateLimit: 'admin_users',
    authorize: (user) => checkUserManager(user) ?? checkCreateUser(user, role, permissions),
  });
  if (!guard.ok) return guard.response;
  const requester = guard.adminUser;
  const targetPermissions = permissions;

  // 5. Execute.
  try {
    const serviceAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: createdUser, error: createUserError } = await serviceAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { role },
    });

    if (createUserError || !createdUser?.user) {
      console.error('[Edge API] Admin user creation failed:', createUserError);
      return c.json({ success: false, error: 'Server Error', details: 'The user could not be created.' }, 500);
    }

    const targetUserId = createdUser.user.id;
    const { data: profile } = await serviceClient()
      .from('profiles')
      .upsert([
        {
          id: targetUserId,
          email,
          full_name: fullName,
          role,
          is_active: isActive,
        },
      ], { onConflict: 'id' })
      .select('id, email, full_name, role, is_active')
      .single();

    if (!profile) {
      return c.json({ success: false, error: 'Server Error', details: 'The user profile could not be created.' }, 500);
    }

    if (targetPermissions.length > 0) {
      const permissionRows = targetPermissions.map((permissionKey) => ({
        user_id: targetUserId,
        permission_key: permissionKey,
        created_at: new Date().toISOString(),
      }));
      await serviceClient().from('user_permissions').upsert(permissionRows, { onConflict: 'user_id,permission_key' });
    }

    await appendAuditLog({
      actor_user_id: requester.userId,
      action: 'user.created',
      target_user_id: targetUserId,
      metadata: {
        role,
        permissions: targetPermissions,
        email,
        is_active: isActive,
      },
    });

    return c.json({
      success: true,
      data: {
        id: targetUserId,
        email,
        full_name: fullName,
        role,
        is_active: isActive,
        permissions: targetPermissions,
      },
    }, 201);
  } catch (error) {
    console.error('[Edge API] Unexpected admin user creation error:', error);
    return c.json({ success: false, error: 'Server Error', details: 'Unable to create the user.' }, 500);
  }
});

adminUserRoutes.patch('/api/admin/users/:id', async (c) => {
  // 1. Validate the request.
  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;

  const targetId = readText(c.req.param('id'), 120);
  const payload = parsed.body;

  if (!targetId) {
    return c.json({ success: false, error: 'Validation Error', details: 'A valid user ID is required.' }, 400);
  }

  const roleResult = payload.role === undefined ? null : parseRole(payload.role);
  if (roleResult && !roleResult.ok) return c.json({ success: false, error: roleResult.denial.error, details: roleResult.denial.details }, 400);
  const permissionsResult = payload.permissions === undefined ? null : parsePermissionList(payload.permissions);
  if (permissionsResult && !permissionsResult.ok) return c.json({ success: false, error: permissionsResult.denial.error, details: permissionsResult.denial.details }, 400);
  const activeResult = payload.is_active === undefined ? null : parseBoolean(payload.is_active);
  if (activeResult && !activeResult.ok) return c.json({ success: false, error: activeResult.denial.error, details: activeResult.denial.details }, 400);

  const requestedRole = roleResult?.ok ? roleResult.value : undefined;
  const nextPermissions = permissionsResult?.ok ? permissionsResult.value : null;

  // 2-4. Authenticate, verify user-management authority, then rate limit.
  const guard = await guardAdminRequest(c, ['users.manage'], {
    rateLimit: 'admin_users',
    authorize: (user) => checkUserManager(user),
  });
  if (!guard.ok) return guard.response;
  const requester = guard.adminUser;

  // 5. Execute (target-dependent hierarchy checks need the stored profile).
  try {
    const db = serviceClient();
    const { data: targetProfile, error: targetProfileError } = await db
      .from('profiles')
      .select('id, email, full_name, role, is_active')
      .eq('id', targetId)
      .maybeSingle();

    if (targetProfileError || !targetProfile) {
      return c.json({ success: false, error: 'User Not Found' }, 404);
    }

    let currentPermissions: string[] = [];
    if (nextPermissions) {
      const { data: currentRows, error: currentError } = await db
        .from('user_permissions')
        .select('permission_key')
        .eq('user_id', targetId);
      if (currentError) {
        console.error('[Edge API] Current permission lookup error:', currentError);
        return c.json({ success: false, error: 'Server Error', details: 'Unable to update permissions.' }, 500);
      }
      currentPermissions = (currentRows || []).map((row: { permission_key: string }) => row.permission_key);
    }

    const denial = checkUpdateUser(requester, targetProfile, {
      role: requestedRole,
      permissions: nextPermissions ?? undefined,
      currentPermissions,
    });
    if (denial) {
      return c.json({ success: false, error: denial.error, details: denial.details }, denial.status);
    }

    const nextRole = requestedRole ?? targetProfile.role;
    const nextActive = activeResult?.ok ? activeResult.value : targetProfile.is_active;

    const updates: Record<string, unknown> = {};
    if (nextRole !== undefined && nextRole !== targetProfile.role) { updates.role = nextRole; }
    if (nextActive !== undefined && nextActive !== targetProfile.is_active) { updates.is_active = nextActive; }

    if (Object.keys(updates).length > 0) {
      const { error: profileUpdateError } = await db
        .from('profiles')
        .update(updates)
        .eq('id', targetId);

      if (profileUpdateError) {
        console.error('[Edge API] User update error:', profileUpdateError);
        return c.json({ success: false, error: 'Server Error', details: 'Unable to update the user.' }, 500);
      }
    }

    if (nextPermissions) {
      const { error: permissionDeleteError } = await db
        .from('user_permissions')
        .delete()
        .eq('user_id', targetId);

      if (permissionDeleteError) {
        console.error('[Edge API] Permission reset error:', permissionDeleteError);
        return c.json({ success: false, error: 'Server Error', details: 'Unable to update permissions.' }, 500);
      }

      if (nextPermissions.length > 0) {
        const rows = nextPermissions.map((permissionKey) => ({
          user_id: targetId,
          permission_key: permissionKey,
          created_at: new Date().toISOString(),
        }));
        const { error: permissionInsertError } = await db.from('user_permissions').upsert(rows, { onConflict: 'user_id,permission_key' });
        if (permissionInsertError) {
          console.error('[Edge API] Permission insert error:', permissionInsertError);
          return c.json({ success: false, error: 'Server Error', details: 'Unable to update permissions.' }, 500);
        }
      }
    }

    if (nextRole !== undefined && nextRole !== targetProfile.role) {
      await appendAuditLog({
        actor_user_id: requester.userId,
        action: 'user.role_changed',
        target_user_id: targetId,
        metadata: { from: targetProfile.role, to: nextRole },
      });
    }
    if (nextPermissions) {
      await appendAuditLog({
        actor_user_id: requester.userId,
        action: 'user.permissions_changed',
        target_user_id: targetId,
        metadata: { permissions: nextPermissions },
      });
    }
    if (nextActive !== undefined && nextActive !== targetProfile.is_active) {
      await appendAuditLog({
        actor_user_id: requester.userId,
        action: nextActive ? 'user.activated' : 'user.deactivated',
        target_user_id: targetId,
        metadata: { is_active: nextActive },
      });
    }

    const { data: finalProfile } = await db
      .from('profiles')
      .select('id, email, full_name, role, is_active')
      .eq('id', targetId)
      .maybeSingle();

    const { data: finalPermissions } = await db
      .from('user_permissions')
      .select('permission_key')
      .eq('user_id', targetId);

    return c.json({
      success: true,
      data: {
        ...sanitizeUserRecord(finalProfile || targetProfile),
        permissions: (finalPermissions || []).map((row: { permission_key: string }) => row.permission_key),
      },
    });
  } catch (error) {
    console.error('[Edge API] Unexpected admin user update error:', error);
    return c.json({ success: false, error: 'Server Error', details: 'Unable to update the user.' }, 500);
  }
});

adminUserRoutes.delete('/api/admin/users/:id', async (c) => {
  // 1. Validate the request.
  const targetId = readText(c.req.param('id'), 120);
  if (!targetId) {
    return c.json({ success: false, error: 'Validation Error', details: 'A valid user ID is required.' }, 400);
  }

  // 2-4. Authenticate, verify user-management authority, then rate limit.
  const guard = await guardAdminRequest(c, ['users.manage'], {
    rateLimit: 'admin_users',
    authorize: (user) => checkUserManager(user),
  });
  if (!guard.ok) return guard.response;
  const requester = guard.adminUser;

  // 5. Execute.
  try {
    const db = serviceClient();
    const { data: targetProfile, error: targetProfileError } = await db
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', targetId)
      .maybeSingle();

    if (targetProfileError || !targetProfile) {
      return c.json({ success: false, error: 'User Not Found' }, 404);
    }

    const denial = checkDeleteUser(requester, targetProfile);
    if (denial) {
      return c.json({ success: false, error: denial.error, details: denial.details }, denial.status);
    }

    const { error: permissionDeleteError } = await db
      .from('user_permissions')
      .delete()
      .eq('user_id', targetId);

    if (permissionDeleteError) {
      console.error('[Edge API] User permission cleanup error:', permissionDeleteError);
    }

    const { error: deleteProfileError } = await db
      .from('profiles')
      .delete()
      .eq('id', targetId);

    if (deleteProfileError) {
      console.error('[Edge API] User delete error:', deleteProfileError);
      return c.json({ success: false, error: 'Server Error', details: 'Unable to remove this user.' }, 500);
    }

    await appendAuditLog({
      actor_user_id: requester.userId,
      action: 'user.deleted',
      // The profile row is already gone and audit_logs.target_user_id references it, so the id is kept in the metadata instead (a foreign-key violation
      // would otherwise reject the entry and the deletion would leave no audit record).
      target_user_id: null,
      metadata: { deleted_user_id: targetId, role: targetProfile.role },
    });

    return c.json({ success: true, data: { id: targetId, deleted: true } });
  } catch (error) {
    console.error('[Edge API] Unexpected user delete error:', error);
    return c.json({ success: false, error: 'Server Error', details: 'Unable to remove this user.' }, 500);
  }
});
