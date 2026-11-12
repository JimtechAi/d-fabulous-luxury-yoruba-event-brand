// Admin booking lifecycle routes: status transitions, archive, detail updates,
// permanent deletion, and payment recording. Ported 1:1 from server.ts including
// the transition matrix, optimistic concurrency, RLS-backstopped user-token writes,
// persistence verification, and audit logging.
import { Hono } from 'hono';
import { serviceClient, userClient } from '../lib/supabase.ts';
import { isSupabaseConfigured } from '../lib/env.ts';
import { readBearerToken } from '../lib/auth.ts';
import { guardAdminRequest } from '../lib/adminGuard.ts';
import { appendAuditLog } from '../lib/audit.ts';
import { readJsonBody } from '../lib/http.ts';
import {
  bookingStatusTransitions,
  isValidDate,
  parseCurrencyAmount,
  parseCurrencyCode,
  parseGuestCount,
  readText,
} from '../lib/validation.ts';
import { sendBookingStatusNotification } from '../lib/email.ts';
import { conflictBody, isDateUnavailableError, isUniqueViolation } from '../lib/conflicts.ts';

export const adminBookingRoutes = new Hono();

// Every route below follows: validate request -> authenticate -> verify admin -> rate limit -> execute.
// The rate limit runs inside guardAdminRequest, strictly after authentication and authorisation.
const ADMIN_BOOKING_GUARD = { rateLimit: 'admin_status' } as const;

const BOOKING_SELECT = 'id, booking_reference, full_name, email, phone, event_date, event_location, services_requested, estimated_guest_count, celebration_details, status, completed_at, archived_at, created_at, updated_at';
const BOOKING_SELECT_WITH_AMOUNT = 'id, booking_reference, full_name, email, phone, event_date, event_location, booking_amount, services_requested, estimated_guest_count, celebration_details, status, completed_at, archived_at, created_at, updated_at';

adminBookingRoutes.patch('/api/bookings/:id/status', async (c) => {
  if (!isSupabaseConfigured) {
    return c.json({ success: false, error: 'Database Configuration Error' }, 503);
  }

  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;

  const bookingId = readText(c.req.param('id'), 120);
  const requestedStatus = readText(parsed.body?.status, 40)?.toLowerCase();
  const allowedStatuses = ['pending', 'confirmed', 'deposit paid', 'fully paid', 'completed', 'cancelled'];

  if (!bookingId || !requestedStatus || !allowedStatuses.includes(requestedStatus)) {
    return c.json({ success: false, error: 'Validation Error', details: 'A valid booking ID and status are required.' }, 400);
  }

  try {
    const guard = await guardAdminRequest(c, ['bookings.manage'], {
      ...ADMIN_BOOKING_GUARD,
      adminRoleMessage: 'Only active administrators or the owner can change booking status.',
    });
    if (!guard.ok) return guard.response;
    const adminUser = guard.adminUser;
    const accessToken = readBearerToken(c.req.header('authorization'));
    const requestSupabase = userClient(accessToken);

    const { data: existing, error: readError } = await requestSupabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('id', bookingId)
      .maybeSingle();
    if (readError) {
      console.error('[Edge API] Booking status read error:', readError);
      return c.json({ success: false, error: 'Database Operation Error', details: 'Unable to read the booking before updating it.' }, 500);
    }
    if (!existing) {
      return c.json({ success: false, error: 'Booking Not Found' }, 404);
    }

    const previousStatus = String(existing.status || 'pending').trim().toLowerCase();
    const changed = previousStatus !== requestedStatus;
    const validTransitions = bookingStatusTransitions[previousStatus] || [];
    if (!validTransitions.includes(requestedStatus)) {
      return c.json({
        success: false,
        error: 'Invalid Booking Transition',
        details: `A booking with status "${previousStatus}" cannot be changed to "${requestedStatus}".`,
      }, 409);
    }
    const shouldNotify = changed && (
      (previousStatus === 'pending' && requestedStatus === 'cancelled') ||
      (previousStatus === 'confirmed' && requestedStatus === 'cancelled')
    );

    const statusUpdates: Record<string, string> = { status: requestedStatus, updated_at: new Date().toISOString() };
    if (requestedStatus === 'completed' && changed) statusUpdates.completed_at = new Date().toISOString();

    const { data: updated, error: updateError } = await requestSupabase
      .from('bookings')
      .update(statusUpdates)
      .eq('id', bookingId)
      .eq('status', previousStatus)
      .select(BOOKING_SELECT)
      .maybeSingle();
    if (updateError) {
      console.error('[Edge API] Booking status update error:', updateError);
      return c.json({ success: false, error: 'Database Operation Error', details: 'Unable to update the booking status.' }, 500);
    }
    if (!updated) {
      return c.json({ success: false, error: 'Booking Status Changed', details: 'The booking was changed by another request. Refresh and try again.' }, 409);
    }

    if (requestedStatus === 'completed' && changed) {
      await appendAuditLog({
        actor_user_id: adminUser.userId,
        action: 'booking.completed',
        target_user_id: null,
        metadata: { booking_reference: updated.booking_reference || null, event_date: updated.event_date || null },
      });
    }

    let emailWarning: string | undefined;
    if (shouldNotify && requestedStatus === 'cancelled') {
      const emailResult = await sendBookingStatusNotification(updated, requestedStatus as 'cancelled').catch((emailError) => {
        console.error('[Edge API] Unexpected booking status email error:', emailError);
        return { success: false, status: 'failed' as const, deliveryStatus: 'failed' as const, error: 'Unexpected booking status email failure.' };
      });
      if (!emailResult.success) {
        emailWarning = emailResult.error || 'The status changed, but the customer email was not submitted.';
        console.error('[Edge API] Booking status email error:', emailWarning);
      }
    }

    return c.json({ success: true, data: updated, emailWarning });
  } catch (error) {
    console.error('[Edge API] Unexpected booking status error:', error);
    return c.json({ success: false, error: 'Booking Status Error', details: 'Unable to update the booking status.' }, 500);
  }
});

