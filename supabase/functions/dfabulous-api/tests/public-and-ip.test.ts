import { backend, call, inDevelopment, inProduction, validBooking } from './setup.ts';
import { assert, assertEquals, assertFalse } from '@std/assert';
import { getClientIp, normalizeIp, NO_IP_GLOBAL_LIMIT, SUBMISSION_LIMIT } from '../lib/rateLimit.ts';
import { getAllowedOrigins, isProductionDeployment, rateLimitDevFallbackEnabled } from '../lib/env.ts';

const book = (ip?: string | null, headers?: Record<string, string>) =>
  call('/api/bookings', { method: 'POST', ip, headers, body: validBooking });

Deno.test('public booking: succeeds and is limited per trusted client IP (5 per window)', async () => {
  backend.reset();
  await inProduction(async () => {
    for (let index = 0; index < SUBMISSION_LIMIT; index += 1) {
      const res = await book('198.51.100.1');
      assertEquals(res.status, 200, `submission ${index + 1}`);
      const body = await res.json();
      assertEquals(body.success, true);
      assertEquals(body.bookingSaved, true);
    }
    const limited = await book('198.51.100.1');
    assertEquals(limited.status, 429);
    assertEquals((await limited.json()).error, 'Too Many Requests');
    assertEquals(backend.writes.filter((write) => write === 'bookings.insert').length, SUBMISSION_LIMIT);

    // A different visitor is unaffected by the first visitor's exhausted quota.
    assertEquals((await book('198.51.100.2')).status, 200);
  });
});

Deno.test('public booking: contact messages share the submission rate-limit scope', async () => {
  backend.reset();
  await inProduction(async () => {
    const res = await call('/api/messages', { method: 'POST', ip: '198.51.100.3', body: { full_name: 'A', email: 'a@example.test', message: 'hello' } });
    assertEquals(res.status, 200);
    assert(backend.rpcCalls[0].key.startsWith('submission:ip:'));
  });
});

Deno.test('public booking: concurrent requests cannot exceed the limit', async () => {
  backend.reset();
  await inProduction(async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => book('198.51.100.4')));
    const statuses = results.map((res) => res.status);
    assertEquals(statuses.filter((status) => status === 200).length, SUBMISSION_LIMIT);
    assertEquals(statuses.filter((status) => status === 429).length, 25 - SUBMISSION_LIMIT);
    assertEquals(backend.writes.length, SUBMISSION_LIMIT);
  });
});

Deno.test('public booking: concurrent admin requests are counted exactly', async () => {
  backend.reset();
  await inProduction(async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () =>
      call('/api/admin/blocked-dates', { method: 'POST', token: 'admin-token', body: { event_date: '2027-03-01' } })));
    const statuses = results.map((res) => res.status);
    assertEquals(statuses.filter((status) => status === 201).length, 30);
    assertEquals(statuses.filter((status) => status === 429).length, 10);
  });
});

Deno.test('public booking: forged forwarding headers do not create new buckets in production', async () => {
  backend.reset();
  await inProduction(async () => {
    for (let index = 0; index < SUBMISSION_LIMIT + 3; index += 1) {
      await book('198.51.100.5', {
        'x-forwarded-for': `10.0.0.${index}, 10.0.1.${index}`,
        'x-real-ip': `10.9.9.${index}`,
      });
    }
    assertEquals(new Set(backend.rpcCalls.map((rpcCall) => rpcCall.key)).size, 1);
    assertEquals(backend.writes.length, SUBMISSION_LIMIT);
  });
});

Deno.test('public booking: spoofed XFF/X-Real-IP cannot be used to bypass limits when cf-connecting-ip is absent', async () => {
  backend.reset();
  await inProduction(async () => {
    const statuses: number[] = [];
    for (let index = 0; index < SUBMISSION_LIMIT + 2; index += 1) {
      const res = await book(null, {
        'x-forwarded-for': `10.1.1.${index}`,
        'x-real-ip': `10.2.2.${index}`,
        'user-agent': 'same-client',
      });
      statuses.push(res.status);
    }
    assertEquals(statuses.filter((status) => status === 200).length, SUBMISSION_LIMIT);
    assert(statuses.includes(429));
  });
});

