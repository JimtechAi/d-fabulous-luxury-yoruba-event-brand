import { backend, call, inDevelopment, inProduction, validBooking } from './setup.ts';
import { assert, assertEquals, assertFalse, assertStringIncludes } from '@std/assert';

const BLOCK_DATE = { event_date: '2027-03-01', note: 'test' };
const adminPost = (token?: string, ip?: string | null) =>
  call('/api/admin/blocked-dates', { method: 'POST', token, ip, body: BLOCK_DATE });

function fresh(): void {
  backend.reset();
}

Deno.test('admin: unauthenticated request is 401 and consumes no administrator quota', async () => {
  fresh();
  await inProduction(async () => {
    const res = await adminPost(undefined);
    assertEquals(res.status, 401);
    assertEquals(backend.rpcCalls.length, 0);
    assertEquals(backend.writes.length, 0);
  });
});

Deno.test('admin: invalid token is 401, generic message, no quota consumed', async () => {
  fresh();
  await inProduction(async () => {
    const res = await adminPost('totally-invalid-token');
    assertEquals(res.status, 401);
    const text = await res.text();
    assertFalse(text.includes('totally-invalid-token'), 'error body must not echo the token');
    assertEquals(backend.rpcCalls.length, 0);
  });
});

Deno.test('admin: malformed Authorization schemes and oversized tokens are 401 without quota use', async () => {
  fresh();
  await inProduction(async () => {
    const basic = await call('/api/admin/blocked-dates', { method: 'POST', headers: { authorization: 'Basic abc' }, body: BLOCK_DATE });
    assertEquals(basic.status, 401);
    const huge = await adminPost('x'.repeat(5000));
    assertEquals(huge.status, 401);
    assertEquals(backend.rpcCalls.length, 0);
  });
});

Deno.test('admin: authenticated non-admin is 403, permission name not leaked, no quota consumed', async () => {
  fresh();
  await inProduction(async () => {
    const res = await adminPost('viewer-token');
    assertEquals(res.status, 403);
    const text = await res.text();
    assertFalse(text.includes('bookings.manage'), 'error body must not disclose permission keys');
    assertEquals(backend.rpcCalls.length, 0);
    assertEquals(backend.writes.length, 0);
  });
});

Deno.test('admin: inactive administrator is 403 and consumes no quota', async () => {
  fresh();
  await inProduction(async () => {
    const res = await adminPost('inactive-token');
    assertEquals(res.status, 403);
    assertEquals(backend.rpcCalls.length, 0);
  });
});

Deno.test('admin: authorised administrator succeeds and is limited by hashed admin id + hashed IP', async () => {
  fresh();
  await inProduction(async () => {
    const res = await adminPost('admin-token', '198.51.100.7');
    assertEquals(res.status, 201);
    assertEquals(backend.writes, ['blocked_dates.insert']);

    const calls = backend.adminRpcCalls();
    assertEquals(calls.length, 2);
    assert(calls[0].key.startsWith('admin_status:user:'));
    assert(calls[1].key.startsWith('admin_status:ip:'));
    for (const rpcCall of calls) {
      assertFalse(rpcCall.key.includes('admin-1'), 'raw admin id must not be stored');
      assertFalse(rpcCall.key.includes('198.51.100.7'), 'raw IP must not be stored');
      assert(rpcCall.key.length <= 200);
    }
    assertEquals(calls[0].limit, 30);
    assertEquals(calls[1].limit, 90);
  });
});

Deno.test('admin: validation runs before authentication (400 for a bad body, no quota consumed)', async () => {
  fresh();
  await inProduction(async () => {
    const res = await call('/api/admin/blocked-dates', { method: 'POST', token: 'admin-token', body: { event_date: 'not-a-date' } });
    assertEquals(res.status, 400);
    assertEquals(backend.rpcCalls.length, 0);
  });
});

