/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

function cleanEnv(val: string | undefined): string {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '');
}

function cleanUrl(val: string | undefined): string {
  const cleaned = cleanEnv(val);
  if (!cleaned) return '';
  let url = cleaned;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

const rawUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  (typeof process !== 'undefined'
    ? process.env?.VITE_SUPABASE_URL || process.env?.SUPABASE_URL || process.env?.NEXT_PUBLIC_SUPABASE_URL
    : '') ||
  '';

const rawKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  (typeof process !== 'undefined'
    ? process.env?.VITE_SUPABASE_ANON_KEY ||
      process.env?.SUPABASE_ANON_KEY ||
      process.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env?.SUPABASE_PUBLISHABLE_KEY ||
      process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : '') ||
  '';

export const supabaseUrl = cleanUrl(rawUrl);
export const supabaseAnonKey = cleanEnv(rawKey);

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-supabase-project') &&
    supabaseUrl.startsWith('https://')
);

export function getSupabaseDiagnostics() {
  return {
    isConfigured: isSupabaseConfigured,
    url: supabaseUrl ? supabaseUrl : '(empty)',
    urlValid: supabaseUrl.startsWith('https://') && !supabaseUrl.includes('your-supabase-project'),
    hasAnonKey: Boolean(supabaseAnonKey),
    anonKeyLength: supabaseAnonKey ? supabaseAnonKey.length : 0,
    isJWTFormat: supabaseAnonKey.startsWith('ey') || supabaseAnonKey.length > 20,
  };
}

if (!isSupabaseConfigured) {
  console.warn('[Supabase Config Warning]', getSupabaseDiagnostics());
}

// Client-side Supabase instance using strictly public anon key
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);


