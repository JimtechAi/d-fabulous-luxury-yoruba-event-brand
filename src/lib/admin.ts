import { supabase } from './supabase';
import { CURRENCIES, formatMoney, getCurrency, type CurrencyCode } from '../data/currencies';
import { apiUrl } from './db';

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'deposit paid'
  | 'fully paid'
  | 'completed'
  | 'cancelled';

export const SUPPORTED_CURRENCIES = CURRENCIES.map((currency) => currency.code);

export type EnquiryStatus = 'new' | 'contacted' | 'follow-up' | 'converted' | 'closed';
export type PaymentStatus = 'unpaid' | 'part payment' | 'fully paid' | 'refunded';

export interface AdminBookingRecord {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  event_date: string | null;
  event_location: string | null;
  booking_amount?: number | string | null;
  currency?: string | null;
  booking_currency?: string | null;
  services_requested: string[] | null;
  estimated_guest_count: number | null;
  celebration_details: string | null;
  status: string | null;
  payment_totals?: Partial<Record<CurrencyCode, number>>;
  created_at: string | null;
  updated_at: string | null;
}

export interface PaymentRecord {
  id: string;
  booking_id: string;
  amount: number | string | null;
  currency: string | null;
  payment_type: string | null;
  provider: string | null;
  status: string | null;
  gateway_reference: string | null;
  gateway_transaction_id: string | null;
  payment_method: string | null;
  customer_email: string | null;
  metadata: Record<string, unknown> | null;
  paid_at: string | null;
  user_id: string | null;
  customer_name?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BookingChargeRecord {
  id: string;
  full_name: string | null;
  email: string | null;
  event_date: string | null;
  booking_amount: number | string | null;
  status: string | null;
}

export interface BookingPaymentProgress {
  booking_id: string;
  currency: CurrencyCode;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  payment_status: PaymentStatus;
  has_booking_amount: boolean;
  progress: number;
}

export interface AdminEnquiryRecord {
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

export interface AdminServiceRecord {
  id: string;
  slug: string;
  title: string;
  yoruba_name: string | null;
  short_description: string;
  full_description: string | null;
  category: string | null;
  icon_name: string | null;
  is_active: boolean;
  display_order: number;
}

export interface AdminBlockedDateRecord {
  id?: string | null;
  event_date: string;
  note: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type AdminSettingsValues = Record<string, string | boolean>;

export function getCurrencyCode(value: string | null | undefined, fallback: CurrencyCode = 'GBP'): CurrencyCode {
  return getCurrency(value, fallback).code;
}

export function getBookingCurrency(booking: Partial<AdminBookingRecord> | null | undefined, fallback: CurrencyCode = 'GBP', paymentOverrides?: { currency?: string | null; totals_by_currency?: Partial<Record<CurrencyCode, number>> }): CurrencyCode {
  const rawCurrency = (booking as Record<string, unknown> | null | undefined)?.currency
    ?? (booking as Record<string, unknown> | null | undefined)?.booking_currency
    ?? (booking as Record<string, unknown> | null | undefined)?.currency_code
    ?? (booking as Record<string, unknown> | null | undefined)?.payment_currency
    ?? paymentOverrides?.currency
    ?? Object.keys(paymentOverrides?.totals_by_currency || {})[0]
    ?? fallback;
  return getCurrencyCode(typeof rawCurrency === 'string' ? rawCurrency : String(rawCurrency || fallback), fallback);
}

function formatAdminDataError(error: { message?: string; code?: string; details?: string; hint?: string } | Error): Error {
  const source = error instanceof Error ? error : new Error(error.message || 'Supabase returned an unknown bookings error.');
  const metadata = error instanceof Error ? '' : [error.code, error.details, error.hint].filter(Boolean).join(' | ');
  const suffix = metadata ? ` (${metadata})` : '';
  return new Error(`${source.message}${suffix}`, { cause: error });
}

function isMissingTableError(error: { message?: string; code?: string }): boolean {
  const message = error.message || '';
  return Boolean(error.code === '42703' || error.code === '42P01' || message.toLowerCase().includes('does not exist') || message.toLowerCase().includes('payments'));
}

export function parseMoney(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.\-]/g, '').trim();
    if (!cleaned) return 0;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function formatCurrency(value: number | string | null | undefined, overrideCurrency?: string | null): string {
  return formatMoney(parseMoney(value), overrideCurrency);
}

export function normalizeNigerianPhoneNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  const normalized = digits.startsWith('234') ? digits : digits.startsWith('0') ? `234${digits.slice(1)}` : digits.length >= 10 ? `234${digits}` : null;
  return normalized ? `+${normalized}` : null;
}

export function buildWhatsAppUrl(phone: string | null | undefined, message?: string): string | null {
  const normalized = normalizeNigerianPhoneNumber(phone);
  if (!normalized) return null;
  const cleanPhone = normalized.replace(/^\+/, '');
  const finalMessage = message?.trim() ? `?text=${encodeURIComponent(message.trim())}` : '';
  return `https://wa.me/${cleanPhone}${finalMessage}`;
}

export function derivePaymentStatus(totalAmount: number | string | null | undefined, amountPaid: number | string | null | undefined, explicitStatus?: string | null): PaymentStatus {
  const total = Math.max(0, parseMoney(totalAmount));
  const paid = Math.max(0, parseMoney(amountPaid));
  const normalizedStatus = (explicitStatus || '').trim().toLowerCase();
  if (normalizedStatus === 'refunded') return 'refunded';
  if (paid <= 0) return 'unpaid';
  if (total > 0 && paid >= total) return 'fully paid';
  if (paid > 0 && total > 0 && paid < total) return 'part payment';
  if (paid > 0) return 'part payment';
  return 'unpaid';
}

export function getBookingPaymentSummary(booking: Partial<AdminBookingRecord> | null | undefined, paymentOverrides?: { amount_paid?: number | string | null; payment_status?: string | null; currency?: string | null; totals_by_currency?: Partial<Record<CurrencyCode, number>> }): {
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  payment_status: PaymentStatus;
  currency: CurrencyCode;
  has_booking_amount: boolean;
} {
  const currency = getBookingCurrency(booking, 'GBP', paymentOverrides);
  const rawBookingAmount = (booking as { booking_amount?: number | string | null }).booking_amount;
  const totalAmount = Math.max(0, parseMoney(rawBookingAmount ?? 0));
  const amountPaid = Math.max(0, parseMoney(paymentOverrides?.amount_paid ?? paymentOverrides?.totals_by_currency?.[currency] ?? 0));
  const balanceDue = Math.max(0, totalAmount - amountPaid);
  const paymentStatus = derivePaymentStatus(totalAmount, amountPaid, paymentOverrides?.payment_status);
  if (import.meta.env.DEV) {
    console.info('[D’Fabulous Admin] Booking payment summary:', {
      bookingId: (booking as { id?: string | null } | null | undefined)?.id,
      bookingAmount: totalAmount,
      amountPaid,
      balanceDue,
      paymentStatus,
    });
  }

  return {
    total_amount: totalAmount,
    amount_paid: amountPaid,
    balance_due: balanceDue,
    payment_status: paymentStatus,
    currency,
    has_booking_amount: totalAmount > 0,
  };
}

/** Successful entries count toward the paid total; refunds reduce it. */
export function getSignedPaymentAmount(payment: { amount?: number | string | null; status?: string | null; payment_type?: string | null } | null | undefined): number {
  if (!payment) return 0;
  if ((payment.status || '').toLowerCase() !== 'successful') return 0;
  const amount = parseMoney(payment.amount);
  return (payment.payment_type || '').toLowerCase() === 'refund' ? -amount : amount;
}

export function sortPaymentsChronologically<T extends { paid_at?: string | null; created_at?: string | null }>(payments: T[]): T[] {
  return [...payments].sort((left, right) => {
    const leftTime = Date.parse(left.paid_at || left.created_at || '') || 0;
    const rightTime = Date.parse(right.paid_at || right.created_at || '') || 0;
    return leftTime - rightTime;
  });
}

/**
 * Replays the ledger in chronological order so each payment exposes the running amount paid
 * and the balance outstanding against the booking charge at that point in time.
 */
export function buildPaymentRunningTotals(payments: PaymentRecord[]): Map<string, number> {
  const running = new Map<string, number>();
  const cumulativeByBookingCurrency = new Map<string, number>();

  sortPaymentsChronologically(payments).forEach((payment) => {
    const key = `${payment.booking_id}|${getCurrencyCode(payment.currency)}`;
    const next = (cumulativeByBookingCurrency.get(key) || 0) + getSignedPaymentAmount(payment);
    cumulativeByBookingCurrency.set(key, next);
    running.set(payment.id, Math.max(0, next));
  });

  return running;
}

export function buildBookingPaymentProgress(booking: BookingChargeRecord | AdminBookingRecord, payments: PaymentRecord[]): BookingPaymentProgress {
  const bookingPayments = payments.filter((payment) => payment.booking_id === booking.id);
  const currency = getBookingCurrency(booking as Partial<AdminBookingRecord>, 'GBP', { currency: bookingPayments[0]?.currency });
  const totalAmount = Math.max(0, parseMoney(booking.booking_amount));
  const amountPaid = Math.max(0, bookingPayments
    .filter((payment) => getCurrencyCode(payment.currency) === currency)
    .reduce((total, payment) => total + getSignedPaymentAmount(payment), 0));
  const balanceDue = Math.max(0, totalAmount - amountPaid);

  return {
    booking_id: booking.id,
    currency,
    total_amount: totalAmount,
    amount_paid: amountPaid,
    balance_due: balanceDue,
    payment_status: derivePaymentStatus(totalAmount, amountPaid),
    has_booking_amount: totalAmount > 0,
    progress: totalAmount > 0 ? Math.min(100, Math.round((amountPaid / totalAmount) * 100)) : 0,
  };
}

export function getPaymentStatusClass(status: string | null | undefined): string {
  const normalized = (status || 'unpaid').toLowerCase();
  const map: Record<string, string> = {
    unpaid: 'bg-stone-100 text-stone-700 border border-stone-200',
    'part payment': 'bg-amber-100 text-amber-800 border border-amber-200',
    'fully paid': 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    refunded: 'bg-rose-100 text-rose-800 border border-rose-200',
  };
  return map[normalized] || 'bg-stone-100 text-stone-700 border border-stone-200';
}

export async function getAdminBookings(): Promise<AdminBookingRecord[]> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) {
    throw new Error('No authenticated Supabase session is available for the bookings query.');
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('id, full_name, email, phone, event_date, event_location, booking_amount, services_requested, estimated_guest_count, celebration_details, status, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw formatAdminDataError(error);
  const bookings = (data ?? []) as AdminBookingRecord[];
  let paymentTotals: Record<string, Partial<Record<CurrencyCode, number>>> = {};
  try {
    paymentTotals = await getAdminPaymentsForBookings(bookings.map((booking) => booking.id));
  } catch (paymentError) {
    if (import.meta.env.DEV) console.error('[D’Fabulous Admin] Payment totals unavailable while loading bookings:', paymentError);
  }
  return bookings.map((booking) => ({ ...booking, payment_totals: paymentTotals[booking.id] || {} }));
}

export async function getAdminPaymentsForBooking(bookingId: string): Promise<PaymentRecord[]> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) {
    throw new Error('No authenticated Supabase session is available for the payment history query.');
  }

  const { data, error } = await supabase
    .from('payments')
    .select('id, booking_id, user_id, amount, currency, payment_type, provider, status, gateway_reference, gateway_transaction_id, payment_method, customer_email, metadata, paid_at, created_at, updated_at')
    .eq('booking_id', bookingId)
    // Newest first; id breaks ties so identical timestamps stay deterministic.
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) {
    if (isMissingTableError(error)) return [];
    throw formatAdminDataError(error);
  }
  return (data ?? []) as PaymentRecord[];
}

