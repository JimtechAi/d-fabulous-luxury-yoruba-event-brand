// Validation helpers and shared constants, ported verbatim from the Express backend
// (server.ts) so request/response contracts are preserved exactly.

export const ALL_PERMISSION_KEYS = [
  'bookings.view', 'bookings.manage',
  'messages.view', 'messages.manage',
  'payments.view', 'payments.manage',
  'testimonials.view', 'testimonials.manage',
  'gallery.view', 'gallery.manage',
  'services.view', 'services.manage',
  'settings.view', 'settings.manage',
  'users.view', 'users.manage',
  'diagnostics.view',
] as const;

export const ROLE_OPTIONS = ['owner', 'admin', 'staff', 'viewer'] as const;

export const bookingStatusTransitions: Record<string, readonly string[]> = {
  pending: ['pending', 'confirmed', 'cancelled'],
  confirmed: ['confirmed', 'deposit paid', 'fully paid', 'completed', 'cancelled'],
  'deposit paid': ['deposit paid', 'fully paid', 'completed', 'cancelled'],
  'fully paid': ['fully paid', 'completed', 'cancelled'],
  completed: ['completed'],
  cancelled: ['cancelled'],
  archived: ['archived'],
};

export function normalizePermissions(permissions: unknown): string[] {
  if (!Array.isArray(permissions)) return [];
  const unique = new Set<string>();
  for (const item of permissions) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || !ALL_PERMISSION_KEYS.includes(trimmed as typeof ALL_PERMISSION_KEYS[number])) continue;
    unique.add(trimmed);
  }
  return Array.from(unique);
}

export function isRoleOption(value: unknown): value is (typeof ROLE_OPTIONS)[number] {
  return typeof value === 'string' && ROLE_OPTIONS.includes(value as (typeof ROLE_OPTIONS)[number]);
}

export function sanitizeUserRecord(record: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!record) return null;
  return {
    id: record.id,
    email: record.email ?? null,
    full_name: record.full_name ?? (record as Record<string, unknown>).name ?? null,
    role: record.role ?? 'viewer',
    is_active: Boolean(record.is_active !== false),
    created_at: record.created_at ?? null,
    updated_at: record.updated_at ?? null,
    last_sign_in_at: record.last_sign_in_at ?? null,
  };
}

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidPhone(value: unknown): value is string {
  return typeof value === 'string' && /^[+\d\s().-]{7,30}$/.test(value.trim());
}

export function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

export function parseGuestCount(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 10000 ? value : null;

  const rangeValues: Record<string, number> = {
    'under-100': 50,
    '100-250': 175,
    '250-500': 375,
    '500-1000': 750,
    '1000+': 1000,
  };
  if (value in rangeValues) return rangeValues[value];

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10000 ? parsed : null;
}

export function parseCurrencyAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== 'string') return null;
  const numeric = Number.parseFloat(value.replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

export function parseCurrencyCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const currency = value.trim().toUpperCase();
  return ['NGN', 'USD', 'GBP', 'EUR'].includes(currency) ? currency : null;
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function formatError(error: unknown): string {
  if (!error) return 'Unknown server error';
  if (typeof error === 'string') return error;
  const err = error as { message?: string; code?: string; hint?: string; details?: string };
  const msg = err.message || 'Error occurred during database operation';
  const code = err.code ? ` [Code: ${err.code}]` : '';
  const hint = err.hint ? ` (Hint: ${err.hint})` : '';
  const details = err.details ? ` (Details: ${err.details})` : '';
  return `${msg}${code}${details}${hint}`;
}

export function getAuthorizationError(code: string, message: string) {
  return { success: false, error: code, details: message };
}
