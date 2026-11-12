// Supabase client factories for the dfabulous-api Edge Function.
// Three access tiers, matching the Express backend exactly:
//   anonClient     - public reads permitted by RLS for anon.
//   serviceClient  - server-only privileged operations (key never leaves the function).
//   userClient     - per-request client carrying the caller's access token so RLS
//                    remains the final authorization backstop for sensitive writes.
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseServiceRoleKey, supabaseUrl } from './env.ts';

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

let anonSingleton: SupabaseClient | null = null;
let serviceSingleton: SupabaseClient | null = null;

export function anonClient(): SupabaseClient {
  if (!anonSingleton) {
    anonSingleton = createClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseAnonKey || 'placeholder-anon-key',
      clientOptions
    );
  }
  return anonSingleton;
}

export function serviceClient(): SupabaseClient {
  if (!serviceSingleton) {
    serviceSingleton = createClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseServiceRoleKey || 'placeholder-service-role-key',
      clientOptions
    );
  }
  return serviceSingleton;
}

export function userClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