export async function getAdminPayments(): Promise<PaymentRecord[]> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) {
    throw new Error('No authenticated Supabase session is available for the payments query.');
  }

  const { data, error } = await supabase
    .from('payments')
    .select('id, booking_id, user_id, amount, currency, payment_type, provider, status, gateway_reference, gateway_transaction_id, payment_method, customer_email, metadata, paid_at, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingTableError(error)) return [];
    throw formatAdminDataError(error);
  }

  const paymentRows = (data ?? []) as PaymentRecord[];
  const bookingIds = Array.from(new Set(paymentRows.map((payment) => payment.booking_id).filter(Boolean)));
  if (!bookingIds.length) return paymentRows;

  const { data: bookings, error: bookingError } = await supabase
    .from('bookings')
    .select('id, full_name, email')
    .in('id', bookingIds);
  if (bookingError) return paymentRows;

  const customers = new Map((bookings ?? []).map((booking: { id: string; full_name: string | null; email: string | null }) => [booking.id, `${booking.full_name || 'Guest booking'}|${booking.email || ''}`]));
  return paymentRows.map((payment) => ({
    ...payment,
    customer_name: customers.get(payment.booking_id)?.split('|')[0] || null,
    customer_email: payment.customer_email || customers.get(payment.booking_id)?.split('|')[1] || null,
  }));
}

