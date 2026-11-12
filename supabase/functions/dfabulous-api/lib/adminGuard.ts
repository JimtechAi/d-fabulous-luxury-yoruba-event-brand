// Single entry point for every rate-limited administrator route.
//
// Mandatory order (callers perform step 1 before invoking this helper):
//   1. Validate the request shape   (cheap, no credentials or database involved)
//   2. Authenticate the user        -> 401
//   3. Verify administrator access  -> 403 (permission / role / inactive account)
//   4. Apply administrator rate limiting (keyed by the authenticated admin id + trusted IP) -> 429/503
//   5. Execute the operation
// Unauthenticated or unauthorised requests are rejected before step 4, so they can never consume or
// exhaust an administrator's quota. Error bodies never echo tokens, permission names or internals.
import type { Context } from 'hono';
import { requireAdminAccess, type AdminUser } from './auth.ts';
import { getAuthorizationError } from './validation.ts';
import { enforceAdminRateLimit, type RateLimitScope } from './rateLimit.ts';
import type { PolicyDenial } from './userPolicy.ts';

export interface AdminGuardOptions {
  /** Rate-limit scope to apply after authorisation. Omit for routes without administrator limiting. */
  rateLimit?: Exclude<RateLimitScope, 'submission'>;
  /** When set, requires the admin/owner role (not just the permission) and uses this 403 message. */
  adminRoleMessage?: string;
  /**
   * Extra authorisation rules evaluated after the permission check and BEFORE the rate limit
   * (for example the user-management hierarchy). Return a denial to reject the request.
   */
  authorize?: (adminUser: AdminUser) => PolicyDenial | null;
}

export type AdminGuardResult =
  | { ok: true; adminUser: AdminUser }
  | { ok: false; response: Response };

export async function guardAdminRequest(
  c: Context,
  requiredPermissions: string[],
  options: AdminGuardOptions = {}
): Promise<AdminGuardResult> {
  const access = await requireAdminAccess(c.req.header('authorization'), requiredPermissions);
  if (access.response || !access.adminUser) {
    const failure = access.response ?? {
      status: 401,
      json: getAuthorizationError('Authentication Error', 'Your admin session is invalid or expired.'),
    };
    return { ok: false, response: c.json(failure.json, failure.status as 401) };
  }

  const adminUser = access.adminUser;
  if (options.adminRoleMessage && !adminUser.isAdmin) {
    return {
      ok: false,
      response: c.json(getAuthorizationError('Authorization Error', options.adminRoleMessage), 403),
    };
  }

  if (options.authorize) {
    const denial = options.authorize(adminUser);
    if (denial) {
      return {
        ok: false,
        response: c.json(getAuthorizationError(denial.error, denial.details), denial.status as 403),
      };
    }
  }

  if (options.rateLimit) {
    const limited = await enforceAdminRateLimit(c, adminUser.userId, options.rateLimit);
    if (limited) return { ok: false, response: limited };
  }

  return { ok: true, adminUser };
}
