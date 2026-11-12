// Parity scenarios: every one of the 24 functional API routes, with success, authentication, authorisation, validation, not-found and conflict cases.
// Each scenario is sent, identically, to the Express backend and to the Edge Function, each running against a freshly reset copy of the same fake Supabase.
import { IDS } from './fake-supabase.mjs';

export const ROUTES = [
  'GET /api/health', 'GET /api/diagnostics', 'GET /api/availability', 'POST /api/bookings', 'GET /api/services', 'GET /api/gallery', 'GET /api/videos', 'GET /api/testimonials',
  'POST /api/messages', 'GET /api/admin/session', 'GET /api/admin/data/:resource', 'PATCH /api/bookings/:id/status', 'POST /api/bookings/:id/archive', 'PATCH /api/bookings/:id',
  'DELETE /api/bookings/:id', 'POST /api/bookings/:id/payments', 'PATCH /api/admin/messages/:id', 'POST /api/admin/blocked-dates', 'DELETE /api/admin/blocked-dates/:eventDate',
  'PUT /api/admin/settings', 'GET /api/admin/users', 'POST /api/admin/users', 'PATCH /api/admin/users/:id', 'DELETE /api/admin/users/:id',
];

const validBooking = { full_name: 'Test Client', email: 'client@example.test', phone: '+44 7700 900123', event_date: '2027-06-15', event_location: 'Manchester', services_requested: ['catering', 'decor'], estimated_guest_count: '100-250', celebration_details: 'Naming ceremony' };
const validMessage = { full_name: 'Visitor One', email: 'visitor@example.test', phone: '+44 7700 900124', subject: 'Packages', message: 'Please send details.' };
const validPayment = { amount: 100, currency: 'GBP', payment_type: 'deposit', provider: 'manual', status: 'successful', payment_method: 'bank transfer' };

const S = [];
const add = (route, id, spec) => S.push({ route, id: `${route} :: ${id}`, ...spec });
const get = (route, id, path, token, extra = {}) => add(route, id, { method: 'GET', path, token, ...extra });

// ---- public ----
get('GET /api/health', 'ok', '/api/health', undefined, { volatile: ['timestamp'] });
get('GET /api/diagnostics', 'ok', '/api/diagnostics');
get('GET /api/availability', 'defaults', '/api/availability');
get('GET /api/availability', 'range', '/api/availability?start=2027-01-01&end=2027-12-31');
get('GET /api/availability', 'invalid dates fall back to defaults', '/api/availability?start=nope&end=2027-02-30');
add('POST /api/bookings', 'valid', { method: 'POST', path: '/api/bookings', body: validBooking });
add('POST /api/bookings', 'valid, minimal (no phone, no details, no services)', { method: 'POST', path: '/api/bookings', body: { full_name: 'Min', email: 'min@example.test', event_date: '2027-06-16', event_location: 'Leeds' } });
add('POST /api/bookings', 'honeypot filled', { method: 'POST', path: '/api/bookings', body: { ...validBooking, website_hp: 'bot' } });
add('POST /api/bookings', 'invalid email', { method: 'POST', path: '/api/bookings', body: { ...validBooking, email: 'bad' } });
add('POST /api/bookings', 'missing name', { method: 'POST', path: '/api/bookings', body: { ...validBooking, full_name: '' } });
add('POST /api/bookings', 'invalid date', { method: 'POST', path: '/api/bookings', body: { ...validBooking, event_date: '2027-13-40' } });
add('POST /api/bookings', 'invalid phone', { method: 'POST', path: '/api/bookings', body: { ...validBooking, phone: 'abc' } });
add('POST /api/bookings', 'blocked date (database rule)', { method: 'POST', path: '/api/bookings', body: { ...validBooking, event_date: '2027-05-01' } });
add('POST /api/bookings', 'too many services', { method: 'POST', path: '/api/bookings', body: { ...validBooking, services_requested: Array.from({ length: 11 }, (_, i) => `s${i}`) } });
add('POST /api/bookings', 'bad guest count', { method: 'POST', path: '/api/bookings', body: { ...validBooking, estimated_guest_count: 'lots' } });
add('POST /api/bookings', 'malformed JSON', { method: 'POST', path: '/api/bookings', raw: '{"full_name": ' });
add('POST /api/bookings', 'oversized body (40 KB)', { method: 'POST', path: '/api/bookings', body: { ...validBooking, celebration_details: 'x'.repeat(40000) } });
add('POST /api/bookings', 'rate limit: 6th submission from one address', { method: 'POST', path: '/api/bookings', body: validBooking, repeat: 6, fixedIp: true });
get('GET /api/services', 'list', '/api/services');
get('GET /api/gallery', 'list', '/api/gallery');
get('GET /api/videos', 'list', '/api/videos');
get('GET /api/testimonials', 'list', '/api/testimonials');
add('POST /api/messages', 'valid', { method: 'POST', path: '/api/messages', body: validMessage });
add('POST /api/messages', 'valid, no subject', { method: 'POST', path: '/api/messages', body: { ...validMessage, subject: undefined } });
add('POST /api/messages', 'honeypot filled', { method: 'POST', path: '/api/messages', body: { ...validMessage, website_hp: 'bot' } });
add('POST /api/messages', 'invalid email', { method: 'POST', path: '/api/messages', body: { ...validMessage, email: 'nope' } });
add('POST /api/messages', 'missing message', { method: 'POST', path: '/api/messages', body: { ...validMessage, message: '' } });
add('POST /api/messages', 'malformed JSON', { method: 'POST', path: '/api/messages', raw: 'not json' });
add('POST /api/messages', 'rate limit: 6th submission', { method: 'POST', path: '/api/messages', body: validMessage, repeat: 6, fixedIp: true });

