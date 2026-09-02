import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, LogOut, ShieldCheck, UserPlus, Users, XCircle } from 'lucide-react';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { AdminBackToDashboard } from '../components/AdminBackToDashboard';
import { AdminProfile, getCurrentAdmin, signOut } from '../lib/auth';
import { useRouter } from '../lib/router';
import { supabase } from '../lib/supabase';

const permissionGroups = [
  { key: 'bookings', label: 'Bookings', permissions: ['bookings.view', 'bookings.manage'] },
  { key: 'messages', label: 'Messages', permissions: ['messages.view', 'messages.manage'] },
  { key: 'payments', label: 'Payments', permissions: ['payments.view', 'payments.manage'] },
  { key: 'testimonials', label: 'Testimonials', permissions: ['testimonials.view', 'testimonials.manage'] },
  { key: 'gallery', label: 'Gallery', permissions: ['gallery.view', 'gallery.manage'] },
  { key: 'services', label: 'Services', permissions: ['services.view', 'services.manage'] },
  { key: 'settings', label: 'Settings', permissions: ['settings.view', 'settings.manage'] },
  { key: 'users', label: 'Users', permissions: ['users.view', 'users.manage'] },
  { key: 'diagnostics', label: 'Diagnostics', permissions: ['diagnostics.view'] },
] as const;

const roleOptions = ['owner', 'admin', 'staff', 'viewer'] as const;

const ALL_PERMISSION_KEYS = permissionGroups.flatMap((group) => group.permissions);

function hasPermission(permissions: Set<string>, permission: string): boolean {
  return permissions.has(permission);
}

interface AdminUserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  permissions?: string[];
}

