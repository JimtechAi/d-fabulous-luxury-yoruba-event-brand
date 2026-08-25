import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CreditCard, Search, ShieldCheck } from 'lucide-react';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { AdminBackToDashboard } from '../components/AdminBackToDashboard';
import { useRouter } from '../lib/router';
import { getCurrentAdmin, signOut } from '../lib/auth';
import { CURRENCIES } from '../data/currencies';
import {
  buildBookingPaymentProgress,
  buildPaymentRunningTotals,
  formatAdminDate,
  formatCurrency,
  getAdminBookingCharges,
  getAdminPayments,
  getCurrencyCode,
  getPaymentStatusClass,
  titleCase,
  type BookingChargeRecord,
  type PaymentRecord,
} from '../lib/admin';

type PaymentFilter = 'all' | 'Bank Transfer' | 'Cash' | 'POS' | 'Online Payment' | 'Other';

export const AdminPaymentsShell: React.FC = () => {
  const { navigate } = useRouter();
  const [profile, setProfile] = useState<{ email: string | null; role: string } | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [bookingCharges, setBookingCharges] = useState<BookingChargeRecord[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PaymentFilter>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const verifyAdmin = async () => {
      const result = await getCurrentAdmin();
      if (!active) return;
      if (!result.authorized || !result.profile) {
        navigate('/admin/login');
        return;
      }
      setProfile(result.profile);
    };

    void verifyAdmin();
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!profile) return;

    let active = true;

    const loadPayments = async () => {
      setLoading(true);
      setError('');

      try {
        const [rows, charges] = await Promise.all([getAdminPayments(), getAdminBookingCharges()]);
        if (!active) return;
        setPayments(rows);
        setBookingCharges(charges);
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load payment activity.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPayments();
    return () => {
      active = false;
    };
  }, [profile]);

  const visiblePayments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payments.filter((payment) => {
      const matchFilter = filter === 'all' || (payment.payment_method || 'Other') === filter;
      const matchStatus = statusFilter === 'all' || (payment.status || 'pending') === statusFilter;
      const matchCurrency = currencyFilter === 'all' || getCurrencyCode(payment.currency) === currencyFilter;
      const matchDate = !dateFilter || (payment.paid_at || payment.created_at || '').startsWith(dateFilter);
      const matchSearch = !term || [payment.customer_name, payment.customer_email, payment.gateway_reference, payment.gateway_transaction_id, payment.payment_method, payment.payment_type, payment.provider, payment.booking_id, String(payment.amount)].join(' ').toLowerCase().includes(term);
      return matchFilter && matchStatus && matchCurrency && matchDate && matchSearch;
    });
  }, [currencyFilter, dateFilter, filter, payments, search, statusFilter]);

  const totals = useMemo(() => {
    const totalsByCurrency = visiblePayments.reduce<Record<string, number>>((totals, payment) => {
      const currency = getCurrencyCode(payment.currency);
      totals[currency] = (totals[currency] || 0) + Number(payment.amount || 0);
      return totals;
    }, {});
    const paymentCount = visiblePayments.length;
    return {
      totalsByCurrency,
      paymentCount,
    };
  }, [visiblePayments]);

  const chargeById = useMemo(() => new Map(bookingCharges.map((booking) => [booking.id, booking])), [bookingCharges]);
  const runningPaidByPaymentId = useMemo(() => buildPaymentRunningTotals(payments), [payments]);

  const bookingProgress = useMemo(() => {
    const term = search.trim().toLowerCase();
    return bookingCharges
      .map((booking) => ({ booking, summary: buildBookingPaymentProgress(booking, payments) }))
      .filter(({ summary }) => summary.has_booking_amount || summary.amount_paid > 0)
      .filter(({ booking }) => !term || [booking.full_name, booking.email, booking.id].filter(Boolean).join(' ').toLowerCase().includes(term))
      .filter(({ summary }) => currencyFilter === 'all' || summary.currency === currencyFilter)
      .sort((left, right) => right.summary.balance_due - left.summary.balance_due);
  }, [bookingCharges, currencyFilter, payments, search]);

  const chargeTotals = useMemo(() => bookingProgress.reduce<Record<string, { charged: number; paid: number; balance: number }>>((totals, { summary }) => {
    const bucket = totals[summary.currency] || { charged: 0, paid: 0, balance: 0 };
    bucket.charged += summary.total_amount;
    bucket.paid += summary.amount_paid;
    bucket.balance += summary.balance_due;
    totals[summary.currency] = bucket;
    return totals;
  }, {}), [bookingProgress]);

  const handleLogout = async () => {
    await signOut().catch(() => undefined);
    navigate('/admin/login');
  };

  if (!profile) return null;

  return (
    <main className="min-h-screen bg-ivory-warm text-black-rich">
      <header className="border-b border-gold-luxury/30 bg-burgundy-dark text-ivory-warm">
        <Container className="flex items-center justify-between gap-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold-luxury">Private Administration</p>
            <h1 className="font-display text-3xl">D’Fabulous Admin</h1>
          </div>
          <Button variant="outline-light" size="sm" onClick={handleLogout} icon={<ArrowUpRight className="h-4 w-4" />}>
            LOG OUT
          </Button>
        </Container>
      </header>

      <div className="p-6 lg:p-10">
        <Container className="space-y-6">
          <AdminBackToDashboard />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">Payments</p>
              <h2 className="font-display text-4xl text-burgundy-deep">Payment ledger</h2>
            </div>
            <div className="flex items-center gap-3 rounded-none border border-gold-luxury/20 bg-white p-3 shadow-sm">
              <ShieldCheck className="h-4 w-4 text-gold-luxury" />
              <span className="text-sm text-charcoal-soft capitalize">{profile.role}</span>
            </div>
          </div>

          {error && (
            <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="border border-gold-luxury/20 bg-white p-5 shadow-sm">
              <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Payments tracked</p>
              <p className="mt-4 font-display text-4xl text-burgundy-deep">{totals.paymentCount}</p>
            </div>
            {CURRENCIES.map((currency) => (
              <div key={currency.code} className="border border-gold-luxury/20 bg-white p-5 shadow-sm">
                <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">{currency.code} volume</p>
                <p className="mt-4 font-display text-4xl text-burgundy-deep">{formatCurrency(totals.totalsByCurrency[currency.code] || 0, currency.code)}</p>
              </div>
            ))}
          </div>

          <div className="rounded-none border border-gold-luxury/20 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-dark" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search reference, notes, booking ID..."
                  aria-label="Search payments"
                  className="w-full border border-gold-luxury/20 bg-ivory-warm py-3 pl-10 pr-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury"
                />
              </div>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as PaymentFilter)}
                className="border border-gold-luxury/20 bg-ivory-warm px-3 py-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury"
              >
                <option value="all">All methods</option>
                <option value="Bank Transfer">Bank transfer</option>
                <option value="Cash">Cash</option>
                <option value="POS">POS</option>
                <option value="Online Payment">Online payment</option>
                <option value="Other">Other</option>
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by payment status" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">
                <option value="all">All statuses</option>
                {['pending', 'processing', 'successful', 'failed', 'cancelled', 'refunded', 'partially_refunded'].map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
              </select>
              <select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)} aria-label="Filter by currency" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">
                <option value="all">All currencies</option>
                {CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} - {currency.symbol}</option>)}
              </select>
              <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="Filter by payment date" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" />
            </div>
          </div>

          {loading ? (
            <div className="rounded-none border border-gold-luxury/20 bg-white p-10 text-center text-charcoal-soft/80 shadow-sm">Loading payment ledger...</div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
              <div className="space-y-4">
                <div className="rounded-none border border-gold-luxury/20 bg-white p-4 shadow-sm">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Charged vs collected</p>
                  {Object.keys(chargeTotals).length === 0 ? (
                    <p className="mt-3 text-sm text-charcoal-soft/80">No booking charges recorded yet.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {Object.entries(chargeTotals).map(([currency, totals]) => (
                        <div key={currency} className="border border-gold-luxury/15 bg-ivory-warm p-3">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">{currency}</p>
                          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                            <div>
                              <dt className="text-[9px] uppercase tracking-[0.15em] text-gold-dark">Charged</dt>
                              <dd className="mt-1 text-sm font-medium text-burgundy-deep">{formatCurrency(totals.charged, currency)}</dd>
                            </div>
                            <div>
                              <dt className="text-[9px] uppercase tracking-[0.15em] text-gold-dark">Paid</dt>
                              <dd className="mt-1 text-sm font-medium text-burgundy-deep">{formatCurrency(totals.paid, currency)}</dd>
                            </div>
                            <div>
                              <dt className="text-[9px] uppercase tracking-[0.15em] text-gold-dark">Balance</dt>
                              <dd className="mt-1 text-sm font-medium text-burgundy-deep">{formatCurrency(totals.balance, currency)}</dd>
                            </div>
                          </dl>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-none border border-gold-luxury/20 bg-white shadow-sm">
                  <div className="border-b border-gold-luxury/20 p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Payment progress</p>
                    <p className="mt-1 text-sm text-charcoal-soft">{bookingProgress.length} bookings</p>
                  </div>
                  {bookingProgress.length === 0 ? (
                    <p className="p-4 text-sm text-charcoal-soft/80">No bookings match the current search.</p>
                  ) : (
                    <div className="max-h-[700px] divide-y divide-gold-luxury/10 overflow-auto">
                      {bookingProgress.map(({ booking, summary }) => (
                        <div key={booking.id} className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-burgundy-deep">{booking.full_name || 'Guest booking'}</p>
                              <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-gold-dark">{formatAdminDate(booking.event_date)}</p>
                            </div>
                            <span className={`inline-flex rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${getPaymentStatusClass(summary.payment_status)}`}>
                              {titleCase(summary.payment_status)}
                            </span>
                          </div>
                          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div className="border border-gold-luxury/15 bg-ivory-warm p-2">
                              <dt className="text-[9px] uppercase tracking-[0.15em] text-gold-dark">Amount charged</dt>
                              <dd className="mt-1 text-sm font-medium text-burgundy-deep">{summary.has_booking_amount ? formatCurrency(summary.total_amount, summary.currency) : 'Not set'}</dd>
                            </div>
                            <div className="border border-gold-luxury/15 bg-ivory-warm p-2">
                              <dt className="text-[9px] uppercase tracking-[0.15em] text-gold-dark">Amount paid</dt>
                              <dd className="mt-1 text-sm font-medium text-burgundy-deep">{formatCurrency(summary.amount_paid, summary.currency)}</dd>
                            </div>
                            <div className="border border-gold-luxury/15 bg-ivory-warm p-2">
                              <dt className="text-[9px] uppercase tracking-[0.15em] text-gold-dark">Balance due</dt>
                              <dd className="mt-1 text-sm font-medium text-burgundy-deep">{summary.has_booking_amount ? formatCurrency(summary.balance_due, summary.currency) : '—'}</dd>
                            </div>
                          </dl>
                          <div className="mt-3 h-1.5 w-full bg-gold-luxury/15">
                            <div className="h-1.5 bg-gold-luxury" style={{ width: `${summary.progress}%` }} />
                          </div>
                          <p className="mt-2 text-[10px] uppercase tracking-[0.15em] text-gold-dark">{summary.progress}% collected</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {visiblePayments.length === 0 ? (
                <div className="rounded-none border border-dashed border-gold-luxury/30 bg-white p-10 text-center text-charcoal-soft/80 shadow-sm">No payment entries match the current filters.</div>
              ) : (
                <div className="rounded-none border border-gold-luxury/20 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-ivory-warm text-[10px] uppercase tracking-[0.2em] text-gold-dark">
                    <tr>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Booking ID</th>
                      <th className="px-4 py-3">Paid at</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Currency</th>
                      <th className="px-4 py-3">Amount charged</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Paid to date</th>
                      <th className="px-4 py-3">Balance after</th>
                      <th className="px-4 py-3">Gateway reference</th>
                      <th className="px-4 py-3">Gateway transaction ID</th>
                      <th className="px-4 py-3">Created at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePayments.map((payment) => {
                      const currency = getCurrencyCode(payment.currency, 'NGN');
                      const amount = formatCurrency(payment.amount, currency);
                      const booking = chargeById.get(payment.booking_id);
                      const charged = booking ? Math.max(0, Number(booking.booking_amount ?? 0)) : 0;
                      const paidToDate = runningPaidByPaymentId.get(payment.id) ?? 0;
                      return (
                        <tr key={payment.id} className="border-t border-gold-luxury/10 align-top">
                          <td className="px-4 py-4 text-charcoal-soft">
                            <div className="font-medium text-burgundy-deep">{payment.customer_name || 'Guest booking'}</div>
                            <div className="mt-1 text-xs text-charcoal-soft">{payment.customer_email || 'No email'}</div>
                          </td>
                          <td className="px-4 py-4 text-charcoal-soft">{payment.booking_id}</td>
                          <td className="px-4 py-4 text-charcoal-soft">{formatAdminDate(payment.paid_at)}</td>
                          <td className="px-4 py-4">
                            <span className="inline-flex rounded-none border border-gold-luxury/20 bg-ivory-warm px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-charcoal-soft">
                              {payment.payment_method || 'Other'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-charcoal-soft">{payment.payment_type || '—'}</td>
                          <td className="px-4 py-4 text-charcoal-soft">{payment.provider || '—'}</td>
                          <td className="px-4 py-4 text-charcoal-soft">{payment.status || '—'}</td>
                          <td className="px-4 py-4 text-charcoal-soft">{currency}</td>
                          <td className="px-4 py-4 text-charcoal-soft">{charged > 0 ? formatCurrency(charged, currency) : 'Not set'}</td>
                          <td className="px-4 py-4 font-medium text-burgundy-deep">{amount}</td>
                          <td className="px-4 py-4 text-charcoal-soft">{formatCurrency(paidToDate, currency)}</td>
                          <td className="px-4 py-4 text-charcoal-soft">{charged > 0 ? formatCurrency(Math.max(0, charged - paidToDate), currency) : '—'}</td>
                          <td className="px-4 py-4 text-charcoal-soft">
                            {payment.gateway_reference || '—'}
                          </td>
                          <td className="px-4 py-4 text-charcoal-soft">{payment.gateway_transaction_id || '—'}</td>
                          <td className="px-4 py-4 text-charcoal-soft">{formatAdminDate(payment.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
                </div>
              )}
            </div>
          )}
        </Container>
      </div>
    </main>
  );
};