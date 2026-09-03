import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
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
  const disableWatchers = env.DISABLE_HMR === 'true' || process.platform === 'win32';

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.VITE_APP_URL': JSON.stringify(appUrl),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBaseUrl),
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