Deno.test('admin: 31st request in a window is 429 with Retry-After; earlier ones succeed', async () => {
  fresh();
  await inProduction(async () => {
    for (let index = 0; index < 30; index += 1) {
      const res = await adminPost('admin-token');
      assertEquals(res.status, 201, `request ${index + 1}`);
    }
    const limited = await adminPost('admin-token');
    assertEquals(limited.status, 429);
    assertEquals(limited.headers.get('retry-after'), '900');
    const body = await limited.json();
    assertEquals(body.error, 'Too Many Requests');
    assertEquals(backend.writes.length, 30, 'the limited request must not execute');
  });
});

Deno.test('admin: another administrator keeps an independent quota even from the same IP', async () => {
  fresh();
  await inProduction(async () => {
    for (let index = 0; index < 30; index += 1) await adminPost('admin-token', '198.51.100.9');
    assertEquals((await adminPost('admin-token', '198.51.100.9')).status, 429);
    assertEquals((await adminPost('admin2-token', '198.51.100.9')).status, 201);
    assertEquals((await adminPost('admin2-token', '203.0.113.99')).status, 201);
  });
});

Deno.test('admin: unauthenticated/unauthorised flooding from the same IP cannot exhaust an administrator quota', async () => {
  fresh();
  await inProduction(async () => {
    for (let index = 0; index < 100; index += 1) {
      const anonymous = await adminPost(undefined, '198.51.100.20');
      assertEquals(anonymous.status, 401);
      const viewer = await adminPost('viewer-token', '198.51.100.20');
      assertEquals(viewer.status, 403);
      const invalid = await adminPost('forged-token', '198.51.100.20');
      assertEquals(invalid.status, 401);
    }
    assertEquals(backend.rpcCalls.length, 0);
    assertEquals((await adminPost('admin-token', '198.51.100.20')).status, 201);
  });
});

Deno.test('admin: a stolen token rotating IP addresses is still limited by administrator id', async () => {
  fresh();
  await inProduction(async () => {
    for (let index = 0; index < 30; index += 1) {
      assertEquals((await adminPost('admin-token', `203.0.113.${index + 1}`)).status, 201);
    }
    assertEquals((await adminPost('admin-token', '203.0.113.200')).status, 429);
  });
});

Deno.test('admin: missing client IP never disables or merges administrator limiting', async () => {
  fresh();
  await inProduction(async () => {
    const res = await adminPost('admin-token', null);
    assertEquals(res.status, 201);
    const calls = backend.adminRpcCalls();
    assertEquals(calls.length, 1);
    assert(calls[0].key.startsWith('admin_status:user:'));
    assertFalse(calls.some((rpcCall) => rpcCall.key.includes('unknown')));
  });
});

Deno.test('admin: settings update is validated, authenticated, then rate limited with its own scope', async () => {
  fresh();
  await inProduction(async () => {
    const anonymous = await call('/api/admin/settings', { method: 'PUT', body: { values: { a: 'b' } } });
    assertEquals(anonymous.status, 401);
    const viewer = await call('/api/admin/settings', { method: 'PUT', token: 'viewer-token', body: { values: { a: 'b' } } });
    assertEquals(viewer.status, 403);
    const invalid = await call('/api/admin/settings', { method: 'PUT', token: 'admin-token', body: { values: 'nope' } });
    assertEquals(invalid.status, 400);
    assertEquals(backend.rpcCalls.length, 0);

    const ok = await call('/api/admin/settings', { method: 'PUT', token: 'admin-token', body: { values: { a: 'b' } } });
    assertEquals(ok.status, 200);
    assert(backend.adminRpcCalls().every((rpcCall) => rpcCall.key.startsWith('admin_settings:')));
  });
});

Deno.test('admin: booking status route authenticates before the rate limit and rejects non-admin roles', async () => {
  fresh();
  await inProduction(async () => {
    const anonymous = await call('/api/bookings/abc/status', { method: 'PATCH', body: { status: 'confirmed' } });
    assertEquals(anonymous.status, 401);
    const viewer = await call('/api/bookings/abc/status', { method: 'PATCH', token: 'viewer-token', body: { status: 'confirmed' } });
    assertEquals(viewer.status, 403);
    assertEquals(backend.rpcCalls.length, 0);
  });
});