adminBookingRoutes.post('/api/bookings/:id/archive', async (c) => {
  if (!isSupabaseConfigured) {
    return c.json({ success: false, error: 'Database Configuration Error' }, 503);
  }
  const bookingId = readText(c.req.param('id'), 120);
  if (!bookingId) {
    return c.json({ success: false, error: 'Validation Error', details: 'A valid booking ID is required.' }, 400);
  }

  try {
    const guard = await guardAdminRequest(c, ['bookings.manage'], {
      ...ADMIN_BOOKING_GUARD,
      adminRoleMessage: 'Only active administrators or the owner can archive bookings.',
    });
    if (!guard.ok) return guard.response;
    const adminUser = guard.adminUser;

    const db = serviceClient();
    const { data: current, error: readError } = await db
      .from('bookings')
      .select('id, booking_reference, full_name, event_date, status, completed_at, archived_at')
      .eq('id', bookingId)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) {
      return c.json({ success: false, error: 'Booking Not Found' }, 404);
    }
    if (String(current.status).toLowerCase() !== 'completed') {
      return c.json({ success: false, error: 'Invalid Booking Status', details: 'Only completed bookings can be archived.' }, 409);
    }

    const archivedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await db
      .from('bookings')
      .update({ status: 'archived', archived_at: archivedAt, updated_at: archivedAt })
      .eq('id', bookingId)
      .eq('status', 'completed')
      .select('id, booking_reference, full_name, email, phone, event_date, event_location, booking_amount, currency, services_requested, estimated_guest_count, celebration_details, status, completed_at, archived_at, created_at, updated_at')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      return c.json({ success: false, error: 'Booking Status Changed', details: 'The booking changed before it could be archived. Refresh and try again.' }, 409);
    }

    await appendAuditLog({
      actor_user_id: adminUser.userId,
      action: 'booking.archived',
      target_user_id: null,
      metadata: { booking_reference: updated.booking_reference || null, event_date: updated.event_date || null, archived_at: archivedAt },
    });
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('[Edge API] Booking archive error:', error);
    return c.json({ success: false, error: 'Booking Archive Error', details: 'Unable to archive the booking.' }, 500);
  }
});

