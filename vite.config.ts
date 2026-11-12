import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Anything prefixed VITE_ is embedded in the public browser bundle. Fail the build loudly if a
  // server-side secret was accidentally given that prefix.
  const exposedSecretNames = Object.keys(env).filter((name) =>
    name.startsWith('VITE_') && /(SERVICE_ROLE|SECRET|PRIVATE|RESEND|PASSWORD|OIDC|ACCESS_TOKEN)/i.test(name)
  );
  if (exposedSecretNames.length > 0) {
    throw new Error(
      `Refusing to build: ${exposedSecretNames.join(', ')} would be exposed to the browser. ` +
      'Remove the VITE_ prefix and keep server-side secrets in server-only environment variables.'
    );
  }

  const supabaseUrl = (
    env.VITE_SUPABASE_URL ||
    env.SUPABASE_URL ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  const supabaseAnonKey = (
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  const appUrl = (env.VITE_APP_URL || 'http://localhost:3000').trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');
  const apiBaseUrl = (env.VITE_API_BASE_URL || '').trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');
  const siteUrl = (env.VITE_SITE_URL || '').trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');
  const gaMeasurementId = (env.VITE_GA_MEASUREMENT_ID || '').trim().replace(/^['"]|['"]$/g, '');
  const googleSiteVerification = (env.VITE_GOOGLE_SITE_VERIFICATION || '').trim().replace(/^['"]|['"]$/g, '');
  const disableWatchers = env.DISABLE_HMR === 'true' || process.platform === 'win32';

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.VITE_APP_URL': JSON.stringify(appUrl),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBaseUrl),
      'import.meta.env.VITE_SITE_URL': JSON.stringify(siteUrl),
      'import.meta.env.VITE_GA_MEASUREMENT_ID': JSON.stringify(gaMeasurementId),
      'import.meta.env.VITE_GOOGLE_SITE_VERIFICATION': JSON.stringify(googleSiteVerification),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: 'localhost',
      port: 3000,
      strictPort: true,
      // HMR and file watching are disabled on Windows because some media files can lock the watcher
      // and trigger EBUSY errors during dev startup.
      hmr: !disableWatchers,
      watch: disableWatchers ? null : {},
    },
    build: {
      emptyOutDir: true,
    },
  };
});
