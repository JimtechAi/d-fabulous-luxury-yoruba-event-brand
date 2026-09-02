import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { apiUrl } from './db';

export type AdminRole = 'owner' | 'admin' | 'staff' | 'viewer';

export interface AdminProfile {
  id: string;
  email: string | null;
  role: AdminRole | string;
  permissions?: string[];
  is_active?: boolean;
}

export interface CurrentAdminResult {
  session: Session | null;
  profile: AdminProfile | null;
  authorized: boolean;
  error?: 'profile_lookup' | 'profile_missing' | 'unauthorized';
}

export function isAuthorizedAdminRole(role: unknown): role is AdminRole {
  return role === 'owner' || role === 'admin' || role === 'staff' || role === 'viewer';
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentAdmin(currentSession?: Session | null): Promise<CurrentAdminResult> {
  let session: Session | null;

  if (currentSession !== undefined) {
    session = currentSession;
  } else {
    try {
      session = await getCurrentSession();
    } catch {
      return { session: null, profile: null, authorized: false, error: 'profile_lookup' };
    }
  }

  if (!session?.user) {
    return { session: null, profile: null, authorized: false };
  }

  const response = await fetch(apiUrl('/api/admin/session'), {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success || !result.data) {
    return {
      session,
      profile: null,
      authorized: false,
      error: response.status === 404 ? 'profile_missing' : response.status === 401 || response.status === 403 ? 'unauthorized' : 'profile_lookup',
    };
  }

  const profile = result.data as AdminProfile;
  if (!isAuthorizedAdminRole(profile.role)) {
    return { session, profile, authorized: false, error: 'unauthorized' };
  }

  return { session, profile, authorized: true };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function updateAdminFullName(fullName: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
  if (error) throw error;
}

export async function changeAdminPassword(email: string, currentPassword: string, newPassword: string): Promise<void> {
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (signInError) throw signInError;

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}