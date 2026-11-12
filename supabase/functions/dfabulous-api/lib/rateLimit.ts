// Durable PostgreSQL-backed rate limiting. FAIL-CLOSED in production.
//
// Primary path: public.consume_rate_limit() RPC (SECURITY DEFINER, service_role
// execute only, atomic single-statement upsert). See supabase/migrations/.
//
// Failure behaviour:
//   * RPC allows the request        -> continue processing.
//   * RPC reports the limit reached -> 429 with the existing contract body.
//   * RPC fails or is unavailable   -> 503 Service Unavailable. The internal error is
//     logged (message only, never credentials); the client receives no internals.
//     Production NEVER silently downgrades to in-memory limiting.
//   * Development only: when RATE_LIMIT_DEV_FALLBACK=true AND the runtime is not detected as
//     production (see isProductionDeployment() in env.ts), an in-memory per-process fallback is
//     used so the function can be exercised locally before the migration is applied.
//
// ---------------------------------------------------------------------------------------
// CLIENT IP IDENTIFICATION STRATEGY (documented in docs/SECURITY_ARCHITECTURE.md)
// ---------------------------------------------------------------------------------------
// Hosted Supabase Edge Functions run behind Cloudflare. Cloudflare sets `cf-connecting-ip` to the
// real connecting address and rejects/overwrites forged values, so it is the ONLY client-IP header
// trusted in production. `x-forwarded-for` and `x-real-ip` carry client-seedable data and the
// trusted-append position is proxy-specific, so they are never trusted in production.
//   1. production : cf-connecting-ip (validated and normalised)            -> IP bucket
//   2. development: cf-connecting-ip -> x-real-ip -> last x-forwarded-for  -> IP bucket
//   3. no usable IP (should not happen on the hosted platform):
//        a. public traffic: per-fingerprint bucket (hash of user-agent + accept-language) AND a
//           low global "no-ip" ceiling. Visitors are never placed into one shared `unknown`
//           bucket, and rotating fingerprints cannot bypass the global ceiling.
//        b. admin traffic: the authenticated administrator id bucket always applies, so a missing
//           IP never disables administrator limiting.
// IPv4 addresses are used as-is, IPv6 addresses are collapsed to their /64 so a single host cannot
// rotate through its prefix. Identifiers are SHA-256 hashed before storage: the database never
// holds raw IP addresses. The value is still to be re-verified against live headers during the
// pre-cutover smoke test (see the deployment checklist).
import type { Context } from 'hono';
import { serviceClient } from './supabase.ts';
import { isProductionDeployment, rateLimitDevFallbackEnabled } from './env.ts';
import { normalizeIp } from './ip.ts';

export const SUBMISSION_WINDOW_SECONDS = 15 * 60;
export const SUBMISSION_LIMIT = 5;
export const ADMIN_STATUS_LIMIT = 30;
// Per-IP admin ceiling is deliberately higher than the per-administrator limit because several
// administrators may share one office/NAT address. It is an additional signal, not the primary key.
export const ADMIN_IP_LIMIT_MULTIPLIER = 3;
// Global ceiling for public requests that carry no usable client IP.
export const NO_IP_GLOBAL_LIMIT = 30;

export type RateLimitScope = 'submission' | 'admin_status' | 'admin_settings' | 'admin_users';
export type RateLimitDecision = 'allowed' | 'limited' | 'unavailable';

interface MemoryBucket {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, MemoryBucket>();

function pruneExpiredMemoryBuckets(at: number): void {
  for (const [key, value] of memoryBuckets) {
    if (value.resetAt <= at) memoryBuckets.delete(key);
  }
}

function consumeMemoryBucket(key: string, limit: number, windowSeconds: number): RateLimitDecision {
  const now = Date.now();
  if (memoryBuckets.size > 1_000) pruneExpiredMemoryBuckets(now);
  const current = memoryBuckets.get(key);

  if (!current || current.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 'allowed';
  }

  if (current.count >= limit) return 'limited';
  current.count += 1;
  return 'allowed';
}

/** Test helper: clears the development-only in-memory buckets. */
export function resetMemoryRateLimitBuckets(): void {
  memoryBuckets.clear();
}

export { normalizeIp };

/**
 * Resolves the caller IP from trusted platform-set headers only (see the strategy above).
 * Returns null when no trustworthy, well-formed IP is available.
 */
export function getClientIp(headers: Headers): string | null {
  const cfIp = normalizeIp(headers.get('cf-connecting-ip'));
  if (cfIp) return cfIp;

  if (!isProductionDeployment()) {
    const realIp = normalizeIp(headers.get('x-real-ip'));
    if (realIp) return realIp;

    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) {
      const parts = forwarded.split(',').map((part) => part.trim()).filter(Boolean);
      const lastIp = normalizeIp(parts[parts.length - 1]);
      if (lastIp) return lastIp;
    }
  }

