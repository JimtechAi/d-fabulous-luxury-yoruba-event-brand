// Conflict detection and the single set of 409 responses shared by the Express backend (server.ts) and the Edge Function, so both answer identically.
// Pure TypeScript: no Deno-only or Node-only APIs (same rule as lib/ip.ts).

export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  status?: number | null;
}

export const CONFLICTS = {
  dateUnavailable: { error: 'Date Unavailable', details: 'This date is no longer available. Please select another date.' },
  dateAlreadyBlocked: { error: 'Date Already Blocked', details: 'This date is already blocked.' },
  duplicatePaymentReference: { error: 'Duplicate Payment Reference', details: 'A payment with this gateway reference already exists.' },
  userAlreadyExists: { error: 'User Already Exists', details: 'A user with this email address already exists.' },
} as const;

export type ConflictKind = keyof typeof CONFLICTS;

/** Body of an HTTP 409 answer: the same `{ success, error, details }` shape every other error uses. */
export function conflictBody(kind: ConflictKind): { success: false; error: string; details: string } {
  return { success: false, ...CONFLICTS[kind] };
}

const text = (error: DbErrorLike | null | undefined) => `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();

/** Unique-constraint violation (SQLSTATE 23505), optionally on a named constraint or column. */
export function isUniqueViolation(error: DbErrorLike | null | undefined, constraintOrColumn?: string): boolean {
  if (!error || error.code !== '23505') return false;
  return constraintOrColumn ? text(error).includes(constraintOrColumn.toLowerCase()) : true;
}

/** The database refused an event date: the booking trigger ("This date is unavailable...") or an exclusion/unique rule on active bookings. */
export function isDateUnavailableError(error: DbErrorLike | null | undefined): boolean {
  if (!error) return false;
  return text(error).includes('available') || error.code === '23P01' || isUniqueViolation(error, 'bookings_active_event_date_unique');
}

/** Supabase Auth refused to create a user because the e-mail address is already registered. */
export function isAuthEmailAlreadyRegistered(error: DbErrorLike & { error_code?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? error.error_code ?? '').toLowerCase();
  return code === 'email_exists' || code === 'user_already_exists' || /already (been )?registered|already exists/.test(text(error));
}