Deno.test('missing IP: visitors are not merged into a single "unknown" bucket', async () => {
  backend.reset();
  await inProduction(async () => {
    for (let index = 0; index < SUBMISSION_LIMIT; index += 1) {
      assertEquals((await book(null, { 'user-agent': 'client-A', 'accept-language': 'en-GB' })).status, 200);
    }
    assertEquals((await book(null, { 'user-agent': 'client-A', 'accept-language': 'en-GB' })).status, 429);
    // A different client without an IP still has its own fingerprint quota.
    assertEquals((await book(null, { 'user-agent': 'client-B', 'accept-language': 'fr-FR' })).status, 200);

    const keys = backend.rpcCalls.map((rpcCall) => rpcCall.key);
    assertFalse(keys.some((key) => key.includes('unknown')));
    assert(keys.some((key) => key.startsWith('submission:fp:')));
    assert(keys.some((key) => key === 'submission:noip-global'));
  });
});

Deno.test('missing IP: a global ceiling stops fingerprint rotation (no bypass when IP identification fails)', async () => {
  backend.reset();
  await inProduction(async () => {
    let allowed = 0;
    for (let index = 0; index < NO_IP_GLOBAL_LIMIT + 10; index += 1) {
      const res = await book(null, { 'user-agent': `rotating-agent-${index}` });
      if (res.status === 200) allowed += 1;
    }
    assertEquals(allowed, NO_IP_GLOBAL_LIMIT);
  });
});

Deno.test('missing IP: still fails closed when the database RPC is unavailable', async () => {
  backend.reset();
  backend.rpcMode = 'rpc-error';
  await inProduction(async () => {
    assertEquals((await book(null)).status, 503);
    assertEquals(backend.writes.length, 0);
  });
});

Deno.test('getClientIp: production trusts cf-connecting-ip only', () => {
  return inProduction(() => {
    assertEquals(getClientIp(new Headers({ 'cf-connecting-ip': '203.0.113.5' })), '4:203.0.113.5');
    assertEquals(getClientIp(new Headers({ 'x-forwarded-for': '1.2.3.4' })), null);
    assertEquals(getClientIp(new Headers({ 'x-real-ip': '1.2.3.4' })), null);
    assertEquals(getClientIp(new Headers({ 'cf-connecting-ip': 'not-an-ip', 'x-real-ip': '1.2.3.4' })), null);
    assertEquals(getClientIp(new Headers()), null);
  });
});

Deno.test('getClientIp: development additionally accepts x-real-ip and the last proxy-appended XFF entry', () => {
  return inDevelopment(() => {
    assertEquals(getClientIp(new Headers({ 'x-real-ip': '1.2.3.4' })), '4:1.2.3.4');
    assertEquals(getClientIp(new Headers({ 'x-forwarded-for': '9.9.9.9, 5.6.7.8' })), '4:5.6.7.8');
    assertEquals(getClientIp(new Headers({ 'x-forwarded-for': 'garbage' })), null);
  });
});

Deno.test('normalizeIp: validates and canonicalises IPv4 and IPv6', () => {
  assertEquals(normalizeIp('203.0.113.5'), '4:203.0.113.5');
  assertEquals(normalizeIp(' 203.0.113.5 '), '4:203.0.113.5');
  assertEquals(normalizeIp('256.1.1.1'), null);
  assertEquals(normalizeIp('01.2.3.4'), null);
  assertEquals(normalizeIp('1.2.3'), null);
  assertEquals(normalizeIp(''), null);
  assertEquals(normalizeIp(null), null);
  assertEquals(normalizeIp('x'.repeat(80)), null);
  assertEquals(normalizeIp("1.2.3.4'; DROP TABLE api_rate_limits;--"), null);

  // IPv6 collapses to /64 so a host cannot rotate within its prefix.
  const a = normalizeIp('2001:db8:abcd:12:1:2:3:4');
  const b = normalizeIp('2001:0db8:abcd:0012:ffff:ffff:ffff:ffff');
  assertEquals(a, '6:2001:db8:abcd:12');
  assertEquals(a, b);
  assertEquals(normalizeIp('2001:db8::1'), '6:2001:db8:0:0');
  assertEquals(normalizeIp('[2001:db8::1]'), '6:2001:db8:0:0');
  assertEquals(normalizeIp('::1'), '6:0:0:0:0');
  assertEquals(normalizeIp('::ffff:203.0.113.5'), '4:203.0.113.5');
  assertEquals(normalizeIp('1:2:3:4:5:6:7:8:9'), null);
  assertEquals(normalizeIp('1::2::3'), null);
  assertEquals(normalizeIp('12345::1'), null);
});

