import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquare,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { AdminProfile, getCurrentAdmin, signOut } from '../lib/auth';
import { useRouter } from '../lib/router';
import { supabase } from '../lib/supabase';

interface DashboardBooking {
  id: string;
  user_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  event_date: string | null;
  event_location: string | null;
  services_requested: string[] | null;
  updated_at: string | null;
  status: string | null;
  created_at: string | null;
}

interface DashboardEnquiry {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  subject: string | null;
  message: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const navItems = [
  { label: 'Dashboard', value: 'dashboard', icon: LayoutDashboard },
  { label: 'Bookings', value: 'bookings', icon: BriefcaseBusiness },
  { label: 'Calendar', value: 'calendar', icon: CalendarDays },
  { label: 'Enquiries', value: 'enquiries', icon: MessageSquare },
  { label: 'Customers', value: 'customers', icon: Users },
  { label: 'Services', value: 'services', icon: Sparkles },
  { label: 'Payments', value: 'payments', icon: CreditCard },
  { label: 'Settings', value: 'settings', icon: Settings },
] as const;

const statusStyles: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border border-amber-200',
  confirmed: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  completed: 'bg-violet-100 text-violet-800 border border-violet-200',
  cancelled: 'bg-red-100 text-red-800 border border-red-200',
  unread: 'bg-blue-100 text-blue-800 border border-blue-200',
  replied: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  default: 'bg-stone-100 text-stone-700 border border-stone-200',
};