// ---- admin session / data ----
for (const [who, token] of [['no token', undefined], ['invalid token', 'bogus-token'], ['viewer', 'viewer-token'], ['inactive admin', 'inactive-token'], ['staff', 'staff-token'], ['admin', 'admin-token'], ['owner', 'owner-token'], ['user manager', 'manager-token']]) get('GET /api/admin/session', who, '/api/admin/session', token);
for (const r of ['bookings', 'payments', 'messages', 'services', 'settings', 'blocked_dates']) get('GET /api/admin/data/:resource', `admin reads ${r}`, `/api/admin/data/${r}`, 'admin-token');
get('GET /api/admin/data/:resource', 'owner reads payments', '/api/admin/data/payments', 'owner-token');
get('GET /api/admin/data/:resource', 'unknown resource', '/api/admin/data/secrets', 'admin-token');
get('GET /api/admin/data/:resource', 'no token', '/api/admin/data/bookings');
get('GET /api/admin/data/:resource', 'staff lacks payments.view', '/api/admin/data/payments', 'staff-token');
get('GET /api/admin/data/:resource', 'staff reads bookings', '/api/admin/data/bookings', 'staff-token');
get('GET /api/admin/data/:resource', 'inactive admin', '/api/admin/data/bookings', 'inactive-token');

