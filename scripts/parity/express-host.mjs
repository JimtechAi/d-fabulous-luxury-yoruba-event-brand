// Parity host for the EXPRESS backend (server.ts, unchanged): installs the shared fake in place of fetch, sets non-secret dummy configuration, starts the
// real server on PORT and exposes a control endpoint (reset / log) on CONTROL_PORT. Run with: node --import tsx scripts/parity/express-host.mjs
import fs, { readFileSync } from 'node:fs';
import http from 'node:http';
import { ANON_KEY, SERVICE_KEY, SUPABASE_URL, createFake, parseSchema } from './fake-supabase.mjs';

// server.ts calls dotenv.config({ override: true }). The repository's real .env / .env.local must never be read by this harness (they hold real project settings
// and keys), so reads of any .env file return nothing; every setting below is a dummy value.
const realRead = fs.readFileSync;
fs.readFileSync = (path, ...rest) => (/[\\/]\.env(\.[\w.]+)?$/.test(String(path)) ? '' : realRead(path, ...rest));

const schema = parseSchema(readFileSync('supabase/staging/install/01_production_schema.sql', 'utf8'));
const fake = createFake({ schema });
globalThis.fetch = fake.fetch;

Object.assign(process.env, {
  NODE_ENV: 'production', TRUST_PROXY_HOPS: '1',
  VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_ANON_KEY: ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  RESEND_API_KEY: 're_parity_not_a_secret', RESEND_FROM_EMAIL: 'D\'Fabulous <bookings@example.test>', RESEND_NOTIFICATION_EMAIL: 'owner-notify@example.test', RESEND_TESTING_MODE: 'false',
  CORS_ALLOWED_ORIGINS: 'https://staging.example.test',
});
for (const name of ['RESEND_TESTING_EMAIL', 'VITE_API_BASE_URL', 'VITE_APP_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) delete process.env[name];
Object.assign(process.env, JSON.parse(process.env.PARITY_ENV_OVERRIDES || '{}'));
// Safety net for the whole run: any attempt to reach a host other than the fake is an error, never a request.

http.createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url.startsWith('/reset')) { fake.reset(req.url.includes('hard=1')); res.end('{"ok":true}'); return; }
  if (req.url.startsWith('/fault')) { fake.setFault({ resend: Number(new URL(req.url, 'http://x').searchParams.get('resend')) || 0 }); res.end('{"ok":true}'); return; }
  if (req.url === '/log') { res.end(JSON.stringify({ ...fake.getLog(), snapshot: fake.snapshot() })); return; }
  res.statusCode = 404; res.end('{}');
}).listen(Number(process.env.CONTROL_PORT), '127.0.0.1');

await import('../../server.ts');