export const AdminUsersShell: React.FC = () => {
  const { navigate } = useRouter();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<(typeof roleOptions)[number]>('staff');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  const permissionSummary = useMemo(() => {
    return ALL_PERMISSION_KEYS.filter((permission) => permissions[permission]).join(', ') || 'No custom permissions';
  }, [permissions]);

  const loadUsers = async (): Promise<void> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      navigate('/admin/login');
      return;
    }

    const response = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      if (response.status === 401 || response.status === 403) {
        navigate('/admin/login');
        return;
      }
      throw new Error(result?.details || 'Unable to load user management data.');
    }

    setUsers((result.data || []) as AdminUserRow[]);
  };

  useEffect(() => {
    let isMounted = true;

    const verifyAccess = async () => {
      const result = await getCurrentAdmin();
      if (!isMounted) return;
      if (!result.authorized || !result.profile) {
        navigate('/admin/login');
        return;
      }

      setProfile(result.profile);
      try {
        await loadUsers();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load team members.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void verifyAccess();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const togglePermission = (permissionKey: string) => {
    setPermissions((current) => ({ ...current, [permissionKey]: !current[permissionKey] }));
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setErrorMessage('Your admin session is no longer valid. Please sign in again.');
      setSaving(false);
      return;
    }

    const selectedPermissions = ALL_PERMISSION_KEYS.filter((permission) => permissions[permission]);

    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email,
        full_name: fullName,
        role,
        permissions: selectedPermissions,
        is_active: true,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      setErrorMessage(result?.details || 'The user could not be created.');
      setSaving(false);
      return;
    }

    setEmail('');
    setFullName('');
    setRole('staff');
    setPermissions({});
    setSuccessMessage('Invitation created successfully.');
    setLoading(true);
    try {
      await loadUsers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh team members.');
    } finally {
      setLoading(false);
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut().catch(() => undefined);
    navigate('/admin/login');
  };

  if (!profile) return null;

  const canManageUsers = hasPermission(new Set(profile.permissions || []), 'users.manage') || profile.role === 'owner';

  return (
    <main className="min-h-screen bg-ivory-warm text-black-rich">
      <header className="bg-burgundy-dark text-ivory-warm border-b border-gold-luxury/30">
        <Container className="flex items-center justify-between gap-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold-luxury">Private Administration</p>
            <h1 className="font-display text-3xl">D’Fabulous Admin</h1>
          </div>
          <Button variant="outline-light" size="sm" onClick={handleLogout} icon={<LogOut className="w-4 h-4" />}>
            LOG OUT
          </Button>
        </Container>
      </header>

      <div className="p-6 lg:p-10">
        <Container className="space-y-6">
          <AdminBackToDashboard />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">Team & Users</p>
              <h2 className="font-display text-4xl text-burgundy-deep">User Management</h2>
              <p className="mt-2 max-w-2xl text-charcoal-soft">Create, review, and manage the internal D’Fabulous team with secure role and permission controls.</p>
            </div>
            <div className="flex items-center gap-3 rounded-none border border-gold-luxury/20 bg-white p-3 shadow-sm">
              <ShieldCheck className="w-4 h-4 text-gold-luxury" />
              <span className="text-sm text-charcoal-soft capitalize">{profile.role}</span>
            </div>
          </div>

          {errorMessage && (
            <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{errorMessage}</div>
          )}

          {successMessage && (
            <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{successMessage}</div>
          )}

          {canManageUsers && (
            <form onSubmit={handleCreateUser} className="space-y-6 border border-gold-luxury/20 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <UserPlus className="h-5 w-5 text-gold-luxury" />
                <h3 className="font-display text-3xl text-burgundy-deep">Create User</h3>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="text-sm text-charcoal-soft">
                  Full name
                  <input value={fullName} onChange={(event) => setFullName(event.target.value)} required className="mt-2 w-full border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" />
                </label>

                <label className="text-sm text-charcoal-soft">
                  Email
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="mt-2 w-full border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" />
                </label>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="text-sm text-charcoal-soft">
                  Role
                  <select value={role} onChange={(event) => setRole(event.target.value as (typeof roleOptions)[number])} className="mt-2 w-full border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">
                    {roleOptions.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>

                <div className="text-sm text-charcoal-soft">
                  Access summary
                  <p className="mt-2 border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-xs text-charcoal-soft/80">{permissionSummary}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">Permissions</h4>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {permissionGroups.map((group) => (
                    <div key={group.key} className="border border-gold-luxury/15 bg-ivory-warm p-4">
                      <p className="text-sm font-medium text-burgundy-deep">{group.label}</p>
                      <div className="mt-3 space-y-2">
                        {group.permissions.map((permission) => (
                          <label key={permission} className="flex items-center gap-2 text-xs text-charcoal-soft uppercase tracking-[0.08em]">
                            <input type="checkbox" checked={Boolean(permissions[permission])} onChange={() => togglePermission(permission)} className="h-4 w-4 border-gold-luxury text-gold-luxury focus:ring-gold-luxury" />
                            {permission.split('.').pop()}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? 'CREATING...' : 'SEND INVITATION'}
                </Button>
              </div>
            </form>
          )}

          <div className="border border-gold-luxury/20 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-gold-luxury" />
              <h3 className="font-display text-3xl text-burgundy-deep">Team Members</h3>
            </div>

            {loading ? (
              <p className="text-sm text-charcoal-soft">Loading team members...</p>
            ) : users.length === 0 ? (
              <div className="border border-dashed border-gold-luxury/30 bg-ivory-warm p-6 text-sm text-charcoal-soft">No team members yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-gold-luxury/20 text-[10px] uppercase tracking-[0.2em] text-gold-dark">
                    <tr>
                      <th className="py-3 pr-4">Name</th>
                      <th className="py-3 pr-4">Email</th>
                      <th className="py-3 pr-4">Role</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">Permissions</th>
                      <th className="py-3 pr-4">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-gold-luxury/10 align-top">
                        <td className="py-3 pr-4 font-medium text-burgundy-deep">{user.full_name || '—'}</td>
                        <td className="py-3 pr-4 text-charcoal-soft">{user.email || '—'}</td>
                        <td className="py-3 pr-4 capitalize text-charcoal-soft">{user.role}</td>
                        <td className="py-3 pr-4">
                          {user.is_active ? (
                            <span className="inline-flex items-center gap-1 border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 border border-stone-200 bg-stone-100 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-stone-700">
                              <XCircle className="h-3 w-3" /> Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-charcoal-soft">{(user.permissions || []).slice(0, 3).join(', ') || '—'}</td>
                        <td className="py-3 pr-4 text-charcoal-soft">{user.created_at ? new Date(user.created_at).toLocaleDateString('en-GB') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Container>
      </div>
    </main>
  );
};