// ---- bookings admin ----
const B1 = IDS.booking1; const B2 = IDS.booking2; const B3 = IDS.booking3; const NOPE = '00000000-0000-4000-8000-00000000ffff';
const patch = (route, id, path, token, body, extra = {}) => add(route, id, { method: 'PATCH', path, token, body, ...extra });
patch('PATCH /api/bookings/:id/status', 'admin confirms', `/api/bookings/${B1}/status`, 'admin-token', { status: 'confirmed' });
patch('PATCH /api/bookings/:id/status', 'admin completes', `/api/bookings/${B2}/status`, 'admin-token', { status: 'completed' });
patch('PATCH /api/bookings/:id/status', 'admin cancels', `/api/bookings/${B1}/status`, 'admin-token', { status: 'cancelled' });
patch('PATCH /api/bookings/:id/status', 'invalid status', `/api/bookings/${B1}/status`, 'admin-token', { status: 'exploded' });
patch('PATCH /api/bookings/:id/status', 'missing status', `/api/bookings/${B1}/status`, 'admin-token', {});
patch('PATCH /api/bookings/:id/status', 'unknown booking', `/api/bookings/${NOPE}/status`, 'admin-token', { status: 'confirmed' });
patch('PATCH /api/bookings/:id/status', 'malformed id', '/api/bookings/not-a-uuid/status', 'admin-token', { status: 'confirmed' });
patch('PATCH /api/bookings/:id/status', 'no token', `/api/bookings/${B1}/status`, undefined, { status: 'confirmed' });
patch('PATCH /api/bookings/:id/status', 'staff (view only)', `/api/bookings/${B1}/status`, 'staff-token', { status: 'confirmed' });
patch('PATCH /api/bookings/:id/status', 'viewer', `/api/bookings/${B1}/status`, 'viewer-token', { status: 'confirmed' });
patch('PATCH /api/bookings/:id/status', 'inactive admin', `/api/bookings/${B1}/status`, 'inactive-token', { status: 'confirmed' });
patch('PATCH /api/bookings/:id/status', 'owner', `/api/bookings/${B1}/status`, 'owner-token', { status: 'confirmed' });
add('POST /api/bookings/:id/archive', 'admin archives a completed booking', { method: 'POST', path: `/api/bookings/${IDS.booking4}/archive`, token: 'admin-token' });
add('POST /api/bookings/:id/archive', 'owner archives a completed booking', { method: 'POST', path: `/api/bookings/${IDS.booking4}/archive`, token: 'owner-token' });
add('POST /api/bookings/:id/archive', 'confirmed booking cannot be archived', { method: 'POST', path: `/api/bookings/${B2}/archive`, token: 'admin-token' });
add('POST /api/bookings/:id/archive', 'already archived', { method: 'POST', path: `/api/bookings/${B3}/archive`, token: 'admin-token' });
add('POST /api/bookings/:id/archive', 'unknown booking', { method: 'POST', path: `/api/bookings/${NOPE}/archive`, token: 'admin-token' });
add('POST /api/bookings/:id/archive', 'no token', { method: 'POST', path: `/api/bookings/${B2}/archive` });
add('POST /api/bookings/:id/archive', 'staff (view only)', { method: 'POST', path: `/api/bookings/${B2}/archive`, token: 'staff-token' });
patch('PATCH /api/bookings/:id', 'update location', `/api/bookings/${B1}`, 'admin-token', { event_location: 'Birmingham' });
patch('PATCH /api/bookings/:id', 'update amount and currency', `/api/bookings/${B1}`, 'admin-token', { booking_amount: 2500, currency: 'usd' });
patch('PATCH /api/bookings/:id', 'update date to a blocked date', `/api/bookings/${B1}`, 'admin-token', { event_date: '2027-05-01' });
patch('PATCH /api/bookings/:id', 'invalid amount', `/api/bookings/${B1}`, 'admin-token', { booking_amount: 'abc' });
patch('PATCH /api/bookings/:id', 'invalid date', `/api/bookings/${B1}`, 'admin-token', { event_date: 'soon' });
patch('PATCH /api/bookings/:id', 'invalid guest count', `/api/bookings/${B1}`, 'admin-token', { estimated_guest_count: 'many' });
patch('PATCH /api/bookings/:id', 'empty body', `/api/bookings/${B1}`, 'admin-token', {});
patch('PATCH /api/bookings/:id', 'unknown booking', `/api/bookings/${NOPE}`, 'admin-token', { event_location: 'X' });
patch('PATCH /api/bookings/:id', 'no token', `/api/bookings/${B1}`, undefined, { event_location: 'X' });
patch('PATCH /api/bookings/:id', 'staff (view only)', `/api/bookings/${B1}`, 'staff-token', { event_location: 'X' });
add('DELETE /api/bookings/:id', 'admin deletes (booking with a payment)', { method: 'DELETE', path: `/api/bookings/${B1}`, token: 'admin-token' });
add('DELETE /api/bookings/:id', 'admin deletes (no payment)', { method: 'DELETE', path: `/api/bookings/${B2}`, token: 'admin-token' });
add('DELETE /api/bookings/:id', 'unknown booking', { method: 'DELETE', path: `/api/bookings/${NOPE}`, token: 'admin-token' });
add('DELETE /api/bookings/:id', 'no token', { method: 'DELETE', path: `/api/bookings/${B2}` });
add('DELETE /api/bookings/:id', 'staff (view only)', { method: 'DELETE', path: `/api/bookings/${B2}`, token: 'staff-token' });
add('DELETE /api/bookings/:id', 'owner', { method: 'DELETE', path: `/api/bookings/${B2}`, token: 'owner-token' });