export async function getAdminPaymentsForBookings(bookingIds: string[]): Promise<Record<string, Partial<Record<CurrencyCode, number>>>> {
  if (!bookingIds.length) return {};
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) {
    throw new Error('No authenticated Supabase session is available for payment history queries.');
  }

  const { data, error } = await supabase
    .from('payments')
    .select('booking_id, amount, currency, status, payment_type')
    .in('booking_id', bookingIds);

  if (error) {
    if (isMissingTableError(error)) return {};
    throw formatAdminDataError(error);
  }

  const totals: Record<string, Partial<Record<CurrencyCode, number>>> = {};
  (data ?? []).forEach((row: { booking_id?: string; amount?: number | string | null; currency?: string | null; status?: string | null; payment_type?: string | null }) => {
    if (!row.booking_id) return;
    const currency = getCurrencyCode(row.currency);
    const amount = getSignedPaymentAmount(row);
    if (!amount) return;
    totals[row.booking_id] = totals[row.booking_id] || {};
    totals[row.booking_id][currency] = Math.max(0, (totals[row.booking_id][currency] || 0) + amount);
  });
  return totals;
}

export async function getAdminBookingCharges(): Promise<BookingChargeRecord[]> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) {
    throw new Error('No authenticated Supabase session is available for the booking charges query.');
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('id, full_name, email, event_date, booking_amount, status')
    .order('created_at', { ascending: false });

  if (error) throw formatAdminDataError(error);
  return (data ?? []) as BookingChargeRecord[];
}

