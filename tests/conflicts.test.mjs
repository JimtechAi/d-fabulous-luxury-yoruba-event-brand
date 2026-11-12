// Regression tests for the conflict helpers shared by the Express backend and the Edge Function (defects D2 to D5 of the Stage 3 parity report).
// The same cases run under Node (tests/conflicts.test.mjs) and Deno (supabase/functions/dfabulous-api/tests/conflicts.test.ts).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CONFLICTS, conflictBody, isAuthEmailAlreadyRegistered, isDateUnavailableError, isUniqueViolation } from '../supabase/functions/dfabulous-api/lib/conflicts.ts';

const pg = (code, message, details = null) => ({ code, message, details });

describe('conflict helpers', () => {
  test('D2: the booking trigger and the active-date rules are recognised as "date unavailable", other errors are not', () => {
    assert.equal(isDateUnavailableError(pg('P0001', 'This date is unavailable. Please select another event date.')), true);
    assert.equal(isDateUnavailableError(pg('23P01', 'conflicting key value violates exclusion constraint')), true);
    assert.equal(isDateUnavailableError(pg('23505', 'duplicate key value violates unique constraint "bookings_active_event_date_unique"')), true);
    assert.equal(isDateUnavailableError(pg('42501', 'permission denied for table bookings')), false);
    assert.equal(isDateUnavailableError(pg('23502', 'null value in column "full_name"')), false);
    assert.equal(isDateUnavailableError(null), false);
  });

  test('D3: a duplicate blocked date is a unique violation; unrelated errors are not', () => {
    assert.equal(isUniqueViolation(pg('23505', 'duplicate key value violates unique constraint "blocked_dates_pkey"', 'Key (event_date)=(2027-05-01) already exists.')), true);
    assert.equal(isUniqueViolation(pg('23503', 'violates foreign key constraint')), false);
    assert.equal(isUniqueViolation(undefined), false);
  });

  test('D4: only a duplicate on gateway_reference is a duplicate payment reference', () => {
    const dup = pg('23505', 'duplicate key value violates unique constraint "payments_gateway_reference_key"', 'Key (gateway_reference)=(ref-1) already exists.');
    assert.equal(isUniqueViolation(dup, 'gateway_reference'), true);
    assert.equal(isUniqueViolation(pg('23505', 'duplicate key value violates unique constraint "payments_pkey"', 'Key (id)=(x) already exists.'), 'gateway_reference'), false);
    assert.equal(isUniqueViolation(pg('23514', 'violates check constraint "payments_status_check"'), 'gateway_reference'), false);
  });

  test('D5: Supabase Auth "already registered" errors are recognised in every form it uses', () => {
    assert.equal(isAuthEmailAlreadyRegistered({ status: 422, code: 'email_exists', message: 'A user with this email address has already been registered' }), true);
    assert.equal(isAuthEmailAlreadyRegistered({ status: 422, error_code: 'email_exists', message: 'x' }), true);
    assert.equal(isAuthEmailAlreadyRegistered({ code: 'user_already_exists', message: 'x' }), true);
    assert.equal(isAuthEmailAlreadyRegistered({ message: 'User already registered' }), true);
    assert.equal(isAuthEmailAlreadyRegistered({ status: 500, code: 'unexpected_failure', message: 'database error saving new user' }), false);
    assert.equal(isAuthEmailAlreadyRegistered({ status: 429, code: 'over_email_send_rate_limit', message: 'rate limit' }), false);
    assert.equal(isAuthEmailAlreadyRegistered(null), false);
  });

  test('every 409 body has the same shape and a clear, distinct message', () => {
    const kinds = Object.keys(CONFLICTS);
    assert.deepEqual(kinds.sort(), ['dateAlreadyBlocked', 'dateUnavailable', 'duplicatePaymentReference', 'userAlreadyExists']);
    const titles = new Set();
    for (const kind of kinds) {
      const body = conflictBody(kind);
      assert.deepEqual(Object.keys(body).sort(), ['details', 'error', 'success']);
      assert.equal(body.success, false);
      assert.ok(body.error.length > 0 && body.details.endsWith('.'), kind);
      titles.add(body.error);
    }
    assert.equal(titles.size, 4);
    assert.equal(conflictBody('dateUnavailable').details, 'This date is no longer available. Please select another date.', 'same wording the public booking route already uses');
  });
});