adminBookingRoutes.patch('/api/bookings/:id', async (c) => {
  if (!isSupabaseConfigured) {
    return c.json({ success: false, error: 'Database Configuration Error' }, 503);
  }
  const bookingId = readText(c.req.param('id'), 120);
  if (!bookingId) {
    return c.json({ success: false, error: 'Validation Error', details: 'A valid booking ID is required.' }, 400);
  }

  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;

  try {
    const guard = await guardAdminRequest(c, ['bookings.manage'], ADMIN_BOOKING_GUARD);
    if (!guard.ok) return guard.response;
    const accessToken = readBearerToken(c.req.header('authorization'));

    const payload = parsed.body;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.event_date !== undefined) {
      const eventDate = payload.event_date === null || payload.event_date === '' ? null : payload.event_date;
      if (eventDate !== null && !isValidDate(eventDate)) {
        return c.json({ success: false, error: 'Validation Error', details: 'The booking event date is invalid.' }, 400);
      }
      updates.event_date = eventDate;
    }

    if (payload.event_location !== undefined) {
      const location = readText(payload.event_location, 160);
      updates.event_location = location ?? null;
    }

    if (payload.celebration_details !== undefined) {
      const message = payload.celebration_details === null ? null : readText(payload.celebration_details, 4000);
      updates.celebration_details = message;
    }

    if (payload.estimated_guest_count !== undefined) {
      const guestCount = parseGuestCount(payload.estimated_guest_count);
      if (payload.estimated_guest_count !== null && payload.estimated_guest_count !== '' && guestCount === null) {
        return c.json({ success: false, error: 'Validation Error', details: 'The estimated guest count is invalid.' }, 400);
      }
      updates.estimated_guest_count = guestCount;
    }

    let bookingAmount: number | null = null;
    if (payload.booking_amount !== undefined) {
      bookingAmount = payload.booking_amount === null || payload.booking_amount === '' ? 0 : parseCurrencyAmount(payload.booking_amount);
      if (bookingAmount === null || bookingAmount <= 0) {
        return c.json({ success: false, error: 'Validation Error', details: 'The total amount charged must be a positive number greater than zero.' }, 400);
      }
      updates.booking_amount = bookingAmount;
    }

    if (payload.currency !== undefined) {
      const bookingCurrency = parseCurrencyCode(payload.currency) || 'GBP';
      updates.currency = bookingCurrency;
    }

    const requestSupabase = userClient(accessToken);
    let { data: updated, error } = await requestSupabase
      .from('bookings')
      .update(updates)
      .eq('id', bookingId)
      .select(BOOKING_SELECT_WITH_AMOUNT)
      .maybeSingle();

    if (error && error.code === '42703' && updates.currency !== undefined) {
      console.warn('[Edge API] bookings.currency column missing; retrying booking update without currency field.');
      const { currency: _unusedCurrency, ...updatesWithoutCurrency } = updates;
      ({ data: updated, error } = await requestSupabase
        .from('bookings')
        .update(updatesWithoutCurrency)
        .eq('id', bookingId)
        .select(BOOKING_SELECT_WITH_AMOUNT)
        .maybeSingle());
    }

    if (error) {
      console.error('[Edge API] Booking detail update error:', error);
      if (isDateUnavailableError(error)) return c.json(conflictBody('dateUnavailable'), 409);
      return c.json({ success: false, error: 'Database Operation Error', details: 'Unable to update the booking details.' }, 500);
    }
    if (!updated) {
      return c.json({ success: false, error: 'Booking Not Found', details: 'The booking could not be updated. Confirm your admin account still has update access to this booking.' }, 404);
    }

    const persistedBookingAmount = parseCurrencyAmount(updated.booking_amount);
    if (payload.booking_amount !== undefined && persistedBookingAmount !== bookingAmount) {
      console.error('[Edge API] Booking amount persistence verification failed:', {
        bookingId,
        requested: bookingAmount,
        persisted: updated.booking_amount,
      });
      return c.json({ success: false, error: 'Database Verification Error', details: 'The booking total was not persisted.' }, 500);
    }

    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error('[Edge API] Unexpected booking update error:', error);
    return c.json({ success: false, error: 'Booking Update Error', details: 'Unable to update the booking details.' }, 500);
  }
});

