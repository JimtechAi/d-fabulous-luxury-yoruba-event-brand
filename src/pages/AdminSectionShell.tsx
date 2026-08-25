import React, { useEffect, useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { AdminBackToDashboard } from '../components/AdminBackToDashboard';
import { AdminProfile, getCurrentAdmin, signOut } from '../lib/auth';
import { useRouter } from '../lib/router';

interface AdminSectionShellProps {
  section: 'Customers' | 'Services' | 'Settings';
  title: string;
  description: string;
}

export const AdminSectionShell: React.FC<AdminSectionShellProps> = ({ section, title, description }) => {
  const { navigate } = useRouter();
  const [profile, setProfile] = useState<AdminProfile | null>(null);

  useEffect(() => {
    let isMounted = true;

    const verifyAdmin = async () => {
      const result = await getCurrentAdmin();
      if (!isMounted) return;
      if (!result.authorized || !result.profile) {
        navigate('/admin/login');
        return;
      }
      setProfile(result.profile);
    };

    void verifyAdmin();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const handleLogout = async () => {
    await signOut().catch(() => undefined);
    navigate('/admin/login');
  };

  if (!profile) return null;

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
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">{section}</p>
              <h2 className="font-display text-4xl text-burgundy-deep">{title}</h2>
              <p className="mt-2 max-w-2xl text-charcoal-soft">{description}</p>
            </div>
            <div className="flex items-center gap-3 rounded-none border border-gold-luxury/20 bg-white p-3 shadow-sm">
              <ShieldCheck className="w-4 h-4 text-gold-luxury" />
              <span className="text-sm text-charcoal-soft capitalize">{profile.role}</span>
            </div>
          </div>
        </Container>
      </div>
    </main>
  );
};
