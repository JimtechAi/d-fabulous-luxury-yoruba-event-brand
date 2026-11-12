// Server-side Supabase Auth validation and role/permission authorization.
// Direct port of getAuthenticatedAdminUser / requireAdminAccess from server.ts.
// CORS is never used as an authentication or authorization mechanism: every
// admin route revalidates the Bearer access token and permissions here.
import { userClient } from './supabase.ts';
import {
  ALL_PERMISSION_KEYS,
  getAuthorizationError,
  isRoleOption,
  sanitizeUserRecord,
} from './validation.ts';
import { isServerDatabaseConfigured } from './env.ts';

export interface AdminUser {
  userId: string;
  role: string;
  isAdmin: boolean;
  isOwner: boolean;
  isActive: boolean;
  permissions: Set<string>;
  profile: Record<string, unknown> | null;
}

export async function getAuthenticatedAdminUser(accessToken: string): Promise<AdminUser | null> {
  const requestSupabase = userClient(accessToken);

  const { data: userData, error: userError } = await requestSupabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    console.info('[AUTH DEBUG]', { authenticated: false, reason: 'supabase_user_validation_failed' });
    return null;
  }

  const { data: profileData, error: profileError } = await requestSupabase
    .from('profiles')
    .select('*')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || !profileData) {
    const databaseReason = profileError
      ? profileError.code === 'PGRST116' ? 'profile_query_multiple_or_missing_row'
        : profileError.code === 'PGRST204' ? 'profile_column_missing'
          : profileError.code === '42P01' ? 'profile_table_missing'
            : profileError.code === '42501' ? 'profile_permission_denied'
              : 'profile_query_failed'
      : 'profile_not_found';
    console.info('[AUTH DEBUG]', { authenticated: true, user_id: userData.user.id, profile_found: false, reason: databaseReason, database_error_code: profileError?.code || null });
    return null;
  }

  const profile = sanitizeUserRecord(profileData) || {
    id: userData.user.id,
    email: userData.user.email ?? null,
    full_name: (userData.user.user_metadata as Record<string, unknown> | null)?.full_name ?? null,
    role: 'viewer',
    is_active: true,
    created_at: null,
    updated_at: null,
    last_sign_in_at: null,
  };

  const role = String(profile.role || 'viewer').toLowerCase();
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin' || isOwner;
  const isActive = profile.is_active === true;

  const permissions = new Set<string>();
  if (isOwner) {
    for (const permission of ALL_PERMISSION_KEYS) permissions.add(permission);
  } else if (isServerDatabaseConfigured) {
    const { data: permissionRows } = await requestSupabase
      .from('user_permissions')
      .select('permission_key')
      .eq('user_id', userData.user.id);

    const rows = Array.isArray(permissionRows) ? permissionRows : [];
    for (const row of rows) {
      if (typeof row?.permission_key === 'string') permissions.add(row.permission_key);
    }
  }

  console.info('[AUTH DEBUG]', { authenticated: true, user_id: userData.user.id, profile_found: true, role, is_active: isActive, permissions_count: permissions.size, authorized: isActive && isRoleOption(role) });

  return {
    userId: userData.user.id,
    role,
    isAdmin,
    isOwner,
    isActive,
    permissions,
    profile,
  };
}

export function readBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader?.startsWith('Bearer ')) return '';
  const token = authorizationHeader.slice(7).trim();
  // Real Supabase access tokens are far smaller; refuse oversized values before any network call.
  return token.length <= 4096 ? token : '';
}

export async function requireAdminAccess(
  authorizationHeader: string | undefined,
  requiredPermissions: string[] = []
): Promise<{ adminUser: AdminUser | null; response: { status: number; json: Record<string, unknown> } | null }> {
  const accessToken = readBearerToken(authorizationHeader);

  if (!accessToken) {
    return {
      adminUser: null,
      response: { status: 401, json: getAuthorizationError('Authentication Error', 'Your admin session is invalid or expired.') },
    };
  }

  const adminUser = await getAuthenticatedAdminUser(accessToken);
  if (!adminUser) {
    return {
      adminUser: null,
      response: { status: 401, json: getAuthorizationError('Authentication Error', 'Your admin session is invalid or expired.') },
    };
  }

  if (!adminUser.isActive) {
    return {
      adminUser: null,
      response: { status: 403, json: getAuthorizationError('Authorization Error', 'This administrator account is inactive.') },
    };
  }

  if (!adminUser.isAdmin && !adminUser.isOwner && requiredPermissions.length === 0) {
    return {
      adminUser: null,
      response: { status: 403, json: getAuthorizationError('Authorization Error', 'You are not authorized to access this administrative area.') },
    };
  }

  if (requiredPermissions.length > 0 && !adminUser.isOwner) {
    const missingPermission = requiredPermissions.find((permission) => !adminUser.permissions.has(permission));
    if (missingPermission) {
      return {
        adminUser,
        response: { status: 403, json: getAuthorizationError('Authorization Error', 'You do not have permission to perform this action.') },
      };
    }
  }

  return { adminUser, response: null };
}
