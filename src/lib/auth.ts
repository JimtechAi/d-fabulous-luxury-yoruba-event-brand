import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type AdminRole = 'owner' | 'admin';

export interface AdminProfile {
  id: string;
  email: string | null;
  role: string;
}

export interface CurrentAdminResult {
  session: Session | null;
  profile: AdminProfile | null;
  authorized: boolean;
  error?: 'profile_lookup' | 'profile_missing' | 'unauthorized';
}

export function isAuthorizedAdminRole(role: unknown): role is AdminRole {
  return role === 'owner' || role === 'admin';
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentAdmin(): Promise<CurrentAdminResult> {
  let session: Session | null;

  try {
    session = await getCurrentSession();
  } catch {
    return { session: null, profile: null, authorized: false, error: 'profile_lookup' };
  }

  if (!session?.user) {
    return { session: null, profile: null, authorized: false };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) {
    return { session, profile: null, authorized: false, error: 'profile_lookup' };
  }

  if (!data) {
    return { session, profile: null, authorized: false, error: 'profile_missing' };
  }

  const profile = data as AdminProfile;
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