Deno.test('production environment detection errs on the side of production', async () => {
  await inDevelopment(() => {
    assertFalse(isProductionDeployment());
    assertFalse(rateLimitDevFallbackEnabled());
  });
  await inDevelopment(() => assert(rateLimitDevFallbackEnabled()), { RATE_LIMIT_DEV_FALLBACK: 'true' });
  await inDevelopment(() => assertFalse(isProductionDeployment()), { SUPABASE_URL: 'http://127.0.0.1:54321' });

  for (const signal of [
    { DENO_DEPLOYMENT_ID: 'abc' },
    { SB_REGION: 'eu-west-2' },
    { SB_EXECUTION_ID: 'id' },
    { SUPABASE_URL: 'https://abcdefgh.supabase.co' },
    { APP_ENV: 'production' },
    { NODE_ENV: 'Production' },
  ]) {
    await inDevelopment(() => {
      assert(isProductionDeployment(), JSON.stringify(signal));
      assertFalse(rateLimitDevFallbackEnabled(), 'dev fallback must be off in production');
    }, { ...signal, RATE_LIMIT_DEV_FALLBACK: 'true' });
  }
});

Deno.test('CORS: only allow-listed origins are echoed; PUT is permitted for admin settings', async () => {
  backend.reset();
  await inProduction(async () => {
    const preflight = await call('/api/admin/settings', {
      method: 'OPTIONS',
      ip: null,
      headers: { origin: 'https://dfabulous.co.uk', 'access-control-request-method': 'PUT' },
    });
    assertEquals(preflight.status, 204);
    assertEquals(preflight.headers.get('access-control-allow-origin'), 'https://dfabulous.co.uk');
    assert((preflight.headers.get('access-control-allow-methods') ?? '').split(',').includes('PUT'));
    assertEquals(preflight.headers.get('vary'), 'Origin');
    assertEquals(preflight.headers.get('access-control-allow-headers'), 'Content-Type, Authorization');

    for (const origin of ['https://evil.example', 'https://dfabulous.co.uk.evil.example', 'null', 'http://dfabulous.co.uk', 'http://localhost:3000']) {
      const denied = await call('/api/admin/settings', { method: 'OPTIONS', ip: null, headers: { origin } });
      assertEquals(denied.status, 204);
      assertEquals(denied.headers.get('access-control-allow-origin'), null, origin);
    }

    const actual = await call('/api/health', { ip: null, headers: { origin: 'https://evil.example' } });
    assertEquals(actual.status, 200);
    assertEquals(actual.headers.get('access-control-allow-origin'), null);
    assertEquals(actual.headers.get('x-content-type-options'), 'nosniff');

    const allowed = await call('/api/health', { ip: null, headers: { origin: 'https://www.dfabulous.co.uk' } });
    assertEquals(allowed.headers.get('access-control-allow-origin'), 'https://www.dfabulous.co.uk');
  });
});

Deno.test('CORS: localhost origins are only allowed outside production; wildcard is never honoured', async () => {
  await inDevelopment(() => {
    assert(getAllowedOrigins().includes('http://localhost:3000') === false, 'localhost only via explicit config');
  });
  await inDevelopment(() => {
    assert(getAllowedOrigins().includes('http://localhost:3000'));
  }, { CORS_ALLOWED_ORIGINS: 'http://localhost:3000' });
  await inProduction(() => {
    assertFalse(getAllowedOrigins().includes('http://localhost:3000'));
  }, { CORS_ALLOWED_ORIGINS: 'http://localhost:3000, http://127.0.0.1:3000' });
  await inProduction(() => {
    assertFalse(getAllowedOrigins().includes('*'));
  }, { CORS_ALLOWED_ORIGINS: '*' });
  await inProduction(() => {
    assert(getAllowedOrigins().includes('https://shop.example.test'), 'trailing slash normalised');
  }, { CORS_ALLOWED_ORIGINS: 'https://shop.example.test/' });
});

Deno.test('public booking: validation errors do not expose database internals', async () => {
  backend.reset();
  await inProduction(async () => {
    const res = await call('/api/bookings', { method: 'POST', body: { ...validBooking, email: 'bad' } });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, 'Validation Error');
  });
});
