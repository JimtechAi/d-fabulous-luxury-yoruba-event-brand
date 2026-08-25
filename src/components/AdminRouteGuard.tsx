import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from '../lib/router';
import { AdminProfile, getCurrentAdmin, signOut } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Container } from './Container';

interface AdminRouteGuardProps {
  children: React.ReactNode;
}

const PROD_WARNING_MS = 270 * 1000;
const PROD_TIMEOUT_MS = 300 * 1000;
const WARNING_WINDOW_MS = PROD_WARNING_MS;
const INACTIVITY_TIMEOUT_MS = PROD_TIMEOUT_MS;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'click', 'keydown', 'scroll', 'touchstart', 'touchmove', 'wheel', 'pointerdown', 'pointermove'] as const;

interface AdminIdleMonitorController {
  generation: number;
  active: boolean;
  lastActivity: number;
  warningTimer: number | null;
  timeoutTimer: number | null;
  onWarning: (() => void) | null;
  onTimeout: (() => void) | null;
  listenerCleanup: (() => void) | null;
}

const adminIdleMonitor: AdminIdleMonitorController = {
  generation: 0,
  active: false,
  lastActivity: Date.now(),
  warningTimer: null,
  timeoutTimer: null,
  onWarning: null,
  onTimeout: null,
  listenerCleanup: null,
};

function clearAdminIdleTimers() {
  if (adminIdleMonitor.warningTimer !== null) {
    window.clearTimeout(adminIdleMonitor.warningTimer);
    adminIdleMonitor.warningTimer = null;
  }

  if (adminIdleMonitor.timeoutTimer !== null) {
    window.clearTimeout(adminIdleMonitor.timeoutTimer);
    adminIdleMonitor.timeoutTimer = null;
  }
}

function detachAdminIdleListeners() {
  if (adminIdleMonitor.listenerCleanup) {
    adminIdleMonitor.listenerCleanup();
    adminIdleMonitor.listenerCleanup = null;
  }
}

function scheduleAdminIdleTimers() {
  clearAdminIdleTimers();

  const elapsedMs = Date.now() - adminIdleMonitor.lastActivity;
  const remainingTimeoutMs = Math.max(0, INACTIVITY_TIMEOUT_MS - elapsedMs);

  if (remainingTimeoutMs <= 0) {
    if (adminIdleMonitor.onTimeout) {
      adminIdleMonitor.onTimeout();
    }
    return;
  }

  const remainingWarningMs = Math.max(0, WARNING_WINDOW_MS - elapsedMs);

  if (remainingWarningMs <= 0) {
    if (adminIdleMonitor.onWarning) {
      adminIdleMonitor.onWarning();
    }
  } else {
    adminIdleMonitor.warningTimer = window.setTimeout(() => {
      if (adminIdleMonitor.onWarning) {
        adminIdleMonitor.onWarning();
      }
    }, remainingWarningMs);
  }

  adminIdleMonitor.timeoutTimer = window.setTimeout(() => {
    if (adminIdleMonitor.onTimeout) {
      adminIdleMonitor.onTimeout();
    }
  }, remainingTimeoutMs);
}

function resetAdminIdleMonitor() {
  adminIdleMonitor.lastActivity = Date.now();
  scheduleAdminIdleTimers();
}

function attachAdminIdleListeners(onActivity: () => void) {
  detachAdminIdleListeners();

  const activityHandler = () => {
    adminIdleMonitor.lastActivity = Date.now();
    scheduleAdminIdleTimers();
    onActivity();
  };

  ACTIVITY_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, activityHandler, { passive: true });
  });

  adminIdleMonitor.listenerCleanup = () => {
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.removeEventListener(eventName, activityHandler);
    });
  };
}

const AdminLoading: React.FC = () => (
  <main className="min-h-screen bg-burgundy-dark text-ivory-warm flex items-center justify-center px-6">
    <Container className="text-center">
      <p className="font-display text-2xl text-gold-luxury" role="status">
        Verifying D’Fabulous access...
      </p>
    </Container>
  </main>
);

export const AdminRouteGuard: React.FC<AdminRouteGuardProps> = ({ children }) => {
  const { navigate } = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const isSigningOutRef = useRef(false);
  const monitorGenerationRef = useRef(0);

  const handleAutoLogout = useCallback(async () => {
    if (isSigningOutRef.current) return;
    isSigningOutRef.current = true;
    setShowWarning(false);
    clearAdminIdleTimers();
    detachAdminIdleListeners();

    try {
      await signOut();
    } catch (error) {
      console.error('[D’Fabulous Admin Auth] Supabase sign-out error during inactivity timeout:', error);
    }

    navigate('/admin/login?reason=inactive');
  }, [navigate]);

  const resetInactivityTimer = useCallback(() => {
    if (!profile || isSigningOutRef.current) return;
    setShowWarning(false);
    resetAdminIdleMonitor();
  }, [profile]);

  useEffect(() => {
    let isMounted = true;

    const verifyAccess = async () => {
      const result = await getCurrentAdmin();
      if (!isMounted) return;

      if (!result.authorized || !result.profile) {
        if (result.session) {
          await signOut().catch(() => undefined);
        }
        navigate('/admin/login');
        return;
      }

      setProfile(result.profile);
      setIsChecking(false);
    };

    void verifyAccess();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setIsChecking(false);
        navigate('/admin/login');
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    if (!profile) return;

    monitorGenerationRef.current += 1;
    const generation = monitorGenerationRef.current;
    adminIdleMonitor.generation = generation;
    adminIdleMonitor.active = true;
    adminIdleMonitor.lastActivity = Date.now();
    adminIdleMonitor.onWarning = () => {
      setShowWarning(true);
    };
    adminIdleMonitor.onTimeout = () => {
      void handleAutoLogout();
    };

    attachAdminIdleListeners(() => {
      setShowWarning(false);
      resetAdminIdleMonitor();
    });
    scheduleAdminIdleTimers();

    return () => {
      if (adminIdleMonitor.generation === generation) {
        detachAdminIdleListeners();
        clearAdminIdleTimers();
        adminIdleMonitor.active = false;
      }
    };
  }, [handleAutoLogout, profile, resetInactivityTimer]);

  const handleStaySignedIn = () => {
    resetInactivityTimer();
  };

  if (isChecking || !profile) return <AdminLoading />;

  return (
    <>
      {showWarning && (
        <div className="border-b border-gold-luxury/30 bg-amber-950/40 px-4 py-3 text-sm text-amber-50">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <p>You will be logged out in 30 seconds due to inactivity.</p>
            <button
              type="button"
              onClick={handleStaySignedIn}
              className="border border-gold-luxury/50 bg-transparent px-3 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-gold-luxury transition hover:border-gold-luxury hover:bg-gold-luxury/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury"
            >
              Stay signed in
            </button>
          </div>
        </div>
      )}
      {children}
    </>
  );
};