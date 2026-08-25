import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CalendarPlus, ShieldCheck, Trash2 } from 'lucide-react';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { AdminBackToDashboard } from '../components/AdminBackToDashboard';
import { useRouter } from '../lib/router';
import { getCurrentAdmin, signOut } from '../lib/auth';
import { createAdminBlockedDate, deleteAdminBlockedDate, getAdminBlockedDates, getAdminBookings, getStatusClass, titleCase, type AdminBlockedDateRecord, type AdminBookingRecord } from '../lib/admin';

export const AdminCalendarShell: React.FC = () => {
  const { navigate } = useRouter();
  const [profile, setProfile] = useState<{ email: string | null; role: string } | null>(null);
  const [items, setItems] = useState<AdminBookingRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Kept separate from `error` so an action message never hides the calendar.
  const [loadError, setLoadError] = useState('');
  const [blockedDates, setBlockedDates] = useState<AdminBlockedDateRecord[]>([]);
  const [blockDate, setBlockDate] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [savingBlock, setSavingBlock] = useState(false);
  const [upcomingOnly] = useState(() => new URLSearchParams(window.location.search).get('filter') === 'upcoming');

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
    return () => { isMounted = false; };
  }, [navigate]);

  useEffect(() => {
    if (!profile) return;

    let isMounted = true;
    const loadData = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [data, blocked] = await Promise.all([getAdminBookings(), getAdminBlockedDates()]);
        if (!isMounted) return;
        setItems(data.filter((item) => item.event_date));
        setBlockedDates(blocked);
      } catch (err: unknown) {
        if (!isMounted) return;
        setLoadError(err instanceof Error ? err.message : 'Unable to load calendar events.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadData();
    return () => { isMounted = false; };
  }, [profile]);

  const upcomingEvents = useMemo(() => {
    return [...items]
      .filter((item) => {
        const status = (item.status || 'pending').trim().toLowerCase();
        if (!item.event_date) return false;
        if (upcomingOnly && status !== 'confirmed') return false;
        return ['pending', 'confirmed'].includes(status);
      })
      .filter((item) => !upcomingOnly || new Date(`${item.event_date}T00:00:00`).getTime() >= new Date(new Date().toDateString()).getTime())
      .sort((a, b) => new Date(a.event_date ?? 0).getTime() - new Date(b.event_date ?? 0).getTime());
  }, [items, upcomingOnly]);

  const selectedEvent = upcomingEvents.find((item) => item.id === selectedId) ?? upcomingEvents[0] ?? null;

  useEffect(() => {
    if (!selectedId && upcomingEvents[0]) setSelectedId(upcomingEvents[0].id);
  }, [selectedId, upcomingEvents]);

  const handleLogout = async () => {
    await signOut().catch(() => undefined);
    navigate('/admin/login');
  };

  const handleBlockDate = async () => {
    if (!blockDate) return;
    if (items.some((item) => item.event_date === blockDate && ['pending', 'confirmed'].includes((item.status || '').toLowerCase()))) {
      setError('This date already has an active booking.');
      return;
    }
    setSavingBlock(true);
    setError('');
    try {
      const created = await createAdminBlockedDate(blockDate, blockReason);
      setBlockedDates((current) => [...current, created].sort((a, b) => a.event_date.localeCompare(b.event_date)));
      setBlockDate('');
      setBlockReason('');
    } catch (blockError: unknown) {
      setError(blockError instanceof Error ? blockError.message : 'Unable to block this date.');
    } finally {
      setSavingBlock(false);
    }
  };

  const handleUnblockDate = async (eventDate: string) => {
    try {
      await deleteAdminBlockedDate(eventDate);
      setBlockedDates((current) => current.filter((item) => item.event_date !== eventDate));
    } catch (unblockError: unknown) {
      setError(unblockError instanceof Error ? unblockError.message : 'Unable to unblock this date.');
    }
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
          <Button variant="outline-light" size="sm" onClick={handleLogout} icon={<ArrowUpRight className="w-4 h-4" />}>
            LOG OUT
          </Button>
        </Container>
      </header>

      <div className="p-6 lg:p-10">
        <Container className="space-y-6">
          <AdminBackToDashboard />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">Calendar</p>
              <h2 className="font-display text-4xl text-burgundy-deep">Upcoming event calendar</h2>
            </div>
            <div className="flex items-center gap-3 rounded-none border border-gold-luxury/20 bg-white p-3 shadow-sm">
              <ShieldCheck className="w-4 h-4 text-gold-luxury" />
              <span className="text-sm text-charcoal-soft capitalize">{profile.role}</span>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <section className="border border-gold-luxury/20 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3"><CalendarPlus className="h-5 w-5 text-gold-dark" /><div><h3 className="font-display text-2xl text-burgundy-deep">Owner blocked dates</h3><p className="text-sm text-charcoal-soft">Reserve dates that are unavailable for business reasons.</p></div></div>
            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1.5fr_auto]">
              <input type="date" value={blockDate} onChange={(event) => setBlockDate(event.target.value)} min={new Date().toISOString().slice(0, 10)} aria-label="Date to block" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-3 text-sm" />
              <input value={blockReason} onChange={(event) => setBlockReason(event.target.value)} placeholder="Reason (optional)" aria-label="Reason for blocked date" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-3 text-sm" />
              <Button onClick={() => void handleBlockDate()} disabled={savingBlock || !blockDate}>{savingBlock ? 'SAVING...' : 'BLOCK DATE'}</Button>
            </div>
            {blockedDates.length > 0 && <div className="mt-5 space-y-2">{blockedDates.map((item) => <div key={item.event_date} className="flex items-center justify-between gap-3 border border-gold-luxury/15 bg-ivory-warm p-3 text-sm"><div><p className="font-medium text-burgundy-deep">{new Date(`${item.event_date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p><p className="text-xs text-charcoal-soft">OWNER BLOCKED{item.note ? ` · ${item.note}` : ''}</p></div><button type="button" onClick={() => void handleUnblockDate(item.event_date)} aria-label={`Unblock ${item.event_date}`} className="p-2 text-burgundy-deep hover:text-red-700"><Trash2 className="h-4 w-4" /></button></div>)}</div>}
          </section>

          {loading ? (
            <div className="rounded-none border border-gold-luxury/20 bg-white p-10 text-center text-charcoal-soft/80 shadow-sm">
              Loading calendar...
            </div>
          ) : loadError ? (
            <div className="rounded-none border border-amber-300 bg-amber-50 p-10 text-center text-amber-900 shadow-sm">
              <p className="font-display text-2xl text-burgundy-deep">Calendar data is temporarily unavailable.</p>
              <p className="mt-2 text-sm">{loadError}</p>
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div className="rounded-none border border-dashed border-gold-luxury/30 bg-white p-10 text-center text-charcoal-soft/80 shadow-sm">
              No upcoming events yet. Confirmed and pending bookings will appear here once they are added to the system.
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="grid gap-4 md:grid-cols-2">
                {upcomingEvents.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`rounded-none border p-5 text-left shadow-sm transition-colors ${
                      selectedEvent?.id === item.id ? 'border-burgundy-deep bg-burgundy-dark text-ivory-warm' : 'border-gold-luxury/20 bg-white text-charcoal-soft hover:border-gold-luxury'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className={`text-[10px] uppercase tracking-[0.2em] ${selectedEvent?.id === item.id ? 'text-gold-luxury' : 'text-gold-dark'}`}>
                          {new Date(item.event_date ?? Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        <h3 className="mt-2 font-display text-3xl">{item.full_name || 'Guest event'}</h3>
                      </div>
                      <span className={`inline-flex rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${getStatusClass(item.status)}`}>
                        {titleCase(item.status || 'pending')}
                      </span>
                    </div>

                    <div className="mt-5 space-y-3 text-sm">
                      <div>
                        <p className={`text-[10px] uppercase tracking-[0.2em] ${selectedEvent?.id === item.id ? 'text-gold-luxury' : 'text-gold-dark'}`}>Event type</p>
                        <p className="mt-1">{(item.services_requested || ['Custom event'])[0]}</p>
                      </div>
                      <div>
                        <p className={`text-[10px] uppercase tracking-[0.2em] ${selectedEvent?.id === item.id ? 'text-gold-luxury' : 'text-gold-dark'}`}>Venue</p>
                        <p className="mt-1">{item.event_location || 'Location pending'}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {selectedEvent && (
                <div className="rounded-none border border-gold-luxury/20 bg-white p-5 shadow-sm">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Selected booking</p>
                  <h3 className="mt-2 font-display text-4xl text-burgundy-deep">{selectedEvent.full_name || 'Guest event'}</h3>
                  <div className="mt-4 flex items-center gap-3">
                    <span className={`inline-flex rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${getStatusClass(selectedEvent.status)}`}>
                      {titleCase(selectedEvent.status || 'pending')}
                    </span>
                  </div>

                  <dl className="mt-6 space-y-4 text-sm text-charcoal-soft">
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Date</dt>
                      <dd className="mt-1">{new Date(selectedEvent.event_date ?? Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Event type</dt>
                      <dd className="mt-1">{(selectedEvent.services_requested || ['Custom event'])[0]}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Venue</dt>
                      <dd className="mt-1">{selectedEvent.event_location || 'Location pending'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Email</dt>
                      <dd className="mt-1">{selectedEvent.email || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Notes</dt>
                      <dd className="mt-1 whitespace-pre-wrap">{selectedEvent.celebration_details || 'No notes provided.'}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          )}
        </Container>
      </div>
    </main>
  );
};
