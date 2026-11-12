// dfabulous-api - Supabase Edge Function replacing the Render Express backend.
//
// Deployed with verify_jwt = false because the public booking/availability/enquiry
// endpoints are called by anonymous website visitors. ALL authentication and
// authorization is enforced inside the function (lib/auth.ts) exactly as the
// Express backend did; CORS is never treated as an auth mechanism.
//
// URL shape: https://<project-ref>.supabase.co/functions/v1/dfabulous-api/api/...
// The basePath below preserves every existing /api/* route suffix so the frontend
// only needs a VITE_API_BASE_URL change at cutover.
import { Hono } from 'hono';
import { getAllowedOrigins, isSupabaseConfigured } from './lib/env.ts';
import { publicRoutes } from './routes/public.ts';
import { adminBookingRoutes } from './routes/admin-bookings.ts';
import { adminDataRoutes } from './routes/admin-data.ts';
import { adminSettingsRoutes } from './routes/admin-settings.ts';
import { adminUserRoutes } from './routes/admin-users.ts';

if (!isSupabaseConfigured) {
  console.error('[Edge API] Supabase configuration incomplete: SUPABASE_URL and SUPABASE_ANON_KEY are required.');
}

export const app = new Hono().basePath('/dfabulous-api');

const CORS_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const CORS_HEADERS = 'Content-Type, Authorization';

// CORS + security headers, identical policy to the Express backend. Only exact allow-listed
// origins are echoed back; there is no wildcard and no reflection of arbitrary origins.
app.use('*', async (c, next) => {
  // Pathname log: lets gateway routing be verified in function logs.
  console.info('[Edge API]', c.req.method, new URL(c.req.url).pathname);
  const requestOrigin = c.req.header('origin');
  const originAllowed = Boolean(requestOrigin && getAllowedOrigins().includes(requestOrigin.replace(/\/+$/, '')));

  if (c.req.method === 'OPTIONS') {
    const headers = new Headers();
    if (originAllowed && requestOrigin) {
      headers.set('Access-Control-Allow-Origin', requestOrigin);
      headers.set('Vary', 'Origin');
      headers.set('Access-Control-Allow-Credentials', 'true');
      headers.set('Access-Control-Allow-Methods', CORS_METHODS);
      headers.set('Access-Control-Allow-Headers', CORS_HEADERS);
      headers.set('Access-Control-Max-Age', '600');
    }
    return new Response(null, { status: 204, headers });
  }

  await next();

  if (originAllowed && requestOrigin) {
    c.res.headers.set('Access-Control-Allow-Origin', requestOrigin);
    c.res.headers.set('Vary', 'Origin');
    c.res.headers.set('Access-Control-Allow-Credentials', 'true');
    c.res.headers.set('Access-Control-Allow-Methods', CORS_METHODS);
    c.res.headers.set('Access-Control-Allow-Headers', CORS_HEADERS);
  }
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  c.res.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
});

// Route modules. Registration order matters: specific admin routes first is not
// required because paths do not overlap, but public /api/settings 404 must not
// shadow /api/admin/settings (it does not: different paths).
app.route('/', adminBookingRoutes);
app.route('/', adminDataRoutes);
app.route('/', adminSettingsRoutes);
app.route('/', adminUserRoutes);
app.route('/', publicRoutes);

// Unknown /api route: same shape as the Express 404 handling.
app.notFound((c) => c.json({ success: false, error: 'Not Found' }, 404));

app.onError((err, c) => {
  console.error('[Edge API] Unhandled error:', err);
  return c.json({ success: false, error: 'Server Error', details: 'An unexpected server error occurred.' }, 500);
});