function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatStatus(value: string | null | undefined): string {
  const normalized = (value || 'pending').toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getBookingType(item: DashboardBooking): string {
  const services = item.services_requested ?? [];
  return services[0] || 'Custom celebration';
}

const DASHBOARD_LOAD_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), DASHBOARD_LOAD_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export const AdminDashboardShell: React.FC = () => {
  const { navigate } = useRouter();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [bookings, setBookings] = useState<DashboardBooking[]>([]);
  const [enquiries, setEnquiries] = useState<DashboardEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [activePanel, setActivePanel] = useState<'dashboard' | 'bookings' | 'payments' | 'calendar' | 'enquiries' | 'customers' | 'services' | 'settings'>('dashboard');

  const handlePanelNavigation = (panel: typeof activePanel) => {
    setActivePanel(panel);
    if (panel === 'dashboard') {
      navigate('/admin');
      return;
    }
    if (panel === 'bookings') {
      navigate('/admin/bookings');
      return;
    }
    if (panel === 'payments') {
      navigate('/admin/payments');
      return;
    }
    if (panel === 'calendar') {
      navigate('/admin/calendar');
      return;
    }
    if (panel === 'enquiries') {
      navigate('/admin/enquiries');
      return;
    }
    if (panel === 'customers') {
      navigate('/admin/customers');
      return;
    }
    if (panel === 'services') {
      navigate('/admin/services');
      return;
    }
    if (panel === 'settings') {
      navigate('/admin/settings');
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      const result = await getCurrentAdmin();
      if (!isMounted) return;
      if (!result.authorized || !result.profile) {
        navigate('/admin/login');
        return;
      }
      setProfile(result.profile);
    };

    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!profile) return;

    let isMounted = true;

    const loadDashboardData = async () => {
      setLoading(true);
      setErrorMessage('');

      try {
        const [bookingsResult, enquiriesResult] = await withTimeout(
          Promise.all([
            supabase.from('bookings').select('id, user_id, full_name, email, phone, event_date, event_location, services_requested, estimated_guest_count, celebration_details, status, created_at, updated_at').order('created_at', { ascending: false }),
            supabase.from('messages').select('id, full_name, email, phone, subject, message, status, created_at, updated_at').order('created_at', { ascending: false }),
          ]),
          'The dashboard data request timed out. Check the Supabase connection and try again.',
        );

        if (!isMounted) return;

        if (bookingsResult.error || enquiriesResult.error) {
          const bookingError = bookingsResult.error ? bookingsResult.error.message : '';
          const enquiryError = enquiriesResult.error ? enquiriesResult.error.message : '';
          throw new Error(bookingError || enquiryError || 'The dashboard data could not be loaded right now.');
        }

        setBookings((bookingsResult.data || []) as DashboardBooking[]);
        setEnquiries((enquiriesResult.data || []) as DashboardEnquiry[]);
      } catch (error) {
        if (!isMounted) return;
        setErrorMessage(error instanceof Error ? error.message : 'The dashboard data could not be loaded right now.');
        setBookings([]);
        setEnquiries([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, [profile]);

  const handleLogout = async () => {
    await signOut().catch(() => undefined);
    navigate('/admin/login');
  };

  const stats = useMemo(() => {
    const totalBookings = bookings.length;
    const pendingBookings = bookings.filter((booking) => (booking.status || '').trim().toLowerCase() === 'pending').length;
    const confirmedBookings = bookings.filter((booking) => (booking.status || '').trim().toLowerCase() === 'confirmed').length;
    const cancelledBookings = bookings.filter((booking) => (booking.status || '').trim().toLowerCase() === 'cancelled').length;
    const totalEnquiries = enquiries.length;
    const newEnquiries = enquiries.filter((enquiry) => ['new', 'unread'].includes((enquiry.status || '').trim().toLowerCase())).length;
    const upcomingEvents = bookings.filter((booking) => {
      const status = (booking.status || '').trim().toLowerCase();
      if (status !== 'confirmed' || !booking.event_date) return false;
      const eventDate = new Date(`${booking.event_date}T00:00:00`);
      return !Number.isNaN(eventDate.getTime()) && eventDate.getTime() >= Date.now();
    }).length;

    return [
      { label: 'Total Enquiries', value: totalEnquiries, icon: Mail, tone: 'bg-burgundy-dark text-ivory-warm', href: '/admin/enquiries?status=all' },
      { label: 'New Enquiries', value: newEnquiries, icon: MessageSquare, tone: 'bg-blue-100 text-blue-900', href: '/admin/enquiries?status=new' },
      { label: 'Pending Bookings', value: pendingBookings, icon: Clock3, tone: 'bg-amber-100 text-amber-900', href: '/admin/bookings?status=pending' },
      { label: 'Confirmed Bookings', value: confirmedBookings, icon: CheckCircle2, tone: 'bg-emerald-100 text-emerald-900', href: '/admin/bookings?status=confirmed' },
      { label: 'Cancelled Bookings', value: cancelledBookings, icon: XCircle, tone: 'bg-red-100 text-red-900', href: '/admin/bookings?status=cancelled' },
      { label: 'Upcoming Events', value: upcomingEvents, icon: CalendarDays, tone: 'bg-violet-100 text-violet-900', href: '/admin/calendar?filter=upcoming' },
      { label: 'Total Bookings', value: totalBookings, icon: BriefcaseBusiness, tone: 'bg-stone-200 text-stone-900', href: '/admin/bookings?status=all' },
    ];
  }, [bookings, enquiries]);

  const recentActivity = useMemo(() => {
    return [...bookings.map((booking) => ({
      id: booking.id,
      type: 'booking' as const,
      title: booking.full_name || 'Guest booking',
      subtitle: booking.event_location || 'Location pending',
      date: booking.created_at || booking.event_date,
      status: booking.status || 'pending',
    })), ...enquiries.map((enquiry) => ({
      id: enquiry.id,
      type: 'enquiry' as const,
      title: enquiry.full_name || 'Guest enquiry',
      subtitle: enquiry.subject || 'General enquiry',
      date: enquiry.created_at,
      status: enquiry.status || 'new',
    }))]
      .sort((a, b) => new Date(b.date ?? Date.now()).getTime() - new Date(a.date ?? Date.now()).getTime())
      .slice(0, 6);
  }, [bookings, enquiries]);

  if (!profile) {
    return (
      <main className="min-h-screen bg-burgundy-dark text-ivory-warm flex items-center justify-center px-6">
        <Container className="text-center">
          <p className="font-display text-2xl text-gold-luxury" role="status">
            Preparing your dashboard...
          </p>
        </Container>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ivory-warm text-black-rich">
      <header className="bg-burgundy-dark text-ivory-warm border-b border-gold-luxury/30">
        <Container className="flex items-center justify-between gap-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold-luxury">Private Administration</p>
            <h1 className="font-display text-3xl">D’Fabulous Admin</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-[10px] uppercase tracking-[0.25em] text-champagne-soft/75">Signed in as</p>
              <p className="text-sm text-ivory-warm">{profile.email || 'Authenticated user'}</p>
            </div>
            <Button variant="outline-light" size="sm" onClick={handleLogout} icon={<LogOut className="w-4 h-4" />}>
              LOG OUT
            </Button>
          </div>
        </Container>
      </header>

      <div className="lg:flex">
        <aside className="lg:w-72 border-r border-gold-luxury/20 bg-white/80 backdrop-blur-sm">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-burgundy-dark text-ivory-warm p-2">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">Access</p>
                <p className="font-medium text-charcoal-soft capitalize">{profile.role}</p>
              </div>
            </div>

            <nav className="mt-8 space-y-2">
              {navItems.map(({ label, value, icon: Icon }) => {
                const active = activePanel === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      if (value === 'dashboard') {
                        handlePanelNavigation('dashboard');
                        return;
                      }
                      if (value === 'bookings') {
                        handlePanelNavigation('bookings');
                        return;
                      }
                      if (value === 'payments') {
                        handlePanelNavigation('payments');
                        return;
                      }
                      if (value === 'calendar') {
                        handlePanelNavigation('calendar');
                        return;
                      }
                      if (value === 'enquiries') {
                        handlePanelNavigation('enquiries');
                        return;
                      }
                      handlePanelNavigation(value);
                    }}
                    className={`w-full flex items-center justify-between rounded-none border px-4 py-3 text-left transition-colors ${
                      active
                        ? 'border-burgundy-deep bg-burgundy-dark text-ivory-warm'
                        : 'border-transparent bg-transparent text-charcoal-soft hover:border-gold-luxury/30 hover:bg-ivory-warm'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{label}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 opacity-60" />
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <section className="flex-1 p-6 sm:p-8 lg:p-10">
          <div className="mb-8">
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold-dark">Dashboard</p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-display text-4xl sm:text-5xl text-burgundy-deep">Welcome back</h2>
                <p className="mt-2 text-charcoal-soft leading-relaxed max-w-2xl">
                  Monitor D’Fabulous bookings, enquiries, and upcoming luxury event activity from one secure dashboard.
                </p>
              </div>
              <div className="rounded-none border border-gold-luxury/30 bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Role</p>
                <p className="mt-1 text-sm font-medium capitalize text-charcoal-soft">{profile.role}</p>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="mb-8 flex items-start gap-3 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" />
              <p>{errorMessage}</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {stats.map(({ label, value, icon: Icon, tone, href }) => (
              <button
                key={label}
                type="button"
                onClick={() => navigate(href)}
                aria-label={`View ${value} ${label.toLowerCase()}`}
                className="border border-gold-luxury/20 bg-white p-5 text-left shadow-sm transition-colors hover:border-gold-luxury/60 hover:bg-ivory-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury focus-visible:ring-offset-2"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-gold-dark">{label}</p>
                    <p className="mt-4 font-display text-4xl text-burgundy-deep">{value}</p>
                  </div>
                  <div className={`flex h-12 w-12 items-center justify-center ${tone}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <div className="border border-gold-luxury/20 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Recent bookings</p>
                  <h3 className="font-display text-3xl text-burgundy-deep">Latest enquiries</h3>
                </div>
                <button type="button" onClick={() => handlePanelNavigation('bookings')} className="text-xs uppercase tracking-[0.2em] text-burgundy-deep hover:text-gold-luxury">
                  View all
                </button>
              </div>

              {loading ? (
                <p className="text-sm text-charcoal-soft/80">Loading bookings…</p>
              ) : bookings.length === 0 ? (
                <div className="rounded-none border border-dashed border-gold-luxury/30 bg-ivory-warm p-6 text-sm text-charcoal-soft/80">
                  No bookings yet. Once clients begin submitting booking requests, their details will appear here.
                </div>
              ) : (
                <div className="space-y-3">
                  {bookings.slice(0, 5).map((booking) => (
                    <div key={booking.id} className="grid gap-3 border border-gold-luxury/15 bg-ivory-warm p-4 md:grid-cols-[1.25fr_0.9fr_0.8fr_0.7fr]">
                      <div>
                        <p className="font-medium text-burgundy-deep">{booking.full_name || 'Guest booking'}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.15em] text-gold-dark">{getBookingType(booking)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Date</p>
                        <p className="mt-1 text-sm text-charcoal-soft">{formatDate(booking.event_date)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Location</p>
                        <p className="mt-1 text-sm text-charcoal-soft">{booking.event_location || '—'}</p>
                      </div>
                      <div className="flex items-center justify-end">
                        <span className={`inline-flex rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${statusStyles[(booking.status || 'pending').toLowerCase()] || statusStyles.default}`}>
                          {formatStatus(booking.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-gold-luxury/20 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Quick actions</p>
                  <h3 className="font-display text-3xl text-burgundy-deep">Next steps</h3>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { label: 'View all bookings', panel: 'bookings' },
                  { label: 'View calendar', panel: 'calendar' },
                  { label: 'View enquiries', panel: 'enquiries' },
                ].map(({ label, panel }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handlePanelNavigation(panel as typeof activePanel)}
                    className="flex w-full items-center justify-between border border-gold-luxury/20 bg-ivory-warm px-4 py-3 text-left text-sm font-medium text-charcoal-soft transition-colors hover:border-gold-luxury hover:bg-white"
                  >
                    <span>{label}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_1fr]">
            <div className="border border-gold-luxury/20 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Upcoming events</p>
                <h3 className="font-display text-3xl text-burgundy-deep">Next scheduled dates</h3>
              </div>

              {loading ? (
                <p className="text-sm text-charcoal-soft/80">Checking upcoming events…</p>
              ) : bookings.filter((booking) => booking.event_date && ['pending', 'confirmed'].includes((booking.status || 'pending').toLowerCase())).length === 0 ? (
                <div className="rounded-none border border-dashed border-gold-luxury/30 bg-ivory-warm p-6 text-sm text-charcoal-soft/80">
                  No upcoming events yet. Once clients confirm bookings, their event timeline will appear here.
                </div>
              ) : (
                <div className="space-y-3">
                  {bookings
                    .filter((booking) => booking.event_date && ['pending', 'confirmed'].includes((booking.status || 'pending').toLowerCase()))
                    .slice(0, 4)
                    .map((booking) => (
                      <div key={booking.id} className="flex items-start justify-between gap-3 border border-gold-luxury/15 bg-ivory-warm p-4">
                        <div>
                          <p className="font-medium text-burgundy-deep">{booking.full_name || 'Guest booking'}</p>
                          <p className="mt-1 text-sm text-charcoal-soft">{getBookingType(booking)}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.15em] text-gold-dark">{formatDate(booking.event_date)} • {booking.event_location || 'Location pending'}</p>
                        </div>
                        <span className={`inline-flex rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${statusStyles[(booking.status || 'pending').toLowerCase()] || statusStyles.default}`}>
                          {formatStatus(booking.status)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="border border-gold-luxury/20 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Messages</p>
                <h3 className="font-display text-3xl text-burgundy-deep">Recent enquiries</h3>
              </div>

              {loading ? (
                <p className="text-sm text-charcoal-soft/80">Loading enquiries…</p>
              ) : enquiries.length === 0 ? (
                <div className="rounded-none border border-dashed border-gold-luxury/30 bg-ivory-warm p-6 text-sm text-charcoal-soft/80">
                  No enquiries yet. Client messages and questions will appear here once enquiries are received.
                </div>
              ) : (
                <div className="space-y-3">
                  {enquiries.slice(0, 4).map((enquiry) => (
                    <div key={enquiry.id} className="border border-gold-luxury/15 bg-ivory-warm p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-burgundy-deep">{enquiry.full_name || 'Guest enquiry'}</p>
                        <span className={`inline-flex rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${statusStyles[(enquiry.status || 'unread').toLowerCase()] || statusStyles.default}`}>
                          {formatStatus(enquiry.status || 'Unread')}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-charcoal-soft">{enquiry.subject || 'General enquiry'}</p>
                      <div className="mt-3 flex items-center justify-between gap-2 text-xs uppercase tracking-[0.15em] text-gold-dark">
                        <span>{formatDate(enquiry.created_at)}</span>
                        <span>{enquiry.email || 'No email'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};