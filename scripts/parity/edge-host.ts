// Parity host for the EDGE FUNCTION (supabase/functions/dfabulous-api, unchanged): installs the shared fake in place of fetch, sets the same non-secret dummy
// configuration as the Express host, serves app.fetch on PORT and exposes a control endpoint (reset / log) on CONTROL_PORT.
// Run with: deno run --allow-env --allow-net=127.0.0.1 --allow-read --config supabase/functions/dfabulous-api/deno.json scripts/parity/edge-host.ts
import { ANON_KEY, SERVICE_KEY, SUPABASE_URL, createFake, parseSchema } from './fake-supabase.mjs';

const schema = parseSchema(Deno.readTextFileSync('supabase/staging/install/01_production_schema.sql'));
const fake = createFake({ schema });
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => fake.fetch(input, init)) as typeof fetch;

const config: Record<string, string> = {
  VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_ANON_KEY: ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  RESEND_API_KEY: 're_parity_not_a_secret', RESEND_FROM_EMAIL: "D'Fabulous <bookings@example.test>", RESEND_NOTIFICATION_EMAIL: 'owner-notify@example.test', RESEND_TESTING_MODE: 'false',
  CORS_ALLOWED_ORIGINS: 'https://staging.example.test',
};
for (const [k, v] of Object.entries({ ...config, ...JSON.parse(Deno.env.get('PARITY_ENV_OVERRIDES') || '{}') })) Deno.env.set(k, v);
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'DENO_DEPLOYMENT_ID', 'SB_REGION', 'SB_EXECUTION_ID', 'APP_ENV', 'NODE_ENV', 'RATE_LIMIT_DEV_FALLBACK', 'RESEND_TESTING_EMAIL']) { if (!(name in JSON.parse(Deno.env.get('PARITY_ENV_OVERRIDES') || '{}'))) Deno.env.delete(name); }

const { app } = await import('../../supabase/functions/dfabulous-api/app.ts');

Deno.serve({ port: Number(Deno.env.get('PORT')), hostname: '127.0.0.1', onListen: () => {} }, app.fetch);
Deno.serve({ port: Number(Deno.env.get('CONTROL_PORT')), hostname: '127.0.0.1', onListen: () => {} }, (req) => {
  const { pathname, searchParams } = new URL(req.url);
  if (pathname === '/reset') { fake.reset(searchParams.get('hard') === '1'); return Response.json({ ok: true }); }
  if (pathname === '/fault') { fake.setFault({ resend: Number(searchParams.get('resend')) || 0 }); return Response.json({ ok: true }); }
  if (pathname === '/log') return Response.json({ ...fake.getLog(), snapshot: fake.snapshot() });
  return new Response('{}', { status: 404 });
});
