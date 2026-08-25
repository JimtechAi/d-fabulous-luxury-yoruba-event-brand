import React, { FormEvent, useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { useRouter } from '../lib/router';
import { signOut } from '../lib/auth';
import { supabase } from '../lib/supabase';

type ResetState = 'checking' | 'ready' | 'submitting' | 'success' | 'error';

export const AdminResetPasswordShell: React.FC = () => {
  const { navigate } = useRouter();
  const [state, setState] = useState<ResetState>('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    let recoveryDetected = false;

    const subscription = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        recoveryDetected = true;
        setState('ready');
      }
    });

    const checkRecoverySession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!isMounted || recoveryDetected) return;
      if (error || !data.session) {
        setState('error');
        setErrorMessage('This password reset link is invalid or has expired. Request a new link and try again.');
        return;
      }
      setState('ready');
    };

    void checkRecoverySession();
    return () => {
      isMounted = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');

    if (password.length < 8) {
      setState('error');
      setErrorMessage('Your new password must be at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      setState('error');
      setErrorMessage('The passwords do not match.');
      return;
    }

    setState('submitting');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setState('error');
      setErrorMessage('The password could not be updated. Request a new reset link and try again.');
      return;
    }

    setState('success');
    await signOut().catch(() => undefined);
    window.setTimeout(() => navigate('/admin/login'), 900);
  };

  if (state === 'checking') {
    return <main className="min-h-screen bg-burgundy-dark text-ivory-warm flex items-center justify-center px-6"><p className="font-display text-2xl text-gold-luxury" role="status">Verifying reset link...</p></main>;
  }

  return (
    <main className="min-h-screen bg-burgundy-dark text-ivory-warm relative overflow-hidden flex items-center py-16">
      <div className="absolute inset-0 cultural-pattern-subtle opacity-20" aria-hidden="true" />
      <Container className="relative z-10 w-full">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs uppercase tracking-[0.3em] text-gold-luxury mb-4">Private Administration</p>
            <h1 className="font-display text-5xl text-ivory-warm">Set a new password</h1>
            <div className="w-16 h-0.5 bg-gold-luxury/70 mx-auto mt-6" />
          </div>

          <div className="bg-black-rich/35 border border-gold-luxury/30 p-8 sm:p-10 shadow-2xl">
            {state === 'success' ? (
              <p className="text-center text-champagne-soft" role="status">Password updated successfully. Returning to sign in...</p>
            ) : state === 'error' ? (
              <div role="alert" className="space-y-5">
                <p className="border border-red-300/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">{errorMessage}</p>
                <Button type="button" variant="outline-light" fullWidth onClick={() => navigate('/admin/login')}>REQUEST A NEW LINK</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex items-start gap-3 border-b border-gold-luxury/20 pb-6">
                  <ShieldCheck className="w-6 h-6 text-gold-luxury shrink-0" aria-hidden="true" />
                  <p className="text-sm text-champagne-soft/85 leading-relaxed">Choose a new password for your D’Fabulous administrator account.</p>
                </div>
                <div>
                  <label htmlFor="new-password" className="block text-xs uppercase tracking-widest text-gold-luxury mb-2">New password</label>
                  <div className="relative"><LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-burgundy-deep" aria-hidden="true" /><input id="new-password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full bg-ivory-warm text-black-rich pl-11 pr-4 py-3 border border-gold-luxury/30 focus:outline-none focus:ring-2 focus:ring-gold-luxury" /></div>
                </div>
                <div>
                  <label htmlFor="confirm-password" className="block text-xs uppercase tracking-widest text-gold-luxury mb-2">Confirm new password</label>
                  <input id="confirm-password" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full bg-ivory-warm text-black-rich px-4 py-3 border border-gold-luxury/30 focus:outline-none focus:ring-2 focus:ring-gold-luxury" />
                </div>
                <Button type="submit" variant="primary" fullWidth disabled={state === 'submitting'}>{state === 'submitting' ? 'UPDATING PASSWORD...' : 'UPDATE PASSWORD'}</Button>
              </form>
            )}
          </div>
        </div>
      </Container>
    </main>
  );
};