export async function getAdminEnquiries(): Promise<AdminEnquiryRecord[]> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) {
    throw new Error('No authenticated Supabase session is available for the enquiries query.');
  }

  const { data, error } = await supabase
    .from('messages')
    .select('id, full_name, email, phone, subject, message, status, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw formatAdminDataError(error);
  return (data ?? []) as AdminEnquiryRecord[];
}

export async function getAdminServices(): Promise<AdminServiceRecord[]> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) {
    throw new Error('No authenticated Supabase session is available for the services query.');
  }

  const diagnosticsEnabled = import.meta.env.DEV;
  if (diagnosticsEnabled) {
    console.groupCollapsed('[D’Fabulous Admin] services query diagnostics');
    console.log('table:', 'public.services');
    console.log('authenticated user ID:', sessionData.session.user.id);
    console.log('columns:', 'id, slug, title, yoruba_name, short_description, full_description, category, icon_name, is_active, display_order');
    console.log('filters:', { category: 'none in Supabase query', is_active: 'none in admin query' });
  }

  const { data, error } = await supabase
    .from('services')
    .select('id, slug, title, yoruba_name, short_description, full_description, category, icon_name, is_active, display_order')
    .order('display_order', { ascending: true });

  if (diagnosticsEnabled) {
    console.log('supabase returned data:', data);
    console.log('supabase returned error:', error);
    console.log('row count:', data?.length ?? 0);
    console.groupEnd();
  }
  if (error) throw formatAdminDataError(error);
  return (data ?? []) as AdminServiceRecord[];
}

