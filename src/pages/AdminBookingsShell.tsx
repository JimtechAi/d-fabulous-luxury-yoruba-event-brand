import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  Phone,
  Search,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { AdminBackToDashboard } from '../components/AdminBackToDashboard';
import { useRouter } from '../lib/router';
import { getCurrentAdmin, signOut } from '../lib/auth';
import { CURRENCIES, type CurrencyCode } from '../data/currencies';
import {
  buildWhatsAppUrl,
  buildBookingConfirmationMessage,
  deleteBooking,
  formatAdminDate,
  formatAdminDateTime,
  formatCurrency,
  getAdminBookings,
  getAdminPaymentsForBooking,
  getBookingReferenceValue,
  getBookingPaymentSummary,
  getPaymentStatusClass,
  getStatusClass,
  normalizeNigerianPhoneNumber,
  normalizeStatus,
  parseMoney,
  recordBookingPayment,
  titleCase,
  updateBookingDetails,
  updateBookingStatus,
  type AdminBookingRecord,
  type PaymentRecord,
} from '../lib/admin';

const bookingStatuses = ['pending', 'confirmed', 'deposit paid', 'fully paid', 'completed', 'cancelled'];
const paymentFilters = ['all', 'unpaid', 'part payment', 'fully paid', 'refunded'];
type BookingSort = 'newest' | 'oldest' | 'event-soonest' | 'event-latest';

const quickWhatsAppMessages = [
  'General follow-up',
  'Booking confirmation',
  'Payment reminder',
  'Request additional information',
  'Event follow-up',
  'Custom message',
] as const;