adminBookingRoutes.delete('/api/bookings/:id', async (c) => {
  if (!isSupabaseConfigured) {
    return c.json({ success: false, error: 'Database Configuration Error' }, 503);
  }
  const bookingId = readText(c.req.param('id'), 120);
  if (!bookingId) {
    return c.json({ success: false, error: 'Validation Error', details: 'A valid booking ID is required.' }, 400);
  }

  try {
    const guard = await guardAdminRequest(c, ['bookings.manage'], {
      ...ADMIN_BOOKING_GUARD,
      adminRoleMessage: 'Only active administrators or the owner can permanently delete bookings.',
    });
    if (!guard.ok) return guard.response;
    const adminUser = guard.adminUser;
    const accessToken = readBearerToken(c.req.header('authorization'));
    const requestSupabase = userClient(accessToken);

    const { data: existingBooking, error: existingError } = await requestSupabase
      .from('bookings')
      .select('id, status')
      .eq('id', bookingId)
      .maybeSingle();

    if (existingError) {
      console.error('[Edge API] Booking delete pre-read error:', existingError);
      return c.json({ success: false, error: 'Database Operation Error', details: 'Unable to read the booking before deleting it.' }, 500);
    }
    if (!existingBooking) {
      return c.json({ success: false, error: 'Booking Not Found', details: 'This booking no longer exists.' }, 404);
    }

    const { data: deleted, error } = await requestSupabase
      .from('bookings')
      .delete()
      .eq('id', bookingId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Edge API] Booking delete error:', error);
      // 23503: a dependent row (for example a payment) still references this booking.
      if (error.code === '23503') {
        return c.json({
          success: false,
          error: 'Deletion Blocked',
          details: 'This booking still has linked records (such as payments) and the database is refusing to delete it. Remove or reassign those records first.',
        }, 409);
      }
      if (error.code === '42501') {
        return c.json({
          success: false,
          error: 'Database Privilege Missing',
          details: 'This booking cannot be deleted with the current account permissions.',
        }, 403);
      }
      return c.json({ success: false, error: 'Database Operation Error', details: 'Unable to delete this booking.' }, 500);
    }

    if (!deleted) {
      // The booking exists but no row was removed, so a delete policy refused it.
      console.error('[Edge API] Booking delete blocked by row level security:', { bookingId, isOwner: adminUser.isOwner });
      return c.json({
        success: false,
        error: 'Authorization Error',
        details: adminUser.isOwner
          ? 'The database refused the deletion. No delete policy currently matches this account.'
          : 'Permanent deletion is restricted to the owner account.',
      }, 403);
    }

    const { data: stillPresent } = await requestSupabase
      .from('bookings')
      .select('id')
      .eq('id', bookingId)
      .maybeSingle();

    if (stillPresent) {
      console.error('[Edge API] Booking delete verification failed; row still present:', bookingId);
      return c.json({ success: false, error: 'Database Verification Error', details: 'The booking was reported as deleted but is still present.' }, 500);
    }

    return c.json({ success: true, data: deleted });
  } catch (error) {
    console.error('[Edge API] Unexpected booking delete error:', error);
    return c.json({ success: false, error: 'Booking Delete Error', details: 'Unable to permanently delete the booking.' }, 500);
  }
});