export async function getAdminSettings(): Promise<AdminSettingsValues> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) throw new Error('No authenticated Supabase session is available for settings.');

  const { data, error } = await supabase.from('site_settings').select('key, value');
  if (error) throw formatAdminDataError(error);

  const settings: AdminSettingsValues = {};
  (data || []).forEach((row: { key: string; value: unknown }) => {
    if (typeof row.value === 'boolean' || typeof row.value === 'string') settings[row.key] = row.value;
  });
  return settings;
}

type BlockedDateRow = Record<string, unknown>;

function mapBlockedDateRow(row: BlockedDateRow): AdminBlockedDateRecord {
  return {
    id: typeof row.id === 'string' ? row.id : null,
    event_date: typeof row.event_date === 'string' ? row.event_date : String(row.event_date ?? ''),
    note: typeof row.note === 'string' ? row.note : null,
    created_by: typeof row.created_by === 'string' ? row.created_by : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

export async function getAdminBlockedDates(): Promise<AdminBlockedDateRecord[]> {
  const { data, error } = await supabase.from('blocked_dates').select('*').order('event_date', { ascending: true });
  if (error) throw formatAdminDataError(error);
  return ((data || []) as BlockedDateRow[]).map(mapBlockedDateRow);
}

export async function createAdminBlockedDate(blockedDate: string, reason: string): Promise<AdminBlockedDateRecord> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) throw new Error('Your Supabase session has expired. Please sign in again before blocking a date.');

  const { data, error } = await supabase
    .from('blocked_dates')
    .insert({ event_date: blockedDate, note: reason.trim() || null, created_by: sessionData.session.user.id })
    .select('*')
    .single();

  if (error) throw formatAdminDataError(error);
  return mapBlockedDateRow((data || {}) as BlockedDateRow);
}

export async function deleteAdminBlockedDate(eventDate: string): Promise<void> {
  const { error } = await supabase.from('blocked_dates').delete().eq('event_date', eventDate);
  if (error) throw formatAdminDataError(error);
}

export async function saveAdminSettings(values: AdminSettingsValues): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) throw new Error('Your Supabase session has expired. Please sign in again.');

  const keys = Object.keys(values);
  const { data: existing, error: readError } = await supabase.from('site_settings').select('key').in('key', keys);
  if (readError) throw formatAdminDataError(readError);
  const existingKeys = new Set((existing || []).map((row: { key: string }) => row.key));

  for (const key of keys) {
    const mutation = existingKeys.has(key)
      ? supabase.from('site_settings').update({ value: values[key] }).eq('key', key)
      : supabase.from('site_settings').insert({ key, value: values[key] });
    const { error } = await mutation;
    if (error) throw formatAdminDataError(error);
  }
}