// ---- payments ----
const pay = (id, body, token = 'admin-token', booking = B1, extra = {}) => add('POST /api/bookings/:id/payments', id, { method: 'POST', path: `/api/bookings/${booking}/payments`, token, body, ...extra });
pay('valid deposit', validPayment);
pay('valid, defaults (status, currency)', { amount: 50, payment_type: 'balance', provider: 'manual' });
pay('pending payment with gateway references', { ...validPayment, status: 'pending', provider: 'paystack', gateway_reference: 'ref-1', gateway_transaction_id: 'tx-1' });
pay('exceeds remaining balance', { ...validPayment, amount: 5000 });
pay('invalid amount', { ...validPayment, amount: 'free' });
pay('zero amount', { ...validPayment, amount: 0 });
pay('invalid payment type', { ...validPayment, payment_type: 'gift' });
pay('missing provider', { ...validPayment, provider: undefined });
pay('invalid provider', { ...validPayment, provider: 'bitcoin' });
pay('duplicate gateway reference', { ...validPayment, provider: 'paystack', gateway_reference: 'dup' }, 'admin-token', B1, { twice: true });
pay('unknown booking', validPayment, 'admin-token', NOPE);
pay('no token', validPayment, null);
pay('staff without payments.manage', validPayment, 'staff-token');
pay('viewer', validPayment, 'viewer-token');
pay('owner', validPayment, 'owner-token');
pay('inactive admin', validPayment, 'inactive-token');

// ---- messages / blocked dates / settings ----
patch('PATCH /api/admin/messages/:id', 'mark read', `/api/admin/messages/${IDS.message1}`, 'admin-token', { status: 'read' });
patch('PATCH /api/admin/messages/:id', 'mark archived', `/api/admin/messages/${IDS.message2}`, 'admin-token', { status: 'archived' });
patch('PATCH /api/admin/messages/:id', 'invalid status', `/api/admin/messages/${IDS.message1}`, 'admin-token', { status: 'weird' });
patch('PATCH /api/admin/messages/:id', 'unknown message', `/api/admin/messages/${NOPE}`, 'admin-token', { status: 'read' });
patch('PATCH /api/admin/messages/:id', 'no token', `/api/admin/messages/${IDS.message1}`, undefined, { status: 'read' });
patch('PATCH /api/admin/messages/:id', 'staff (view only)', `/api/admin/messages/${IDS.message1}`, 'staff-token', { status: 'read' });
add('POST /api/admin/blocked-dates', 'valid', { method: 'POST', path: '/api/admin/blocked-dates', token: 'admin-token', body: { event_date: '2027-08-08', note: 'Private event' } });
add('POST /api/admin/blocked-dates', 'valid without note', { method: 'POST', path: '/api/admin/blocked-dates', token: 'admin-token', body: { event_date: '2027-08-09' } });
add('POST /api/admin/blocked-dates', 'duplicate date', { method: 'POST', path: '/api/admin/blocked-dates', token: 'admin-token', body: { event_date: '2027-05-01' } });
add('POST /api/admin/blocked-dates', 'invalid date', { method: 'POST', path: '/api/admin/blocked-dates', token: 'admin-token', body: { event_date: 'not-a-date' } });
add('POST /api/admin/blocked-dates', 'note too long', { method: 'POST', path: '/api/admin/blocked-dates', token: 'admin-token', body: { event_date: '2027-08-10', note: 'n'.repeat(300) } });
add('POST /api/admin/blocked-dates', 'no token', { method: 'POST', path: '/api/admin/blocked-dates', body: { event_date: '2027-08-08' } });
add('POST /api/admin/blocked-dates', 'staff (view only)', { method: 'POST', path: '/api/admin/blocked-dates', token: 'staff-token', body: { event_date: '2027-08-08' } });
add('DELETE /api/admin/blocked-dates/:eventDate', 'existing', { method: 'DELETE', path: '/api/admin/blocked-dates/2027-05-01', token: 'admin-token' });
add('DELETE /api/admin/blocked-dates/:eventDate', 'not blocked', { method: 'DELETE', path: '/api/admin/blocked-dates/2027-09-09', token: 'admin-token' });
add('DELETE /api/admin/blocked-dates/:eventDate', 'invalid date', { method: 'DELETE', path: '/api/admin/blocked-dates/tomorrow', token: 'admin-token' });
add('DELETE /api/admin/blocked-dates/:eventDate', 'no token', { method: 'DELETE', path: '/api/admin/blocked-dates/2027-05-01' });
add('DELETE /api/admin/blocked-dates/:eventDate', 'staff (view only)', { method: 'DELETE', path: '/api/admin/blocked-dates/2027-05-01', token: 'staff-token' });
const put = (id, token, body) => add('PUT /api/admin/settings', id, { method: 'PUT', path: '/api/admin/settings', token, body });
put('update existing and new keys', 'admin-token', { values: { contact_phone: '+44 1111', brand_tagline: 'New' } });
put('values not an object', 'admin-token', { values: 'nope' });
put('empty values', 'admin-token', { values: {} });
put('no token', undefined, { values: { a: 'b' } });
put('viewer', 'viewer-token', { values: { a: 'b' } });
put('staff', 'staff-token', { values: { a: 'b' } });
put('owner', 'owner-token', { values: { hero_title: 'Owner title' } });