adminBookingRoutes.post('/api/bookings/:id/payments', async (c) => {
  if (!isSupabaseConfigured) {
    return c.json({ success: false, error: 'Database Configuration Error' }, 503);
  }
  const bookingId = readText(c.req.param('id'), 120);

  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.body;

  if (!bookingId) {
    return c.json({ success: false, error: 'Validation Error', details: 'A valid booking ID is required.' }, 400);
  }

  const amount = parseCurrencyAmount(payload.amount);
  const currency = parseCurrencyCode(payload.currency) || 'GBP';
  const paymentType = readText(payload.payment_type, 20);
  const provider = readText(payload.provider, 20);
  const paymentStatus = readText(payload.status, 30)?.toLowerCase() || 'successful';
  const paymentMethod = readText(payload.payment_method, 60);
  const gatewayReference = payload.gateway_reference === undefined || payload.gateway_reference === null ? null : readText(payload.gateway_reference, 180);
  const gatewayTransactionId = payload.gateway_transaction_id === undefined || payload.gateway_transaction_id === null ? null : readText(payload.gateway_transaction_id, 180);
  const allowedPaymentTypes = ['deposit', 'balance', 'full', 'refund'];
  const allowedProviders = ['paystack', 'flutterwave', 'manual'];
  const allowedPaymentStatuses = ['pending', 'processing', 'successful', 'failed', 'cancelled', 'refunded', 'partially_refunded'];

  if (!amount || amount <= 0 || !paymentType || !allowedPaymentTypes.includes(paymentType) || !provider || !allowedProviders.includes(provider) || !allowedPaymentStatuses.includes(paymentStatus)) {
    return c.json({ success: false, error: 'Validation Error', details: 'A valid positive amount, currency, payment type, provider, and status are required.' }, 400);
  }

  try {
    const guard = await guardAdminRequest(c, ['payments.manage'], ADMIN_BOOKING_GUARD);
    if (!guard.ok) return guard.response;
    const adminUser = guard.adminUser;
    const accessToken = readBearerToken(c.req.header('authorization'));
    const requestSupabase = userClient(accessToken);

    const { data: booking, error: bookingError } = await requestSupabase
      .from('bookings')
      .select('id, full_name, email, booking_amount')
      .eq('id', bookingId)
      .maybeSingle();

    if (bookingError) {
      console.error('[Edge API] Payment booking lookup error:', bookingError);
      return c.json({ success: false, error: 'Database Operation Error', details: 'Unable to read the booking before recording payment.' }, 500);
    }
    if (!booking) {
      return c.json({ success: false, error: 'Booking Not Found' }, 404);
    }

    const totalBookingAmount = parseCurrencyAmount(booking.booking_amount ?? 0) ?? 0;
    if (paymentStatus === 'successful' && totalBookingAmount > 0) {
      const { data: successfulPayments, error: successfulPaymentError } = await requestSupabase
        .from('payments')
        .select('amount, status, payment_type')
        .eq('booking_id', bookingId)
        .eq('status', 'successful');

      if (successfulPaymentError) {
        console.error('[Edge API] Successful payment total lookup error:', successfulPaymentError);
        return c.json({ success: false, error: 'Database Operation Error', details: 'Unable to validate the remaining booking balance.' }, 500);
      }

      const paidToDate = (successfulPayments ?? []).reduce((sum: number, payment: { amount: unknown; payment_type: string }) => {
        const value = parseCurrencyAmount(payment.amount) ?? 0;
        return payment.payment_type === 'refund' ? sum - value : sum + value;
      }, 0);
      const remainingBalance = Math.max(0, totalBookingAmount - paidToDate);
      if (amount > remainingBalance) {
        return c.json({ success: false, error: 'Validation Error', details: `This payment exceeds the remaining balance of ${remainingBalance}.` }, 400);
      }
    }

    const { data: paymentRow, error: paymentError } = await requestSupabase
      .from('payments')
      .insert([{
        booking_id: bookingId,
        user_id: adminUser.userId,
        amount,
        currency,
        payment_type: paymentType,
        provider,
        status: paymentStatus,
        gateway_reference: gatewayReference,
        gateway_transaction_id: gatewayTransactionId,
        payment_method: paymentMethod,
        customer_email: booking.email,
        metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
        paid_at: paymentStatus === 'successful' ? new Date().toISOString() : null,
      }])
      .select('id, booking_id, user_id, amount, currency, payment_type, provider, status, gateway_reference, gateway_transaction_id, payment_method, customer_email, metadata, paid_at, created_at, updated_at')
      .maybeSingle();

    if (paymentError) {
      console.error('[Edge API] Payment record insert error:', paymentError);
      if (isUniqueViolation(paymentError, 'gateway_reference')) return c.json(conflictBody('duplicatePaymentReference'), 409);
      return c.json({ success: false, error: 'Database Operation Error', details: 'The payments table may be missing or the database rules may be blocking the insert.' }, 500);
    }

    const { data: persistedBooking, error: persistedBookingError } = await requestSupabase
      .from('bookings')
      .select('id, booking_amount')
      .eq('id', bookingId)
      .maybeSingle();
    const { data: persistedPayments, error: persistedPaymentsError } = await requestSupabase
      .from('payments')
      .select('amount, status, payment_type')
      .eq('booking_id', bookingId);

    if (persistedBookingError || persistedPaymentsError || !persistedBooking) {
      console.error('[Edge API] Payment persistence verification failed:', {
        bookingId,
        bookingError: persistedBookingError,
        paymentsError: persistedPaymentsError,
        persistedBooking,
      });
      return c.json({ success: false, error: 'Database Verification Error', details: 'The payment could not be verified after recording.' }, 500);
    }

    const persistedBookingAmount = parseCurrencyAmount(persistedBooking.booking_amount ?? 0) ?? 0;
    const totalAmountPaid = Math.max(0, (persistedPayments ?? []).reduce((sum: number, payment: { amount: unknown; status?: string; payment_type: string }) => {
      if ((payment.status || '').toLowerCase() !== 'successful') return sum;
      const value = parseCurrencyAmount(payment.amount) ?? 0;
      return payment.payment_type === 'refund' ? sum - value : sum + value;
    }, 0));
    const balanceDue = Math.max(0, persistedBookingAmount - totalAmountPaid);
    console.info('[Edge API] Payment accounting:', {
      bookingId,
      bookingAmount: persistedBookingAmount,
      newPaymentAmount: amount,
      totalAmountPaid,
      balanceDue,
    });

    const calculatedPaymentStatus = persistedBookingAmount <= 0
      ? 'unpaid'
      : totalAmountPaid <= 0
        ? 'unpaid'
        : totalAmountPaid < persistedBookingAmount
          ? 'part payment'
          : 'fully paid';
    return c.json({
      success: true,
      data: paymentRow,
      accounting: {
        bookingAmount: persistedBookingAmount,
        amountPaid: totalAmountPaid,
        balanceDue,
        paymentStatus: calculatedPaymentStatus,
        currency,
      },
    });
  } catch (error) {
    console.error('[Edge API] Unexpected payment recording error:', error);
    return c.json({ success: false, error: 'Payment Error', details: 'Unable to record the payment.' }, 500);
  }
});