Deno.test('admin: payments, archive, update and delete routes never consume quota for unauthenticated callers', async () => {
  fresh();
  await inProduction(async () => {
    const requests: Array<[string, string, unknown]> = [
      ['PATCH', '/api/bookings/abc', { event_location: 'x' }],
      ['DELETE', '/api/bookings/abc', undefined],
      ['POST', '/api/bookings/abc/archive', undefined],
      ['POST', '/api/bookings/abc/payments', { amount: 10, currency: 'GBP', payment_type: 'deposit', provider: 'manual' }],
    ];
    for (const [method, path, body] of requests) {
      const res = await call(path, { method, body });
      assertEquals(res.status, 401, `${method} ${path}`);
    }
    assertEquals(backend.rpcCalls.length, 0);
  });
});

Deno.test('admin: read-only admin endpoints reject anonymous callers', async () => {
  fresh();
  await inProduction(async () => {
    for (const path of ['/api/admin/session', '/api/admin/users', '/api/admin/data/bookings']) {
      const res = await call(path);
      assertEquals(res.status, 401, path);
    }
  });
});

Deno.test('database RPC failure: production fails closed with 503, operation not executed, no internals leaked', async () => {
  for (const mode of ['rpc-error', 'throw', 'non-boolean'] as const) {
    fresh();
    backend.rpcMode = mode;
    await inProduction(async () => {
      const admin = await adminPost('admin-token');
      assertEquals(admin.status, 503, `admin ${mode}`);
      const text = await admin.text();
      assertFalse(text.includes('database unavailable') || text.includes('network down'));
      assertEquals(backend.writes.length, 0, 'operation must not run when limiting is unavailable');

      const booking = await call('/api/bookings', { method: 'POST', body: validBooking });
      assertEquals(booking.status, 503, `public ${mode}`);
      assertEquals(backend.writes.length, 0);
    });
  }
});

Deno.test('database RPC failure: unauthenticated callers still get 401, not a 503 oracle', async () => {
  fresh();
  backend.rpcMode = 'rpc-error';
  await inProduction(async () => {
    assertEquals((await adminPost(undefined)).status, 401);
  });
});

Deno.test('development fallback cannot activate in production, even when the flag is set', async () => {
  for (const production of [
    { DENO_DEPLOYMENT_ID: 'x' },
    { SB_REGION: 'eu-west-2' },
    { SB_EXECUTION_ID: 'abc' },
    { SUPABASE_URL: 'https://prod-project.supabase.co' },
    { APP_ENV: 'production' },
    { NODE_ENV: 'production' },
  ]) {
    fresh();
    backend.rpcMode = 'rpc-error';
    await inDevelopment(async () => {
      const res = await adminPost('admin-token');
      assertEquals(res.status, 503, JSON.stringify(production));
      assertEquals(backend.writes.length, 0);
    }, { ...production, RATE_LIMIT_DEV_FALLBACK: 'true' });
  }
});

Deno.test('development fallback works locally only when explicitly enabled', async () => {
  fresh();
  backend.rpcMode = 'rpc-error';
  await inDevelopment(async () => {
    const { resetMemoryRateLimitBuckets } = await import('../lib/rateLimit.ts');
    resetMemoryRateLimitBuckets();
    assertEquals((await adminPost('admin-token')).status, 201);
  }, { RATE_LIMIT_DEV_FALLBACK: 'true' });

  fresh();
  backend.rpcMode = 'rpc-error';
  await inDevelopment(async () => {
    assertEquals((await adminPost('admin-token')).status, 503, 'fallback must be opt-in');
  });
});

Deno.test('error responses never contain credentials or stack traces', async () => {
  fresh();
  backend.rpcMode = 'throw';
  await inProduction(async () => {
    const res = await adminPost('admin-token');
    const text = await res.text();
    for (const secret of ['test-service-role-key', 'test-anon-key', 'admin-token', '\n    at ', 'stack']) {
      assertFalse(text.includes(secret), `response leaked "${secret}"`);
    }
    assertStringIncludes(text, 'Service Unavailable');
  });
});
