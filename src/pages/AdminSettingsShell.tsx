import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, LockKeyhole, Save, ShieldCheck } from 'lucide-react';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { AdminBackToDashboard } from '../components/AdminBackToDashboard';
import { useRouter } from '../lib/router';
import { changeAdminPassword, getCurrentAdmin, getCurrentSession, signOut, updateAdminFullName } from '../lib/auth';
import { getAdminSettings, saveAdminSettings, type AdminSettingsValues } from '../lib/admin';

const defaultSettings: AdminSettingsValues = {
  business_name: "D’Fabulous Events",
  business_email: 'fabulousevents@hotmail.com',
  business_phone: '',
  business_whatsapp: '',
  business_address: '',
  business_website: '',
  business_timezone: 'Africa/Lagos',
  notification_new_booking: true,
  notification_new_enquiry: true,
  notification_booking_status: true,
  notification_enquiry_status: true,
};

const notificationOptions = [
  ['notification_new_booking', 'New booking notification', 'Prepare a preference for alerts when a booking request arrives.'],
  ['notification_new_enquiry', 'New enquiry notification', 'Prepare a preference for alerts when a client enquiry arrives.'],
  ['notification_booking_status', 'Booking status change', 'Prepare a preference for booking status change alerts.'],
  ['notification_enquiry_status', 'Enquiry status change', 'Prepare a preference for enquiry status change alerts.'],
] as const;

const inputClass = 'mt-2 w-full border border-gold-luxury/20 bg-ivory-warm px-3 py-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury';