  return null;
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash).slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function consume(bucketKey: string, limit: number, windowSeconds: number): Promise<RateLimitDecision> {
  try {
    const { data, error } = await serviceClient().rpc('consume_rate_limit', {
      p_bucket_key: bucketKey,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) throw error;
    if (typeof data === 'boolean') return data ? 'allowed' : 'limited';

    throw new Error('consume_rate_limit returned a non-boolean result.');
  } catch (error) {
    // Log the internal failure without exposing credentials or bucket identifiers.
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message || 'unknown error';
    console.error('[Edge API] Rate limit RPC failure:', { error: message });

    if (rateLimitDevFallbackEnabled()) {
      console.warn('[Edge API] RATE_LIMIT_DEV_FALLBACK active (non-production only): using in-memory limiter.');
      return consumeMemoryBucket(bucketKey, limit, windowSeconds);
    }

    return 'unavailable';
  }
}

/** Consumes every bucket in order and stops at the first non-allowed decision. */
async function consumeAll(buckets: Array<{ key: string; limit: number }>): Promise<RateLimitDecision> {
  for (const bucket of buckets) {
    const decision = await consume(bucket.key, bucket.limit, SUBMISSION_WINDOW_SECONDS);
    if (decision !== 'allowed') return decision;
  }
  return 'allowed';
}

export const SUBMISSION_LIMIT_RESPONSE = {
  success: false,
  error: 'Too Many Requests',
  details: 'Please wait a few minutes before submitting another enquiry.',
};

export const ADMIN_LIMIT_RESPONSE = {
  success: false,
  error: 'Too Many Requests',
  details: 'Too many booking status changes were requested. Please try again later.',
};

export const ADMIN_SETTINGS_LIMIT_RESPONSE = {
  success: false,
  error: 'Too Many Requests',
  details: 'Too many administrative changes were requested. Please try again later.',
};

const LIMIT_RESPONSES: Record<Exclude<RateLimitScope, 'submission'>, Record<string, unknown>> = {
  admin_status: ADMIN_LIMIT_RESPONSE,
  admin_settings: ADMIN_SETTINGS_LIMIT_RESPONSE,
  admin_users: {
    success: false,
    error: 'Too Many Requests',
    details: 'Too many user-management changes were requested. Please try again later.',
  },
};

const UNAVAILABLE_RESPONSE = {
  success: false,
  error: 'Service Unavailable',
  details: 'The service is temporarily unable to process requests. Please try again shortly.',
};

function decisionResponse(c: Context, decision: RateLimitDecision, limitedBody: Record<string, unknown>): Response | null {
  if (decision === 'allowed') return null;
  if (decision === 'limited') {
    c.header('Retry-After', String(SUBMISSION_WINDOW_SECONDS));
    return c.json(limitedBody, 429);
  }
  return c.json(UNAVAILABLE_RESPONSE, 503);
}

/**
 * Public (unauthenticated) rate limit, keyed by trusted client IP. Returns null when the request
 * may proceed, otherwise the 429 or 503 response to send.
 */
export async function enforceRateLimit(c: Context, scope: 'submission'): Promise<Response | null> {
  const headers = c.req.raw.headers;
  const ip = getClientIp(headers);
  const buckets: Array<{ key: string; limit: number }> = [];

  if (ip) {
    buckets.push({ key: `${scope}:ip:${await digest(`ip:${ip}`)}`, limit: SUBMISSION_LIMIT });
  } else {
    console.warn('[Edge API] No trusted client IP available; using fingerprint and global no-IP buckets.');
    const fingerprint = await digest(`fp:${headers.get('user-agent') ?? ''}|${headers.get('accept-language') ?? ''}`);
    buckets.push({ key: `${scope}:fp:${fingerprint}`, limit: SUBMISSION_LIMIT });
    buckets.push({ key: `${scope}:noip-global`, limit: NO_IP_GLOBAL_LIMIT });
  }

  return decisionResponse(c, await consumeAll(buckets), SUBMISSION_LIMIT_RESPONSE);
}

/**
 * Administrator rate limit. MUST be called only after the caller has been authenticated and
 * authorised as an administrator, so unauthenticated or unauthorised traffic can never consume
 * (or exhaust) an administrator's quota.
 *
 *  - Primary bucket : authenticated administrator id.
 *  - Secondary bucket: trusted client IP (when available), with a higher ceiling.
 */
export async function enforceAdminRateLimit(
  c: Context,
  adminUserId: string,
  scope: Exclude<RateLimitScope, 'submission'> = 'admin_status'
): Promise<Response | null> {
  const buckets = [{ key: `${scope}:user:${await digest(`user:${adminUserId}`)}`, limit: ADMIN_STATUS_LIMIT }];

  const ip = getClientIp(c.req.raw.headers);
  if (ip) {
    buckets.push({
      key: `${scope}:ip:${await digest(`ip:${ip}`)}`,
      limit: ADMIN_STATUS_LIMIT * ADMIN_IP_LIMIT_MULTIPLIER,
    });
  }

  return decisionResponse(c, await consumeAll(buckets), LIMIT_RESPONSES[scope]);
}
