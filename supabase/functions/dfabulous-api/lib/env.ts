// Environment access for the dfabulous-api Edge Function.
// On the Supabase platform, SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
// are injected automatically. VITE_-prefixed fallbacks support local testing with the
// repository's .env file. Secrets must never be returned to clients.

export function cleanEnv(value: string | undefined | null): string {
  if (!value) return '';
  return value.trim().replace(/^["']|["']$/g, '');
}

export function cleanUrl(value: string | undefined | null): string {
  const cleaned = cleanEnv(value);
  if (!cleaned) return '';
  let url = cleaned;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

function env(name: string): string | undefined {
  return Deno.env.get(name) ?? undefined;
}

/** Reads the 'default' entry from a Supabase injected JSON key dictionary. */
function readKeyDictionary(name: string): string {
  const raw = cleanEnv(env(name));
  if (!raw) return '';
  try {
    const dict = JSON.parse(raw);
    if (dict && typeof dict === 'object') {
      const preferred = typeof dict.default === 'string' ? dict.default : '';
      if (preferred) return preferred;
      const first = Object.values(dict).find((value) => typeof value === 'string');
      return (first as string) || '';
    }
  } catch {
    // Not JSON: treat the raw value as the key itself.
    return raw;
  }
  return '';
}

export const supabaseUrl = cleanUrl(env('SUPABASE_URL') || env('VITE_SUPABASE_URL'));
// Key resolution supports both the current publishable/secret API key system
// (SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS JSON dictionaries injected by
// the platform) and the legacy anon/service_role variables, plus VITE_ fallbacks
// for local testing. Secret keys never leave the server runtime.
export const supabaseAnonKey = cleanEnv(env('SUPABASE_ANON_KEY'))
  || readKeyDictionary('SUPABASE_PUBLISHABLE_KEYS')
  || cleanEnv(env('VITE_SUPABASE_ANON_KEY'));
export const supabaseServiceRoleKey = cleanEnv(env('SUPABASE_SERVICE_ROLE_KEY'))
  || readKeyDictionary('SUPABASE_SECRET_KEYS');

/**
 * Production detection is evaluated on every call (not cached at module load) and errs on the
 * side of "production": ANY hosted-platform signal, or a non-local platform SUPABASE_URL, marks
 * the runtime as production. A missing single variable therefore cannot silently re-enable
 * development-only behaviour. Only the platform-injected SUPABASE_URL is considered here, not the
 * VITE_-prefixed local testing fallbacks.
 */
export function isProductionDeployment(): boolean {
  if (cleanEnv(env('DENO_DEPLOYMENT_ID')) || cleanEnv(env('SB_REGION')) || cleanEnv(env('SB_EXECUTION_ID'))) {
    return true;
  }
  const appEnv = cleanEnv(env('APP_ENV') || env('NODE_ENV')).toLowerCase();
  if (appEnv === 'production' || appEnv === 'prod') return true;

  const platformUrl = cleanEnv(env('SUPABASE_URL'));
  if (platformUrl.startsWith('https://')) {
    return !/^https:\/\/(localhost|127\.0\.0\.1|kong)(?::\d+)?(?:\/|$)/i.test(platformUrl);
  }
  return false;
}

/**
 * Development-only in-memory rate-limit fallback. Hard-disabled in production regardless of
 * configuration: production fails closed (503) when the durable rate-limit RPC is unavailable.
 */
export function rateLimitDevFallbackEnabled(): boolean {
  return !isProductionDeployment() && cleanEnv(env('RATE_LIMIT_DEV_FALLBACK')).toLowerCase() === 'true';
}

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-supabase-project') &&
    supabaseUrl.startsWith('https://')
);

export const isServerDatabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseUrl.startsWith('https://') &&
    !supabaseUrl.includes('your-supabase-project') &&
    supabaseServiceRoleKey
);

export const resendConfigSource = {
  get apiKey() { return cleanEnv(env('RESEND_API_KEY')); },
  get from() { return cleanEnv(env('RESEND_FROM_EMAIL')); },
  get admin() { return cleanEnv(env('RESEND_NOTIFICATION_EMAIL')); },
  get testingModeFlag() { return cleanEnv(env('RESEND_TESTING_MODE')); },
  get testingRecipient() { return cleanEnv(env('RESEND_TESTING_EMAIL')); },
};

// CORS allow-list: identical defaults to the Express backend plus CORS_ALLOWED_ORIGINS.
// CORS is a browser protection only and is never used for authentication or authorization.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://d-fabulous-luxury-yoruba-event-brand.vercel.app',
  'https://d-fabulous-luxury-yoruba-event-brand-295u9mu9y-jim-tech-ai.vercel.app',
  'https://dfabulous.co.uk',
  'https://www.dfabulous.co.uk',
];

export function getAllowedOrigins(): string[] {
  const envOrigins = cleanEnv(env('CORS_ALLOWED_ORIGINS'))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const production = isProductionDeployment();

  return [...DEFAULT_ALLOWED_ORIGINS, ...envOrigins]
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => Boolean(origin) && origin !== '*' && (
      !production || !/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin)
    ));
}