export async function updateBookingStatus(id: string, status: string): Promise<AdminBookingRecord & { emailWarning?: string }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) {
    throw new Error('Your Supabase session has expired. Please sign in again before updating a booking.');
  }

  const response = await fetch(apiUrl(`/api/bookings/${encodeURIComponent(id)}/status`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify({ status }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(result?.details || result?.error || 'Unable to update booking status.');
  }
  return { ...(result.data as AdminBookingRecord), emailWarning: result.emailWarning };
}

export async function updateBookingDetails(id: string, updates: Partial<Pick<AdminBookingRecord, 'event_date' | 'event_location' | 'celebration_details' | 'estimated_guest_count' | 'booking_amount'>> & { currency?: CurrencyCode }): Promise<AdminBookingRecord> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) {
    throw new Error('Your Supabase session has expired. Please sign in again before updating booking details.');
  }

  // Only send the keys the caller supplied so a charge-only save cannot clear the other fields.
  const payload = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));

  const response = await fetch(apiUrl(`/api/bookings/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(result?.details || result?.error || 'Unable to update the booking details.');
  }

  const updated = result.data as AdminBookingRecord;
  if (updates.booking_amount !== undefined && parseMoney(updated.booking_amount) !== parseMoney(updates.booking_amount)) {
    throw new Error(`The amount charged was not stored for booking ID ${id}. Please try again.`);
  }
  return updated;
}

export async function deleteBooking(id: string): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) {
    throw new Error('Your Supabase session has expired. Please sign in again before deleting a booking.');
  }

  const response = await fetch(apiUrl(`/api/bookings/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(result?.details || result?.error || 'Unable to permanently delete this booking.');
  }
}

export async function recordBookingPayment(id: string, payload: { amount: number; currency: CurrencyCode; payment_type: string; provider: string; status: string; payment_method?: string; gateway_reference?: string; gateway_transaction_id?: string; metadata?: Record<string, unknown>; paid_at?: string }): Promise<PaymentRecord> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) {
    throw new Error('Your Supabase session has expired. Please sign in again before recording a payment.');
  }

  const response = await fetch(apiUrl(`/api/bookings/${encodeURIComponent(id)}/payments`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(result?.details || result?.error || 'Unable to record this payment.');
  }

  return result.data as PaymentRecord;
}

export async function updateEnquiryStatus(id: string, status: string): Promise<AdminEnquiryRecord> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw formatAdminDataError(sessionError);
  if (!sessionData.session) {
    throw new Error('Your Supabase session has expired. Please sign in again before updating an enquiry.');
  }

  const { data, error } = await supabase
    .from('messages')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, full_name, email, phone, subject, message, status, created_at, updated_at')
    .maybeSingle();

  if (error) throw formatAdminDataError(error);
  if (!data) throw new Error(`Supabase did not confirm the enquiry status update for ${id}.`);
  return data as AdminEnquiryRecord;
}

export function normalizeStatus(value: string | null | undefined, fallback: string): string {
  const cleaned = (value || fallback).trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

export function formatAdminDate(date: string | null | undefined): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatAdminDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusClass(status: string | null | undefined): string {
  const normalized = (status || 'pending').toLowerCase();

  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 border border-amber-200',
    confirmed: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    'deposit paid': 'bg-sky-100 text-sky-800 border border-sky-200',
    'fully paid': 'bg-green-100 text-green-800 border border-green-200',
    completed: 'bg-violet-100 text-violet-800 border border-violet-200',
    cancelled: 'bg-red-100 text-red-800 border border-red-200',
    new: 'bg-blue-100 text-blue-800 border border-blue-200',
    contacted: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
    'follow-up': 'bg-amber-100 text-amber-800 border border-amber-200',
    converted: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    closed: 'bg-slate-200 text-slate-700 border border-slate-300',
    unread: 'bg-blue-100 text-blue-800 border border-blue-200',
    replied: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  };

  return map[normalized] || 'bg-stone-100 text-stone-700 border border-stone-200';
}

export function titleCase(value: string | null | undefined): string {
  const fallback = 'Pending';
  if (!value) return fallback;
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