export const AdminSettingsShell: React.FC = () => {
  const { navigate } = useRouter();
  const [profile, setProfile] = useState<{ id: string; email: string | null; role: string } | null>(null);
  const [fullName, setFullName] = useState('');
  const [settings, setSettings] = useState<AdminSettingsValues>(defaultSettings);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const result = await getCurrentAdmin();
      if (!mounted) return;
      if (!result.authorized || !result.profile) { navigate('/admin/login'); return; }
      setProfile(result.profile);
      const session = await getCurrentSession();
      const stored = await getAdminSettings();
      if (!mounted) return;
      setFullName(String(session?.user.user_metadata?.full_name || session?.user.user_metadata?.name || ''));
      setSettings({ ...defaultSettings, ...stored, business_email: stored.business_email || result.profile.email || defaultSettings.business_email });
      setLoading(false);
    };
    void load().catch((loadError: unknown) => {
      if (mounted) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load settings.');
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, [navigate]);

  const showSuccess = (message: string) => { setError(''); setSuccess(message); };
  const showError = (saveError: unknown) => { setSuccess(''); setError(saveError instanceof Error ? saveError.message : 'Unable to save settings.'); };

  const handleAccountSave = async () => {
    if (!fullName.trim()) { setError('Full name is required.'); setSuccess(''); return; }
    setSavingAccount(true);
    try { await updateAdminFullName(fullName.trim()); showSuccess('Account changes saved.'); } catch (saveError) { showError(saveError); } finally { setSavingAccount(false); }
  };

  const handleBusinessSave = async () => {
    setSavingBusiness(true);
    try { await saveAdminSettings(settings); showSuccess('Business and notification settings saved.'); } catch (saveError) { showError(saveError); } finally { setSavingBusiness(false); }
  };

  const handlePasswordSave = async () => {
    if (newPassword.length < 8) { setError('New password must be at least 8 characters.'); setSuccess(''); return; }
    if (newPassword !== confirmPassword) { setError('New password and confirmation do not match.'); setSuccess(''); return; }
    if (!profile?.email) { setError('No administrator email is available for password verification.'); setSuccess(''); return; }
    setSavingPassword(true);
    try { await changeAdminPassword(profile.email, currentPassword, newPassword); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); showSuccess('Password changed successfully.'); } catch (saveError) { showError(saveError); } finally { setSavingPassword(false); }
  };

  const setSetting = (key: string, value: string | boolean) => setSettings((current) => ({ ...current, [key]: value }));
  const toggleValue = (key: string) => Boolean(settings[key]);

  if (!profile || loading) return <main className="min-h-screen bg-ivory-warm px-6 py-24 text-center text-charcoal-soft"><p role="status">Loading settings...</p></main>;

  return (
    <main className="min-h-screen bg-ivory-warm text-black-rich">
      <header className="border-b border-gold-luxury/30 bg-burgundy-dark text-ivory-warm"><Container className="flex items-center justify-between gap-6 py-5"><div><p className="text-[10px] uppercase tracking-[0.3em] text-gold-luxury">Private Administration</p><h1 className="font-display text-3xl">D’Fabulous Admin</h1></div><Button variant="outline-light" size="sm" onClick={async () => { await signOut().catch(() => undefined); navigate('/admin/login'); }} icon={<ArrowUpRight className="h-4 w-4" />}>LOG OUT</Button></Container></header>
      <div className="p-6 lg:p-10"><Container className="space-y-6"><AdminBackToDashboard /><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">Settings</p><h2 className="font-display text-4xl text-burgundy-deep">Admin settings</h2><p className="mt-2 max-w-2xl text-charcoal-soft">Manage your administrator profile and the information used across D’Fabulous.</p></div><div className="flex items-center gap-3 border border-gold-luxury/20 bg-white p-3 shadow-sm"><ShieldCheck className="h-4 w-4 text-gold-luxury" /><span className="text-sm capitalize text-charcoal-soft">{profile.role}</span></div></div>
        {error && <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}
        {success && <div className="flex items-start gap-3 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><p>{success}</p></div>}

        <section className="border border-gold-luxury/20 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-gold-dark" /><div><h3 className="font-display text-2xl text-burgundy-deep">Account</h3><p className="text-sm text-charcoal-soft">Personal administrator information.</p></div></div><div className="mt-6 grid gap-5 md:grid-cols-2"><label className="text-sm text-charcoal-soft">Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} className={inputClass} autoComplete="name" /></label><label className="text-sm text-charcoal-soft">Email address<input value={profile.email || ''} readOnly className={`${inputClass} cursor-not-allowed opacity-70`} /></label><div className="text-sm text-charcoal-soft">Role<p className="mt-2 capitalize text-burgundy-deep">{profile.role}</p></div></div><Button className="mt-6" onClick={() => void handleAccountSave()} disabled={savingAccount} icon={<Save className="h-4 w-4" />}>{savingAccount ? 'SAVING...' : 'SAVE CHANGES'}</Button></section>

        <section className="border border-gold-luxury/20 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><LockKeyhole className="h-5 w-5 text-gold-dark" /><div><h3 className="font-display text-2xl text-burgundy-deep">Security</h3><p className="text-sm text-charcoal-soft">Protect your administrator account with Supabase Auth.</p></div></div><div className="mt-6 grid gap-5 md:grid-cols-3"><label className="text-sm text-charcoal-soft">Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={inputClass} autoComplete="current-password" /></label><label className="text-sm text-charcoal-soft">New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={inputClass} autoComplete="new-password" /></label><label className="text-sm text-charcoal-soft">Confirm new password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} autoComplete="new-password" /></label></div><Button className="mt-6" onClick={() => void handlePasswordSave()} disabled={savingPassword} icon={<LockKeyhole className="h-4 w-4" />}>{savingPassword ? 'CHANGING...' : 'CHANGE PASSWORD'}</Button></section>

        <section className="border border-gold-luxury/20 bg-white p-6 shadow-sm"><h3 className="font-display text-2xl text-burgundy-deep">Business information</h3><p className="mt-1 text-sm text-charcoal-soft">Information used across the D’Fabulous platform.</p><div className="mt-6 grid gap-5 md:grid-cols-2">{([['business_name','Business name'],['business_email','Business email'],['business_phone','Business phone'],['business_whatsapp','WhatsApp'],['business_address','Business address'],['business_website','Website'],['business_timezone','Timezone']] as const).map(([key,label]) => <label key={key} className="text-sm text-charcoal-soft">{label}<input value={String(settings[key] ?? '')} onChange={(event) => setSetting(key, event.target.value)} className={inputClass} /></label>)}</div></section>

        <section className="border border-gold-luxury/20 bg-white p-6 shadow-sm"><h3 className="font-display text-2xl text-burgundy-deep">Notifications</h3><p className="mt-1 text-sm text-charcoal-soft">Choose which administrative events should generate preferences for future integrations.</p><div className="mt-6 divide-y divide-gold-luxury/10">{notificationOptions.map(([key,title,description]) => <label key={key} className="flex cursor-pointer items-center justify-between gap-4 py-4"><span><span className="block text-sm font-medium text-burgundy-deep">{title}</span><span className="mt-1 block text-sm text-charcoal-soft">{description}</span></span><input type="checkbox" checked={toggleValue(key)} onChange={(event) => setSetting(key, event.target.checked)} className="h-5 w-5 accent-burgundy-deep" /></label>)}</div><Button className="mt-6" onClick={() => void handleBusinessSave()} disabled={savingBusiness} icon={<Save className="h-4 w-4" />}>{savingBusiness ? 'SAVING...' : 'SAVE SETTINGS'}</Button></section>

        <section className="border border-gold-luxury/20 bg-white p-6 shadow-sm"><h3 className="font-display text-2xl text-burgundy-deep">Admin access</h3><p className="mt-1 text-sm text-charcoal-soft">Your current permissions are determined by the protected profiles.role authorization model.</p><div className="mt-5 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><strong className="capitalize">{profile.role}</strong><p className="mt-1">This role has access to the protected administration workspace.</p></div></section>
      </Container></div>
    </main>
  );
};