// ---- users ----
get('GET /api/admin/users', 'manager lists users', '/api/admin/users', 'manager-token');
get('GET /api/admin/users', 'owner lists users', '/api/admin/users', 'owner-token');
get('GET /api/admin/users', 'admin without users.view', '/api/admin/users', 'admin-token');
get('GET /api/admin/users', 'no token', '/api/admin/users');
get('GET /api/admin/users', 'staff', '/api/admin/users', 'staff-token');
const mk = (id, token, body, extra = {}) => add('POST /api/admin/users', id, { method: 'POST', path: '/api/admin/users', token, body, ...extra });
mk('manager creates staff', 'manager-token', { email: 'New.Staff@Example.test', full_name: 'New Staff', role: 'staff', permissions: ['bookings.view'] });
mk('owner creates admin', 'owner-token', { email: 'new.admin@example.test', full_name: 'New Admin', role: 'admin', permissions: ['bookings.view', 'bookings.manage'] });
mk('owner creates owner', 'owner-token', { email: 'new.owner@example.test', full_name: 'New Owner', role: 'owner' });
mk('manager attempts to create an owner', 'manager-token', { email: 'x.owner@example.test', full_name: 'X', role: 'owner' });
mk('manager attempts to grant a permission they lack', 'manager-token', { email: 'y@example.test', full_name: 'Y', role: 'staff', permissions: ['payments.manage'] });
mk('invalid email', 'manager-token', { email: 'bad', full_name: 'Z', role: 'staff' });
mk('invalid role', 'manager-token', { email: 'z@example.test', full_name: 'Z', role: 'god' });
mk('missing name', 'manager-token', { email: 'z@example.test', full_name: '', role: 'staff' });
mk('unknown permission key', 'manager-token', { email: 'z@example.test', full_name: 'Z', role: 'staff', permissions: ['bookings.view', 'nuclear.launch'] });
mk('existing email', 'manager-token', { email: 'staff@example.test', full_name: 'Dup', role: 'staff' });
mk('inactive creation', 'manager-token', { email: 'dormant@example.test', full_name: 'Dormant', role: 'staff', is_active: false });
mk('no token', undefined, { email: 'a@example.test', full_name: 'A', role: 'staff' });
mk('admin without users.manage', 'admin-token', { email: 'a@example.test', full_name: 'A', role: 'staff' });
const up = (id, target, token, body) => patch('PATCH /api/admin/users/:id', id, `/api/admin/users/${target}`, token, body);
up('owner changes staff role to admin', IDS.targetStaff, 'owner-token', { role: 'admin' });
up('owner deactivates admin', IDS.targetAdmin, 'owner-token', { is_active: false });
up('owner changes permissions', IDS.targetStaff, 'owner-token', { permissions: ['bookings.view', 'messages.view'] });
up('manager edits staff permissions', IDS.targetStaff, 'manager-token', { permissions: ['bookings.view'] });
up('manager attempts to promote to owner', IDS.targetStaff, 'manager-token', { role: 'owner' });
up('manager attempts to edit the owner', IDS.owner, 'manager-token', { is_active: false });
up('manager attempts self role change', IDS.manager, 'manager-token', { role: 'owner' });
up('owner edits self role', IDS.owner, 'owner-token', { role: 'admin' });
up('invalid role', IDS.targetStaff, 'owner-token', { role: 'god' });
up('invalid is_active', IDS.targetStaff, 'owner-token', { is_active: 'maybe' });
up('unknown user', NOPE, 'owner-token', { role: 'admin' });
up('empty body', IDS.targetStaff, 'owner-token', {});
up('no token', IDS.targetStaff, undefined, { role: 'admin' });
up('admin without users.manage', IDS.targetStaff, 'admin-token', { role: 'admin' });
const del = (id, target, token) => add('DELETE /api/admin/users/:id', id, { method: 'DELETE', path: `/api/admin/users/${target}`, token });
del('owner deletes staff', IDS.targetStaff, 'owner-token');
del('manager deletes staff', IDS.targetStaff, 'manager-token');
del('manager attempts to delete admin', IDS.targetAdmin, 'manager-token');
del('manager attempts to delete the owner', IDS.owner, 'manager-token');
del('self deletion', IDS.manager, 'manager-token');
del('owner deletes self', IDS.owner, 'owner-token');
del('unknown user', NOPE, 'owner-token');
del('no token', IDS.targetStaff, undefined);
del('admin without users.manage', IDS.targetStaff, 'admin-token');

