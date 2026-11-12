// User-management authorisation policy, shared by the Supabase Edge Function and the Express
// backend (server.ts imports this file) so both enforce exactly the same hierarchy. Pure functions
// only: no Deno or Node APIs, no I/O.
//
// Hierarchy
//   OWNER  : may create administrators, promote/demote administrators, assign and revoke privileged
//            permissions and manage every account (but never their own role/permissions/account).
//   ADMIN  : must additionally hold the explicit `users.manage` permission. May create and manage
//            staff/viewer accounts only. May NOT create or promote administrators/owners, grant or
//            revoke privileged permissions, grant permissions they do not hold, or touch
//            administrator/owner accounts.
//   OTHERS : staff / viewer (even when holding `users.manage`) are refused every management operation.
//
// Every value that influences a decision (role, permissions, flags) is validated here against closed
// allow-lists so manipulated request bodies cannot smuggle in unexpected values.
import { ALL_PERMISSION_KEYS, ROLE_OPTIONS } from './validation.ts';

/** Permissions that only the owner may grant or revoke. */
export const PRIVILEGED_PERMISSIONS: readonly string[] = [
  'users.view',
  'users.manage',
  'settings.manage',
  'payments.manage',
];

/** Roles an administrator may assign. Administrator and owner roles are owner-only. */
export const ADMIN_ASSIGNABLE_ROLES: readonly string[] = ['staff', 'viewer'];

export interface PolicyActor {
  userId: string;
  role: string;
  isOwner: boolean;
  isAdmin: boolean;
  permissions: ReadonlySet<string>;
}

export interface PolicyDenial {
  status: 400 | 403;
  error: 'Validation Error' | 'Authorization Error';
  details: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; denial: PolicyDenial };

const forbidden = (details: string): PolicyDenial => ({ status: 403, error: 'Authorization Error', details });
const invalid = (details: string): PolicyDenial => ({ status: 400, error: 'Validation Error', details });

const normaliseRole = (role: unknown): string => String(role ?? '').trim().toLowerCase();
const isPrivileged = (permission: string): boolean => PRIVILEGED_PERMISSIONS.includes(permission);

/** Strict role parsing: must be exactly one of the known roles. */
export function parseRole(value: unknown): ParseResult<string> {
  if (typeof value === 'string' && (ROLE_OPTIONS as readonly string[]).includes(value)) {
    return { ok: true, value };
  }
  return { ok: false, denial: invalid('The role is invalid.') };
}

/**
 * Strict permission-list parsing: an array of known permission keys. Unknown keys, non-strings and
 * non-arrays are rejected rather than silently dropped (a dropped key could otherwise wipe permissions).
 */
export function parsePermissionList(value: unknown): ParseResult<string[]> {
  if (!Array.isArray(value) || value.length > ALL_PERMISSION_KEYS.length) {
    return { ok: false, denial: invalid('Permissions must be a list of valid permission keys.') };
  }
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !(ALL_PERMISSION_KEYS as readonly string[]).includes(item.trim())) {
      return { ok: false, denial: invalid('Permissions must be a list of valid permission keys.') };
    }
    unique.add(item.trim());
  }
  return { ok: true, value: Array.from(unique) };
}

/** Strict boolean parsing: "false" or 0 must not be coerced to a truthy value. */
export function parseBoolean(value: unknown): ParseResult<boolean> {
  if (typeof value === 'boolean') return { ok: true, value };
  return { ok: false, denial: invalid('The active flag must be true or false.') };
}

/** Gate for every user-management mutation. Only owners and permissioned administrators pass. */
export function checkUserManager(actor: PolicyActor): PolicyDenial | null {
  if (actor.isOwner) return null;
  if (normaliseRole(actor.role) === 'admin' && actor.permissions.has('users.manage')) return null;
  return forbidden('You are not authorised to manage users.');
}

function checkPermissionGrant(actor: PolicyActor, requested: string[]): PolicyDenial | null {
  if (actor.isOwner) return null;
  if (requested.some(isPrivileged)) {
    return forbidden('Only the owner can grant privileged permissions.');
  }
  if (requested.some((permission) => !actor.permissions.has(permission))) {
    return forbidden('You cannot assign permissions you do not hold.');
  }
  return null;
}

/** Creation rules (depend only on the actor and the request body). */
export function checkCreateUser(actor: PolicyActor, role: string, permissions: string[]): PolicyDenial | null {
  if (actor.isOwner) return null;
  if (!ADMIN_ASSIGNABLE_ROLES.includes(role)) {
    return forbidden('Only the owner can create administrator or owner accounts.');
  }
  return checkPermissionGrant(actor, permissions);
}

/** Update rules that depend on the target account (call after loading the target profile). */
export function checkUpdateUser(
  actor: PolicyActor,
  target: { id: string; role: unknown },
  change: { role?: string; permissions?: string[]; currentPermissions: string[] }
): PolicyDenial | null {
  if (actor.userId === target.id) {
    return forbidden('You cannot change your own user role or permissions.');
  }
  if (actor.isOwner) return null;

  const targetRole = normaliseRole(target.role);
  if (targetRole === 'owner') return forbidden('Only the owner can modify owner-level users.');
  if (targetRole === 'admin') return forbidden('Only the owner can modify administrator accounts.');

  if (change.role !== undefined && change.role !== targetRole && !ADMIN_ASSIGNABLE_ROLES.includes(change.role)) {
    return forbidden('Only the owner can assign administrator or owner roles.');
  }

  if (change.permissions) {
    const requestedPrivileged = change.permissions.filter(isPrivileged).sort().join(',');
    const currentPrivileged = change.currentPermissions.filter(isPrivileged).sort().join(',');
    if (requestedPrivileged !== currentPrivileged) {
      return forbidden('Only the owner can grant or revoke privileged permissions.');
    }
    return checkPermissionGrant(actor, change.permissions.filter((permission) => !isPrivileged(permission)));
  }
  return null;
}

/** Deletion rules (call after loading the target profile). */
export function checkDeleteUser(actor: PolicyActor, target: { id: string; role: unknown }): PolicyDenial | null {
  if (actor.userId === target.id) return forbidden('You cannot remove your own account.');
  if (actor.isOwner) return null;

  const targetRole = normaliseRole(target.role);
  if (targetRole === 'owner') return forbidden('Only the owner can remove owner-level users.');
  if (targetRole === 'admin') return forbidden('Only the owner can remove administrator accounts.');
  return null;
}
