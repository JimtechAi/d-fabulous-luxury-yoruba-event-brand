import React, { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { useRouter } from '../lib/router';
import { getCurrentAdmin, signOut } from '../lib/auth';
import { supabase } from '../lib/supabase';

type LoginState = 'checking' | 'idle' | 'submitting' | 'error' | 'denied' | 'resetting' | 'reset-sent';

export const AdminLoginShell: React.FC = () => {
  const { navigate } = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<LoginState>('checking');
  const [errorMessage, setErrorMessage] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [sessionNotice, setSessionNotice] = useState('');

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('reason');
    if (reason === 'inactive') {
      setSessionNotice('You were signed out after 5 minutes of inactivity for security.');
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkExistingSession = async () => {
      const result = await getCurrentAdmin();
      if (!isMounted) return;

      if (result.authorized) {
        navigate('/admin');
        return;
      }

      if (result.session) {
        await signOut().catch(() => undefined);
        setState('denied');
        setErrorMessage('Access denied. This area is restricted to authorized D’Fabulous administrators.');
        return;
      }
      setState('idle');
    };

    void checkExistingSession();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState('submitting');
    setErrorMessage('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (import.meta.env.DEV) {
        console.error('[D’Fabulous Admin Auth] Supabase sign-in error:', error);
      }
      setState('error');
      setErrorMessage('The email or password could not be verified. Please try again.');
      return;
    }

    const result = await getCurrentAdmin();
    if (!result.authorized) {
      await signOut().catch(() => undefined);
      setState('denied');
      setErrorMessage('Access denied. This area is restricted to authorized D’Fabulous administrators.');
      return;
    }

    navigate('/admin');
  };

  const handlePasswordResetRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState('resetting');
    setErrorMessage('');

    const appUrl = (import.meta.env.VITE_APP_URL || window.location.origin || 'http://localhost:3001').replace(/\/+$/, '');
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${appUrl}/admin/reset-password`,
    });

    if (error) {
      setState('error');
      setErrorMessage('We could not send the password reset email. Please check the address and try again.');
      return;
    }

    setState('reset-sent');
  };

  if (state === 'checking') {
    return (
      <main className="min-h-screen bg-burgundy-dark text-ivory-warm flex items-center justify-center px-6">
        <p className="font-display text-2xl text-gold-luxury" role="status">Checking your D’Fabulous session...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-burgundy-dark text-ivory-warm relative overflow-hidden flex items-center py-16">
      <div className="absolute inset-0 cultural-pattern-subtle opacity-20" aria-hidden="true" />
      <Container className="relative z-10 w-full">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs uppercase tracking-[0.3em] text-gold-luxury mb-4">Private Administration</p>
            <h1 className="font-display text-5xl text-ivory-warm">D’Fabulous Admin</h1>
            <div className="w-16 h-0.5 bg-gold-luxury/70 mx-auto mt-6" />
          </div>

          {sessionNotice && (
            <div role="status" className="mb-6 border border-gold-luxury/40 bg-gold-luxury/10 px-4 py-3 text-sm text-champagne-soft">
              {sessionNotice}
            </div>
          )}

          {state === 'reset-sent' ? (
            <div className="bg-black-rich/35 border border-gold-luxury/30 p-8 sm:p-10 shadow-2xl space-y-6" role="status">
              <h2 className="font-display text-3xl text-ivory-warm">Check your email</h2>
              <p className="text-sm text-champagne-soft/85 leading-relaxed">If an account exists for that address, Supabase has sent a password reset link.</p>
              <Button type="button" variant="outline-light" fullWidth onClick={() => setState('idle')}>RETURN TO SIGN IN</Button>
            </div>
          ) : state === 'resetting' ? (
            <div className="bg-black-rich/35 border border-gold-luxury/30 p-8 sm:p-10 shadow-2xl" role="status">
              <p className="font-display text-2xl text-gold-luxury text-center">Sending reset instructions...</p>
            </div>
          ) : (
          <>
          <form onSubmit={handleSubmit} className="bg-black-rich/35 border border-gold-luxury/30 p-8 sm:p-10 shadow-2xl space-y-6">
            <div className="flex items-start gap-3 border-b border-gold-luxury/20 pb-6">
              <ShieldCheck className="w-6 h-6 text-gold-luxury shrink-0" aria-hidden="true" />
              <p className="text-sm text-champagne-soft/85 leading-relaxed">Sign in with an authorized Supabase administrator account.</p>
            </div>

            {(state === 'error' || state === 'denied') && (
              <div role="alert" className="border border-red-300/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
                {errorMessage}
              </div>
            )}

            <div>
              <label htmlFor="admin-email" className="block text-xs uppercase tracking-widest text-gold-luxury mb-2">Email address</label>
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full bg-ivory-warm text-black-rich px-4 py-3 border border-gold-luxury/30 focus:outline-none focus:ring-2 focus:ring-gold-luxury"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs uppercase tracking-widest text-gold-luxury mb-2">Password</label>
              <div className="relative">
                <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-burgundy-deep" aria-hidden="true" />
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full bg-ivory-warm text-black-rich pl-11 pr-4 py-3 border border-gold-luxury/30 focus:outline-none focus:ring-2 focus:ring-gold-luxury"
                />
              </div>
            </div>

            <Button type="submit" variant="primary" fullWidth disabled={state === 'submitting'} icon={<ArrowRight className="w-4 h-4" />}>
              {state === 'submitting' ? 'VERIFYING ACCESS...' : 'SIGN IN'}
            </Button>
          </form>
          <form onSubmit={handlePasswordResetRequest} className="mt-4 bg-black-rich/25 border border-gold-luxury/20 p-6 space-y-4">
            <h2 className="font-display text-2xl text-ivory-warm">Reset your password</h2>
            <label htmlFor="reset-email" className="block text-xs uppercase tracking-widest text-gold-luxury">Account email</label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={resetEmail}
              onChange={(event) => setResetEmail(event.target.value)}
              className="w-full bg-ivory-warm text-black-rich px-4 py-3 border border-gold-luxury/30 focus:outline-none focus:ring-2 focus:ring-gold-luxury"
            />
            <Button type="submit" variant="outline-light" fullWidth>EMAIL RESET LINK</Button>
          </form>
          </>
          )}
        </div>
      </Container>
    </main>
  );
};