export const AdminBookingsShell: React.FC = () => {
  const { navigate } = useRouter();
  const [profile, setProfile] = useState<{ email: string | null; role: string } | null>(null);
  const [items, setItems] = useState<AdminBookingRecord[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => {
    const requestedStatus = new URLSearchParams(window.location.search).get('status');
    return requestedStatus && bookingStatuses.includes(requestedStatus) ? requestedStatus : 'all';
  });
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [eventDateFilter, setEventDateFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [sort, setSort] = useState<BookingSort>('newest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingAmount, setSavingAmount] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  // Kept separate from `error` so an action message never hides the bookings list.
  const [loadError, setLoadError] = useState('');
  const [success, setSuccess] = useState('');
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [bookingDraft, setBookingDraft] = useState({
    event_date: '',
    event_location: '',
    celebration_details: '',
    estimated_guest_count: '',
  });
  const [paymentDraft, setPaymentDraft] = useState({
    amount: '',
    currency: 'GBP' as CurrencyCode,
    payment_type: 'deposit',
    provider: 'manual',
    status: 'successful',
    payment_method: 'Bank Transfer',
    gateway_reference: '',
    gateway_transaction_id: '',
  });
  const [bookingAmountDraft, setBookingAmountDraft] = useState('');
  const [whatsAppMessage, setWhatsAppMessage] = useState('');
  const [whatsAppTemplate, setWhatsAppTemplate] = useState('General follow-up');

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

  useEffect(() => {
    if (!profile) return;

    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const data = await getAdminBookings();
        if (!isMounted) return;
        setItems(data);
        setSelectedId((current) => current && data.some((item) => item.id === current) ? current : data[0]?.id || null);
      } catch (err: unknown) {
        if (!isMounted) return;
        setLoadError(err instanceof Error ? err.message : 'Unable to load bookings.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadData();
    return () => {
      isMounted = false;
    };
  }, [profile]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const visible = items.filter((item) => {
      const paymentSummary = getBookingPaymentSummary(item, { totals_by_currency: item.payment_totals });
      const matchesStatus = statusFilter === 'all' || (item.status || 'pending').toLowerCase() === statusFilter;
      const matchesDate = !eventDateFilter || item.event_date === eventDateFilter;
      const matchesService = serviceFilter === 'all' || (item.services_requested || []).includes(serviceFilter);
      const matchesPayment = paymentStatusFilter === 'all' || paymentSummary.payment_status === paymentStatusFilter;
      const matchesSearch = !term || [
        item.full_name,
        item.email,
        item.phone,
        item.event_location,
        item.celebration_details,
        item.services_requested,
      ].filter(Boolean).join(' ').toLowerCase().includes(term);
      return matchesStatus && matchesDate && matchesService && matchesPayment && matchesSearch;
    });

    return visible.sort((left, right) => {
      if (sort === 'oldest') return Date.parse(left.created_at || '') - Date.parse(right.created_at || '');
      if (sort === 'event-soonest' || sort === 'event-latest') {
        const leftDate = Date.parse(left.event_date || '9999-12-31');
        const rightDate = Date.parse(right.event_date || '9999-12-31');
        return sort === 'event-soonest' ? leftDate - rightDate : rightDate - leftDate;
      }
      return Date.parse(right.created_at || '') - Date.parse(left.created_at || '');
    });
  }, [eventDateFilter, items, paymentStatusFilter, search, serviceFilter, sort, statusFilter]);

  const serviceOptions = useMemo(() => Array.from(new Set(items.flatMap((item) => item.services_requested || []))).sort(), [items]);

  const selectedItem = filteredItems.find((item) => item.id === selectedId) || filteredItems[0] || null;
  const paymentSummary = useMemo(() => selectedItem ? getBookingPaymentSummary(selectedItem, { totals_by_currency: selectedItem.payment_totals }) : null, [selectedItem]);
  const hasUnsavedBookingAmount = useMemo(() => {
    if (!selectedItem) return false;
    const draft = Number(bookingAmountDraft.trim());
    if (!bookingAmountDraft.trim() || !Number.isFinite(draft)) return false;
    return draft !== parseMoney(selectedItem.booking_amount);
  }, [bookingAmountDraft, selectedItem]);

  useEffect(() => {
    if (!selectedId && filteredItems[0]) setSelectedId(filteredItems[0].id);
  }, [filteredItems, selectedId]);

  useEffect(() => {
    if (!selectedItem) {
      setPaymentHistory([]);
      return;
    }

    let isMounted = true;
    const loadPaymentHistory = async () => {
      try {
        const rows = await getAdminPaymentsForBooking(selectedItem.id);
        if (isMounted) setPaymentHistory(rows);
      } catch {
        if (isMounted) setPaymentHistory([]);
      }
    };

    void loadPaymentHistory();
    return () => {
      isMounted = false;
    };
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem) return;
    setBookingDraft({
      event_date: selectedItem.event_date || '',
      event_location: selectedItem.event_location || '',
      celebration_details: selectedItem.celebration_details || '',
      estimated_guest_count: selectedItem.estimated_guest_count ? String(selectedItem.estimated_guest_count) : '',
    });
    setBookingAmountDraft(parseMoney(selectedItem.booking_amount) > 0 ? String(parseMoney(selectedItem.booking_amount)) : '');
    setPaymentDraft((current) => ({
      ...current,
      amount: '',
      currency: (Object.keys(selectedItem.payment_totals || {})[0] || selectedItem.currency || selectedItem.booking_currency || 'GBP') as CurrencyCode,
      gateway_reference: '',
      gateway_transaction_id: '',
    }));
    setDeleteConfirmation('');
    setWhatsAppTemplate('General follow-up');
    setWhatsAppMessage('Hello ' + (selectedItem.full_name || 'there') + ', this is D\'Fabulous regarding your event planning. Please let us know if there is anything we can help with. Thank you.');
  }, [selectedItem]);

  const handleStatusChange = async (value: string) => {
    if (!selectedItem) return;
    const bookingId = selectedItem.id;
    const previousItems = items;
    setSavingStatus(true);
    setError('');
    setSuccess('');
    try {
      const updatedBooking = await updateBookingStatus(bookingId, value);
      setItems((currentItems) => currentItems.map((item) => item.id === bookingId ? updatedBooking : item));
      setSelectedId(bookingId);
      const updated = await getAdminBookings();
      setItems(updated);
      setSelectedId(bookingId);
      setSuccess(updatedBooking.emailWarning ? `Booking status updated. ${updatedBooking.emailWarning}` : 'Booking status updated.');
    } catch (err: unknown) {
      setItems(previousItems);
      setError(err instanceof Error ? err.message : 'Unable to update booking status.');
    } finally {
      setSavingStatus(false);
    }
  };

  const handleBookingAmountSave = async (): Promise<boolean> => {
    if (!selectedItem) return false;
    const parsedBookingAmount = Number(bookingAmountDraft.trim());
    if (!bookingAmountDraft.trim() || !Number.isFinite(parsedBookingAmount) || parsedBookingAmount <= 0) {
      setError('Enter the total amount charged as a positive number greater than zero.');
      return false;
    }

    setSavingAmount(true);
    setError('');
    setSuccess('');
    try {
      const updated = await updateBookingDetails(selectedItem.id, {
        booking_amount: parsedBookingAmount,
        currency: paymentDraft.currency,
      });
      setItems((current) => current.map((item) => item.id === selectedItem.id ? { ...item, ...updated } : item));
      setBookingAmountDraft(String(parseMoney(updated.booking_amount)));
      setSuccess('Amount charged saved.');
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save the amount charged.');
      return false;
    } finally {
      setSavingAmount(false);
    }
  };

  const handleBookingDetailsSave = async () => {
    if (!selectedItem) return;

    setSavingDetails(true);
    setError('');
    setSuccess('');
    try {
      const updated = await updateBookingDetails(selectedItem.id, {
        event_date: bookingDraft.event_date || null,
        event_location: bookingDraft.event_location || null,
        celebration_details: bookingDraft.celebration_details || null,
        estimated_guest_count: bookingDraft.estimated_guest_count ? Number(bookingDraft.estimated_guest_count) : null,
      });
      setItems((current) => current.map((item) => item.id === selectedItem.id ? { ...item, ...updated } : item));
      setSuccess('Booking details updated.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update booking details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const handlePaymentSubmit = async () => {
    if (!selectedItem) return;
    const amount = Number(paymentDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid payment amount greater than zero.');
      return;
    }

    const paymentStatus = paymentDraft.status.toLowerCase();
    if (paymentStatus !== 'successful' && paymentStatus !== 'pending' && paymentStatus !== 'processing' && paymentStatus !== 'failed' && paymentStatus !== 'cancelled') {
      setError('Unsupported payment status selected.');
      return;
    }

    // The charge must be stored first, otherwise the balance cannot be calculated.
    const draftAmount = Number(bookingAmountDraft.trim());
    if (!Number.isFinite(draftAmount) || draftAmount <= 0) {
      setError('Enter and save the total amount charged before recording a payment.');
      return;
    }
    if (draftAmount !== parseMoney(selectedItem.booking_amount)) {
      const saved = await handleBookingAmountSave();
      if (!saved) return;
    }

    setSavingPayment(true);
    setError('');
    setSuccess('');
    try {
      await recordBookingPayment(selectedItem.id, {
        amount,
        currency: paymentDraft.currency,
        payment_type: paymentDraft.payment_type,
        provider: paymentDraft.provider,
        status: paymentDraft.status,
        payment_method: paymentDraft.payment_method,
        gateway_reference: paymentDraft.gateway_reference || undefined,
        gateway_transaction_id: paymentDraft.gateway_transaction_id || undefined,
      });
      const refreshed = await getAdminBookings();
      setItems(refreshed);
      setSelectedId(selectedItem.id);
      const nextHistory = await getAdminPaymentsForBooking(selectedItem.id);
      setPaymentHistory(nextHistory);
      setPaymentDraft({
        amount: '',
        currency: paymentDraft.currency,
        payment_type: 'deposit',
        provider: 'manual',
        status: 'successful',
        payment_method: 'Bank Transfer',
        gateway_reference: '',
        gateway_transaction_id: '',
      });
      setSuccess('Payment recorded successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to record payment.');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeleteBooking = async () => {
    if (!selectedItem) return;
    if (deleteConfirmation !== 'DELETE BOOKING') {
      setError('Please type DELETE BOOKING to confirm permanent deletion.');
      return;
    }

    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      const deletedId = selectedItem.id;
      await deleteBooking(deletedId);
      // Re-read from the database so the list reflects what was actually removed.
      const refreshed = await getAdminBookings();
      setItems(refreshed);
      setShowDeleteConfirm(false);
      setDeleteConfirmation('');

      if (refreshed.some((item) => item.id === deletedId)) {
        setSelectedId(deletedId);
        setError('The server reported a successful delete, but this booking is still in the database. Do not retry: send this message to your developer.');
        return;
      }

      setSelectedId(refreshed[0]?.id || null);
      setSuccess('Booking permanently deleted.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to permanently delete the booking.');
    } finally {
      setDeleting(false);
    }
  };

  const handleWhatsAppOpen = () => {
    if (!selectedItem) return;
    const normalized = normalizeNigerianPhoneNumber(selectedItem.phone);
    if (!normalized) {
      setError('This client phone number is not valid for WhatsApp messaging.');
      return;
    }
    const url = buildWhatsAppUrl(selectedItem.phone, whatsAppMessage.trim() || undefined);
    if (!url) {
      setError('Unable to create a valid WhatsApp link for this client.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    setSuccess('WhatsApp conversation opened.');
  };

  const handleConfirmationWhatsApp = () => {
    if (!selectedItem || !paymentSummary) return;
    const message = buildBookingConfirmationMessage(selectedItem, paymentSummary);
    setWhatsAppMessage(message);
    setWhatsAppTemplate('Booking confirmation');

    const normalized = normalizeNigerianPhoneNumber(selectedItem.phone);
    if (!normalized) {
      setError('This client phone number is not valid for WhatsApp messaging.');
      return;
    }

    const url = buildWhatsAppUrl(selectedItem.phone, message);
    if (!url) {
      setError('Unable to create a valid WhatsApp link for this client.');
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    setSuccess('Confirmation message sent via WhatsApp.');
  };

  const handleLogout = async () => {
    await signOut().catch(() => undefined);
    navigate('/admin/login');
  };

  const canDeleteBooking = profile?.role === 'owner' || profile?.role === 'admin';

  if (!profile) return null;

  return (
    <main className="min-h-screen bg-ivory-warm text-black-rich">
      <header className="bg-burgundy-dark text-ivory-warm border-b border-gold-luxury/30">
        <Container className="flex items-center justify-between gap-6 py-5">
          <div className="flex items-center gap-4">
            <img src="/assets/brand/logo/dfabulous-logo.png" alt="D’Fabulous official logo" className="h-14 w-auto max-w-[200px] object-contain" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-gold-luxury">Private Administration</p>
              <h1 className="font-display text-3xl">D’Fabulous Admin</h1>
            </div>
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
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">Bookings</p>
              <h2 className="font-display text-4xl text-burgundy-deep">Event booking management</h2>
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

          {success && (
            <div className="flex items-start gap-3 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{success}</p>
            </div>
          )}

          <div className="rounded-none border border-gold-luxury/20 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <div className="relative w-full md:max-w-md xl:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gold-dark" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, email, phone, location..."
                  aria-label="Search bookings"
                  className="w-full border border-gold-luxury/20 bg-ivory-warm py-3 pl-10 pr-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury"
                />
              </div>

              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="border border-gold-luxury/20 bg-ivory-warm px-3 py-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">
                <option value="all">All statuses</option>
                {bookingStatuses.map((status) => (
                  <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                ))}
              </select>
              <select value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value)} className="border border-gold-luxury/20 bg-ivory-warm px-3 py-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">
                <option value="all">All payments</option>
                {paymentFilters.filter((value) => value !== 'all').map((status) => (
                  <option key={status} value={status}>{titleCase(status)}</option>
                ))}
              </select>
              <input type="date" value={eventDateFilter} onChange={(event) => setEventDateFilter(event.target.value)} aria-label="Filter by event date" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" />
              <select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)} aria-label="Filter by service" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">
                <option value="all">All services</option>
                {serviceOptions.map((service) => <option key={service} value={service}>{service}</option>)}
              </select>
              <select value={sort} onChange={(event) => setSort(event.target.value as BookingSort)} aria-label="Sort bookings" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">
                <option value="newest">Newest booking</option>
                <option value="oldest">Oldest booking</option>
                <option value="event-soonest">Event date soonest</option>
                <option value="event-latest">Event date latest</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="rounded-none border border-gold-luxury/20 bg-white p-10 text-center text-charcoal-soft/80 shadow-sm">Loading bookings...</div>
          ) : loadError ? (
            <div className="rounded-none border border-amber-300 bg-amber-50 p-10 text-center text-amber-900 shadow-sm">
              <p className="font-display text-2xl text-burgundy-deep">Bookings are temporarily unavailable.</p>
              <p className="mt-2 text-sm">{loadError}</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-none border border-dashed border-gold-luxury/30 bg-white p-10 text-center text-charcoal-soft/80 shadow-sm">No bookings yet. Client booking requests will appear here when submitted.</div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
              <div className="rounded-none border border-gold-luxury/20 bg-white shadow-sm">
                <div className="border-b border-gold-luxury/20 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Visible records</p>
                  <p className="mt-1 text-sm text-charcoal-soft">{filteredItems.length} bookings</p>
                </div>
                <div className="max-h-[700px] overflow-auto">
                  {filteredItems.map((item) => {
                    const summary = getBookingPaymentSummary(item, { totals_by_currency: item.payment_totals });
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={`block w-full border-b border-gold-luxury/10 p-4 text-left transition-colors ${selectedItem?.id === item.id ? 'bg-ivory-warm' : 'bg-white hover:bg-ivory-warm/70'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-burgundy-deep">{item.full_name || 'Guest booking'}</p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-dark">{getBookingReferenceValue(item.booking_reference)}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.15em] text-gold-dark">{(item.services_requested || ['Custom event'])[0]}</p>
                          </div>
                          <span className={`inline-flex rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${getStatusClass(item.status)}`}>
                            {titleCase(item.status || 'pending')}
                          </span>
                        </div>
                        <p className="mt-3 flex items-center gap-2 text-sm text-charcoal-soft"><MapPin className="h-4 w-4 text-gold-dark" />{item.event_location || 'Location pending'}</p>
                        <p className="mt-2 text-[10px] uppercase tracking-[0.15em] text-gold-dark">{formatAdminDate(item.event_date)}</p>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className={`inline-flex rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${getPaymentStatusClass(summary.payment_status)}`}>
                            {titleCase(summary.payment_status)}
                          </span>
                          <span className="text-[10px] uppercase tracking-[0.15em] text-gold-dark">Bal {formatCurrency(summary.balance_due, summary.currency)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedItem && paymentSummary ? (
                <div className="space-y-6 rounded-none border border-gold-luxury/20 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 border-b border-gold-luxury/20 pb-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Selected booking</p>
                        <h3 className="font-display text-4xl text-burgundy-deep">{selectedItem.full_name || 'Guest booking'}</h3>
                        <p className="mt-2 inline-flex select-all border border-gold-luxury/30 bg-ivory-warm px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-gold-dark" title="Booking reference">Booking reference: {getBookingReferenceValue(selectedItem.booking_reference)}</p>
                      </div>
                      <span className={`inline-flex rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${getStatusClass(selectedItem.status)}`}>
                        {titleCase(selectedItem.status || 'pending')}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <select value={normalizeStatus(selectedItem.status, 'pending')} onChange={(event) => void handleStatusChange(event.target.value)} disabled={savingStatus} className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">
                        {bookingStatuses.map((status) => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}
                      </select>
                      {savingStatus && <LoaderCircle className="h-4 w-4 animate-spin text-gold-dark" aria-label="Saving status" />}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Full name</dt>
                      <dd className="mt-1 text-sm text-charcoal-soft">{selectedItem.full_name || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Email</dt>
                      <dd className="mt-1 text-sm text-charcoal-soft">{selectedItem.email || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Phone</dt>
                      <dd className="mt-1 text-sm text-charcoal-soft">{selectedItem.phone || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Services requested</dt>
                      <dd className="mt-1 text-sm text-charcoal-soft">{selectedItem.services_requested?.join(', ') || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Guests</dt>
                      <dd className="mt-1 text-sm text-charcoal-soft">{selectedItem.estimated_guest_count || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Event date</dt>
                      <dd className="mt-1 flex items-center gap-2 text-sm text-charcoal-soft"><CalendarDays className="h-4 w-4 text-gold-dark" />{formatAdminDate(selectedItem.event_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Location</dt>
                      <dd className="mt-1 text-sm text-charcoal-soft">{selectedItem.event_location || 'Location pending'}</dd>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-gold-luxury/20 pt-5">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Notes</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-charcoal-soft">{selectedItem.celebration_details || 'No notes provided.'}</p>
                  </div>

                  <div className="mt-6 border-t border-gold-luxury/20 pt-5">
                    <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-gold-dark"><Wallet className="h-4 w-4" /> Payment</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="border border-gold-luxury/15 bg-ivory-warm p-3"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Booking amount</p><p className="mt-2 text-xl font-medium text-burgundy-deep">{paymentSummary.has_booking_amount ? formatCurrency(paymentSummary.total_amount, paymentSummary.currency) : 'Not recorded'}</p></div>
                      <div className="border border-gold-luxury/15 bg-ivory-warm p-3"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Amount paid</p><p className="mt-2 text-xl font-medium text-burgundy-deep">{formatCurrency(paymentSummary.amount_paid, paymentSummary.currency)}</p></div>
                      <div className="border border-gold-luxury/15 bg-ivory-warm p-3"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Balance due</p><p className="mt-2 text-xl font-medium text-burgundy-deep">{paymentSummary.has_booking_amount ? formatCurrency(paymentSummary.balance_due, paymentSummary.currency) : 'Unavailable'}</p></div>
                      <div className="border border-gold-luxury/15 bg-ivory-warm p-3"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Payment status</p><span className={`mt-2 inline-flex rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${getPaymentStatusClass(paymentSummary.payment_status)}`}>{titleCase(paymentSummary.payment_status)}</span></div>
                    </div>

                    {paymentSummary.has_booking_amount && (
                      <div className="mt-3">
                        <div className="h-1.5 w-full bg-gold-luxury/15">
                          <div className="h-1.5 bg-gold-luxury" style={{ width: `${Math.min(100, Math.round((paymentSummary.amount_paid / paymentSummary.total_amount) * 100))}%` }} />
                        </div>
                        <p className="mt-2 text-[10px] uppercase tracking-[0.15em] text-gold-dark">{Math.min(100, Math.round((paymentSummary.amount_paid / paymentSummary.total_amount) * 100))}% collected</p>
                      </div>
                    )}

                    <div className="mt-4 grid gap-3 rounded-none border border-gold-luxury/15 bg-white p-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-gold-dark" htmlFor="booking-charge-amount">Total Booking Charge</label>
                        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
                          <input id="booking-charge-amount" type="number" min="0" step="0.01" value={bookingAmountDraft} onChange={(event) => setBookingAmountDraft(event.target.value)} placeholder="10000" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" />
                          <select value={paymentDraft.currency} onChange={(event) => setPaymentDraft((current) => ({ ...current, currency: event.target.value as CurrencyCode }))} aria-label="Booking currency" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">
                            {CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} - {currency.name} - {currency.symbol}</option>)}
                          </select>
                          <Button variant="secondary" onClick={() => void handleBookingAmountSave()} disabled={savingAmount} icon={savingAmount ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}>{savingAmount ? 'Saving...' : 'Save amount charged'}</Button>
                        </div>
                        {hasUnsavedBookingAmount && (
                          <p className="mt-2 text-xs text-amber-800">This amount has not been saved yet. It will be stored automatically when you record the next payment.</p>
                        )}
                      </div>
                      <label className="sr-only" htmlFor="new-payment-amount">New payment amount</label>
                      <input id="new-payment-amount" type="number" min="0" step="0.01" value={paymentDraft.amount} onChange={(event) => setPaymentDraft((current) => ({ ...current, amount: event.target.value }))} placeholder="New payment amount" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" />
                      <select value={paymentDraft.currency} onChange={(event) => setPaymentDraft((current) => ({ ...current, currency: event.target.value as CurrencyCode }))} aria-label="Payment currency" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">
                        {CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} - {currency.name} - {currency.symbol}</option>)}
                      </select>
                      <select value={paymentDraft.payment_type} onChange={(event) => setPaymentDraft((current) => ({ ...current, payment_type: event.target.value }))} aria-label="Payment type" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">
                        <option value="deposit">Deposit</option><option value="balance">Balance</option><option value="full">Full</option><option value="refund">Refund</option>
                      </select>
                      <select value={paymentDraft.provider} onChange={(event) => setPaymentDraft((current) => ({ ...current, provider: event.target.value }))} aria-label="Payment provider" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">
                        <option value="manual">Manual</option><option value="paystack">Paystack</option><option value="flutterwave">Flutterwave</option>
                      </select>
                      <select value={paymentDraft.status} onChange={(event) => setPaymentDraft((current) => ({ ...current, status: event.target.value }))} aria-label="Payment status" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">
                        <option value="successful">Successful</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option>
                      </select>
                      <select value={paymentDraft.payment_method} onChange={(event) => setPaymentDraft((current) => ({ ...current, payment_method: event.target.value }))} className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">
                        <option>Bank Transfer</option>
                        <option>Cash</option>
                        <option>POS</option>
                        <option>Online Payment</option>
                        <option>Other</option>
                      </select>
                      <input value={paymentDraft.gateway_reference} onChange={(event) => setPaymentDraft((current) => ({ ...current, gateway_reference: event.target.value }))} placeholder="Gateway reference" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" />
                      <input value={paymentDraft.gateway_transaction_id} onChange={(event) => setPaymentDraft((current) => ({ ...current, gateway_transaction_id: event.target.value }))} placeholder="Gateway transaction ID" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" />
                    </div>
                    <Button onClick={() => void handlePaymentSubmit()} disabled={savingPayment} icon={savingPayment ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}>{savingPayment ? 'Recording payment...' : 'Record Payment'}</Button>

                    <div className="mt-6 border-t border-gold-luxury/20 pt-5">
                      <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-gold-dark"><MessageSquareText className="h-4 w-4" /> WhatsApp client</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {quickWhatsAppMessages.map((template) => (
                          <button key={template} type="button" onClick={() => { setWhatsAppTemplate(template); const base = template === 'General follow-up' ? `Hello ${selectedItem.full_name || 'there'}, this is D'Fabulous regarding your event planning. Please let us know if there is anything we can help with.` : template === 'Booking confirmation' ? `Hello ${selectedItem.full_name || 'there'}, this is D'Fabulous and we are delighted to confirm your event booking for ${selectedItem.event_date || 'your selected date'}.` : template === 'Payment reminder' ? `Hello ${selectedItem.full_name || 'there'}, this is D'Fabulous regarding your upcoming event on ${selectedItem.event_date || 'your selected date'}. Your current outstanding balance is ${formatCurrency(paymentSummary.balance_due, paymentSummary.currency)}. Please let us know if you need any assistance with your payment.` : template === 'Request additional information' ? `Hello ${selectedItem.full_name || 'there'}, we need a few more details to complete your event planning. Please reply with the information requested and we will guide you through the next steps.` : template === 'Event follow-up' ? `Hello ${selectedItem.full_name || 'there'}, we are looking forward to supporting your event and would love to check in on your final arrangements. Please let us know if there are any updates.` : `Hello ${selectedItem.full_name || 'there'}, this is D'Fabulous. Please let us know how we can help.`; setWhatsAppMessage(base); }} className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-left text-sm text-charcoal-soft hover:border-gold-luxury">{template}</button>
                        ))}
                      </div>
                      <textarea value={whatsAppMessage} onChange={(event) => setWhatsAppMessage(event.target.value)} className="mt-3 min-h-[100px] w-full border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" placeholder="Edit before sending" />
                      <div className="mt-3 flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-gold-dark"><Phone className="h-4 w-4" />{selectedItem.phone ? normalizeNigerianPhoneNumber(selectedItem.phone) || selectedItem.phone : 'No phone number'}</div>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <Button onClick={handleConfirmationWhatsApp} className="mt-0" icon={<MessageSquareText className="h-4 w-4" />}>Send Confirmation via WhatsApp</Button>
                        <Button variant="secondary" onClick={handleWhatsAppOpen} className="mt-0" icon={<MessageSquareText className="h-4 w-4" />}>Open WhatsApp</Button>
                      </div>
                    </div>

                    <div className="mt-6 border-t border-gold-luxury/20 pt-5">
                      <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-gold-dark"><CalendarDays className="h-4 w-4" /> Booking details</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <input type="date" value={bookingDraft.event_date} onChange={(event) => setBookingDraft((current) => ({ ...current, event_date: event.target.value }))} className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" />
                        <input value={bookingDraft.event_location} onChange={(event) => setBookingDraft((current) => ({ ...current, event_location: event.target.value }))} placeholder="Event location" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" />
                        <input value={bookingDraft.estimated_guest_count} onChange={(event) => setBookingDraft((current) => ({ ...current, estimated_guest_count: event.target.value }))} placeholder="Guest count" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" />
                        <textarea value={bookingDraft.celebration_details} onChange={(event) => setBookingDraft((current) => ({ ...current, celebration_details: event.target.value }))} className="md:col-span-2 min-h-[100px] border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" placeholder="Notes" />
                      </div>
                      <div className="mt-3 flex gap-3">
                        <Button onClick={() => void handleBookingDetailsSave()} disabled={savingDetails} icon={savingDetails ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}>{savingDetails ? 'Saving...' : 'Save details'}</Button>
                        {canDeleteBooking && (
                          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)} icon={<Trash2 className="h-4 w-4" />}>Delete booking</Button>
                        )}
                      </div>
                    </div>

                    {showDeleteConfirm && (
                      <div className="mt-6 border border-red-200 bg-red-50 p-4">
                        <p className="text-sm font-medium text-red-900">This action is permanent and cannot be undone.</p>
                        <p className="mt-2 text-sm text-red-800">Type DELETE BOOKING to confirm.</p>
                        <input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="mt-3 w-full border border-red-200 bg-white px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-red-400" placeholder="DELETE BOOKING" />
                        <div className="mt-3 flex gap-3">
                          <Button variant="danger" onClick={() => void handleDeleteBooking()} disabled={deleting} icon={deleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}>{deleting ? 'Deleting...' : 'Confirm delete'}</Button>
                          <Button variant="secondary" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmation(''); }}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {paymentHistory.length > 0 && (
                    <div className="mt-6 border-t border-gold-luxury/20 pt-5">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Payment history</p>
                      <div className="mt-3 space-y-3">
                        {paymentHistory.map((payment) => (
                          <div key={payment.id} className="flex items-center justify-between gap-3 border border-gold-luxury/15 bg-ivory-warm p-3">
                            <div>
                              <p className="text-sm font-medium text-burgundy-deep">{formatCurrency(payment.amount, payment.currency)}</p>
                              <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-gold-dark">{payment.payment_type || 'Payment'} • {payment.provider || 'Manual'} • {formatAdminDate(payment.paid_at || payment.created_at)}</p>
                            </div>
                            <div className="text-right text-xs text-charcoal-soft">
                              <p>{payment.gateway_reference || 'No gateway reference'}</p>
                              <p className="mt-1">{payment.status || 'pending'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </Container>
      </div>
    </main>
  );
};