// ---- cross-cutting (not counted as routes) ----
add('CROSS', 'CORS preflight, allowed origin', { method: 'OPTIONS', path: '/api/bookings', origin: 'https://dfabulous.co.uk', extraHeaders: { 'access-control-request-method': 'POST' } });
add('CROSS', 'CORS preflight, staging origin from CORS_ALLOWED_ORIGINS', { method: 'OPTIONS', path: '/api/bookings', origin: 'https://staging.example.test', extraHeaders: { 'access-control-request-method': 'POST' } });
add('CROSS', 'CORS preflight, foreign origin', { method: 'OPTIONS', path: '/api/bookings', origin: 'https://evil.example', extraHeaders: { 'access-control-request-method': 'POST' } });
add('CROSS', 'simple request echoes allowed origin', { method: 'GET', path: '/api/services', origin: 'https://www.dfabulous.co.uk' });
add('CROSS', 'simple request, foreign origin', { method: 'GET', path: '/api/services', origin: 'https://evil.example' });
add('CROSS', 'ALL /api/settings returns 404', { method: 'GET', path: '/api/settings' });
add('CROSS', 'ALL /api/settings returns 404 (POST)', { method: 'POST', path: '/api/settings', body: {} });
add('CROSS', 'unknown API path', { method: 'GET', path: '/api/definitely-not-a-route' });
add('CROSS', 'wrong method on a known path', { method: 'PUT', path: '/api/services', body: {} });
add('CROSS', 'authorization header with non-Bearer scheme', { method: 'GET', path: '/api/admin/session', rawAuth: 'Basic abc' });
add('CROSS', 'service-role key presented as a bearer token', { method: 'GET', path: '/api/admin/session', token: 'parity-service-key-not-a-secret' });

export const SCENARIOS = S;

// ---- e-mail behaviour under other configurations and provider failures (booking and enquiry notifications) ----
export const CONFIGS = {
  default: {},
  'resend testing mode (all mail redirected to the sandbox address)': { RESEND_TESTING_MODE: 'true', RESEND_TESTING_EMAIL: 'sandbox@example.test' },
  'no Resend API key (notifications disabled)': { RESEND_API_KEY: '' },
  'sandbox sender onboarding@resend.dev (implicit testing mode)': { RESEND_FROM_EMAIL: 'onboarding@resend.dev', RESEND_TESTING_EMAIL: 'sandbox@example.test' },
};
const cfg = (config, route, id, spec) => S.push({ route, id: `${route} :: ${id} [${config.split(' ')[0]}]`, config, ...spec });
for (const config of Object.keys(CONFIGS).filter((c) => c !== 'default')) {
  cfg(config, 'POST /api/bookings', 'valid', { method: 'POST', path: '/api/bookings', body: validBooking });
  cfg(config, 'POST /api/messages', 'valid', { method: 'POST', path: '/api/messages', body: validMessage });
}
add('POST /api/bookings', 'valid, Resend rejects (500)', { method: 'POST', path: '/api/bookings', body: validBooking, fault: { resend: 500 } });
add('POST /api/messages', 'valid, Resend rejects (500)', { method: 'POST', path: '/api/messages', body: validMessage, fault: { resend: 500 } });
add('POST /api/bookings', 'valid, Resend rejects (422)', { method: 'POST', path: '/api/bookings', body: validBooking, fault: { resend: 422 } });
