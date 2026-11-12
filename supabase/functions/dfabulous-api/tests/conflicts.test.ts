// Regression tests for the shared conflict helpers (defects D2 to D5 of the Stage 3 parity report). Same cases as tests/conflicts.test.mjs (Node).
import { assertEquals } from '@std/assert';
import { CONFLICTS, conflictBody, isAuthEmailAlreadyRegistered, isDateUnavailableError, isUniqueViolation } from '../lib/conflicts.ts';

const pg = (code: string, message: string, details: string | null = null) => ({ code, message, details });

Deno.test('D2: booking trigger and active-date rules are "date unavailable"; other errors are not', () => {
  assertEquals(isDateUnavailableError(pg('P0001', 'This date is unavailable. Please select another event date.')), true);
  assertEquals(isDateUnavailableError(pg('23P01', 'conflicting key value violates exclusion constraint')), true);
  assertEquals(isDateUnavailableError(pg('23505', 'duplicate key value violates unique constraint "bookings_active_event_date_unique"')), true);
  assertEquals(isDateUnavailableError(pg('42501', 'permission denied for table bookings')), false);
  assertEquals(isDateUnavailableError(pg('23502', 'null value in column "full_name"')), false);
  assertEquals(isDateUnavailableError(null), false);
});

Deno.test('D3: a duplicate blocked date is a unique violation; unrelated errors are not', () => {
  assertEquals(isUniqueViolation(pg('23505', 'duplicate key value violates unique constraint "blocked_dates_pkey"', 'Key (event_date)=(2027-05-01) already exists.')), true);
  assertEquals(isUniqueViolation(pg('23503', 'violates foreign key constraint')), false);
  assertEquals(isUniqueViolation(undefined), false);
});

Deno.test('D4: only a duplicate on gateway_reference is a duplicate payment reference', () => {
  assertEquals(isUniqueViolation(pg('23505', 'duplicate key value violates unique constraint "payments_gateway_reference_key"', 'Key (gateway_reference)=(ref-1) already exists.'), 'gateway_reference'), true);
  assertEquals(isUniqueViolation(pg('23505', 'duplicate key value violates unique constraint "payments_pkey"', 'Key (id)=(x) already exists.'), 'gateway_reference'), false);
  assertEquals(isUniqueViolation(pg('23514', 'violates check constraint "payments_status_check"'), 'gateway_reference'), false);
});

Deno.test('D5: Supabase Auth "already registered" errors are recognised; other auth failures are not', () => {
  assertEquals(isAuthEmailAlreadyRegistered({ status: 422, code: 'email_exists', message: 'A user with this email address has already been registered' }), true);
  assertEquals(isAuthEmailAlreadyRegistered({ status: 422, error_code: 'email_exists', message: 'x' }), true);
  assertEquals(isAuthEmailAlreadyRegistered({ code: 'user_already_exists', message: 'x' }), true);
  assertEquals(isAuthEmailAlreadyRegistered({ message: 'User already registered' }), true);
  assertEquals(isAuthEmailAlreadyRegistered({ status: 500, code: 'unexpected_failure', message: 'database error saving new user' }), false);
  assertEquals(isAuthEmailAlreadyRegistered({ status: 429, code: 'over_email_send_rate_limit', message: 'rate limit' }), false);
  assertEquals(isAuthEmailAlreadyRegistered(null), false);
});

Deno.test('every 409 body has the same shape and a clear, distinct message', () => {
  const kinds = Object.keys(CONFLICTS) as Array<keyof typeof CONFLICTS>;
  assertEquals([...kinds].sort(), ['dateAlreadyBlocked', 'dateUnavailable', 'duplicatePaymentReference', 'userAlreadyExists']);
  const titles = new Set<string>();
  for (const kind of kinds) {
    const body = conflictBody(kind);
    assertEquals(Object.keys(body).sort(), ['details', 'error', 'success']);
    assertEquals(body.success, false);
    titles.add(body.error);
  }
  assertEquals(titles.size, 4);
  assertEquals(conflictBody('dateUnavailable').details, 'This date is no longer available. Please select another date.');
});
