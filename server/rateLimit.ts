// In-memory rate limiting helpers for the Express backend. They mirror the identity rules of the
// Supabase Edge Function (supabase/functions/dfabulous-api/lib/rateLimit.ts):
//   * public traffic is keyed by the (validated, normalised) client IP;
//   * administrator traffic is keyed by the authenticated administrator id, with the client IP as an
//     additional, higher-ceiling signal, and is only ever consumed AFTER authentication and the
//     administrator check, so unauthenticated traffic cannot spend an administrator's quota;
//   * a missing IP never collapses visitors into one shared "unknown" bucket.
//
// Express resolves `req.ip` from the socket address unless `trust proxy` is configured. Behind a
// reverse proxy the backend MUST be started with TRUST_PROXY_HOPS set to the verified number of
// trusted proxy hops, otherwise every visitor appears to share the proxy's address.
import { createHash } from 'node:crypto';
import { normalizeIp } from '../supabase/functions/dfabulous-api/lib/ip.ts';

export const SUBMISSION_WINDOW_MS = 15 * 60 * 1000;
export const SUBMISSION_LIMIT = 5;
export const ADMIN_LIMIT = 30;
export const ADMIN_IP_LIMIT_MULTIPLIER = 3;
export const NO_IP_GLOBAL_LIMIT = 30;

export type AdminRateLimitScope = 'admin_status' | 'admin_settings' | 'admin_users';

interface Bucket {
  count: number;
  resetAt: number;
}

export class FixedWindowLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly windowMs: number) {}

  /** Returns true when the request fits inside the bucket's limit for the current window. */
  consume(key: string, limit: number, now = Date.now()): boolean {
    if (this.buckets.size > 1_000) this.prune(now);
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }

  /** Consumes every bucket; stops at the first one that is exhausted. */
  consumeAll(buckets: RateLimitBucket[], now = Date.now()): boolean {
    return buckets.every((bucket) => this.consume(bucket.key, bucket.limit, now));
  }

  get size(): number {
    return this.buckets.size;
  }

  private prune(now: number): void {
    for (const [key, value] of this.buckets) {
      if (value.resetAt <= now) this.buckets.delete(key);
    }
  }
}

export interface RateLimitBucket {
  key: string;
  limit: number;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

/** Buckets for an unauthenticated submission (booking or contact message). */
export function submissionBuckets(
  ip: string | undefined | null,
  userAgent: string | undefined,
  acceptLanguage: string | undefined
): RateLimitBucket[] {
  const normalised = normalizeIp(ip);
  if (normalised) return [{ key: `submission:ip:${digest(`ip:${normalised}`)}`, limit: SUBMISSION_LIMIT }];

  return [
    { key: `submission:fp:${digest(`fp:${userAgent ?? ''}|${acceptLanguage ?? ''}`)}`, limit: SUBMISSION_LIMIT },
    { key: 'submission:noip-global', limit: NO_IP_GLOBAL_LIMIT },
  ];
}

/** Buckets for an authenticated and authorised administrator request. */
export function adminBuckets(
  scope: AdminRateLimitScope,
  adminUserId: string,
  ip: string | undefined | null
): RateLimitBucket[] {
  const buckets: RateLimitBucket[] = [{ key: `${scope}:user:${digest(`user:${adminUserId}`)}`, limit: ADMIN_LIMIT }];
  const normalised = normalizeIp(ip);
  if (normalised) {
    buckets.push({ key: `${scope}:ip:${digest(`ip:${normalised}`)}`, limit: ADMIN_LIMIT * ADMIN_IP_LIMIT_MULTIPLIER });
  }
  return buckets;
}

/** Parses TRUST_PROXY_HOPS. Returns null (do not trust any proxy) unless it is an integer 1-5. */
export function parseTrustProxyHops(value: string | undefined): number | null {
  if (!value || !/^[1-5]$/.test(value.trim())) return null;
  return Number(value.trim());
}
