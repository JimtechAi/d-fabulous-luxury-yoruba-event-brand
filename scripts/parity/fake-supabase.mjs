// In-memory fake of Supabase Auth + PostgREST + Resend, shared by BOTH backends under test (Express in Node, Edge Function in Deno).
// Pure JavaScript, no Node or Deno APIs, so the exact same fake serves both runtimes. No network, no credentials, no production data.
// Tables and columns come from the APPROVED schema (supabase/staging/install/01_production_schema.sql) so a query for a column the schema does not have fails
// the same way PostgREST would. It does NOT emulate RLS, CHECK constraints, triggers other than the two noted below, or PostgREST embedding: parity of the
// two backends is judged by what they SEND (credential class, table, filters, payload) and what they return, under identical data.

export const SUPABASE_URL = 'https://parity.supabase.co';
export const ANON_KEY = 'parity-anon-key-not-a-secret';
export const SERVICE_KEY = 'parity-service-key-not-a-secret';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const IDS = {
  owner: uuid(1), admin: uuid(2), staff: uuid(3), viewer: uuid(4), inactive: uuid(5), manager: uuid(6), targetStaff: uuid(7), targetAdmin: uuid(8),
  booking1: uuid(101), booking2: uuid(102), booking3: uuid(103), booking4: uuid(104), payment1: uuid(201), message1: uuid(301), message2: uuid(302),
};
/** token -> auth user id (an unknown token is an invalid JWT). */
export const TOKENS = {
  'owner-token': IDS.owner, 'admin-token': IDS.admin, 'staff-token': IDS.staff, 'viewer-token': IDS.viewer, 'inactive-token': IDS.inactive,
  'manager-token': IDS.manager, 'target-staff-token': IDS.targetStaff, 'target-admin-token': IDS.targetAdmin,
};

/** Parses CREATE TABLE statements of the pg_dump into { table: { columns: {name: {notNull, def}} , pk: [] , unique: [[]] } }. */
export function parseSchema(sql) {
  const tables = {};
  for (const m of sql.matchAll(/CREATE TABLE "public"\."(\w+)" \(\r?\n([\s\S]*?)\r?\n\);/g)) {
    const columns = {};
    for (const line of m[2].split(/\r?\n/)) {
      const c = line.trim().match(/^"(\w+)" ("?[\w ]+"?(?:\[\])?(?:\([\d,]+\))?(?: with(?:out)? time zone)?)(?: DEFAULT (.+?))?( NOT NULL)?,?$/);
      if (c) columns[c[1]] = { notNull: Boolean(c[4]), def: c[3] ?? null };
    }
    tables[m[1]] = { columns, pk: [], unique: [] };
  }
  for (const m of sql.matchAll(/ALTER TABLE ONLY "public"\."(\w+)"\r?\n\s+ADD CONSTRAINT "(\w+)" (PRIMARY KEY|UNIQUE) \(([^)]*)\)/g)) {
    const cols = m[4].split(',').map((s) => s.trim().replace(/"/g, ''));
    (tables[m[1]].constraints ??= []).push({ name: m[2], cols });
    if (m[3] === 'PRIMARY KEY') tables[m[1]].pk = cols; else tables[m[1]].unique.push(cols);
  }
  return tables;
}

const json = (status, body, headers = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const pgError = (status, code, message, details = null) => json(status, { code, details, hint: null, message });

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function cmp(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' || typeof b === 'number') { const na = Number(a); const nb = Number(b); return na < nb ? -1 : na > nb ? 1 : 0; }
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

export function seed() {
  const now = '2026-01-01T10:00:00.000Z';
  const profile = (id, email, role, is_active = true, full_name = null) => ({ id, email, full_name: full_name ?? email.split('@')[0], role, is_active, created_at: now, updated_at: now });
  return {
    profiles: [
      profile(IDS.owner, 'owner@example.test', 'owner'), profile(IDS.admin, 'admin@example.test', 'admin'), profile(IDS.staff, 'staff@example.test', 'staff'),
      profile(IDS.viewer, 'viewer@example.test', 'user'), profile(IDS.inactive, 'inactive@example.test', 'admin', false), profile(IDS.manager, 'manager@example.test', 'admin'),
      profile(IDS.targetStaff, 'target-staff@example.test', 'staff'), profile(IDS.targetAdmin, 'target-admin@example.test', 'admin'),
    ],
    permissions: ['bookings.view', 'bookings.manage', 'messages.view', 'messages.manage', 'payments.view', 'payments.manage', 'testimonials.view', 'testimonials.manage', 'gallery.view', 'gallery.manage', 'services.view', 'services.manage', 'settings.view', 'settings.manage', 'users.view', 'users.manage', 'diagnostics.view'].map((permission_key) => ({ permission_key, description: permission_key, created_at: now })),
    user_permissions: [
      ...['bookings.view', 'bookings.manage', 'payments.view', 'payments.manage', 'messages.view', 'messages.manage', 'services.view', 'settings.view', 'settings.manage'].map((k) => ({ user_id: IDS.admin, permission_key: k, created_at: now })),
      ...['users.view', 'users.manage', 'bookings.view', 'messages.view'].map((k) => ({ user_id: IDS.manager, permission_key: k, created_at: now })),
      { user_id: IDS.staff, permission_key: 'bookings.view', created_at: now },
      { user_id: IDS.inactive, permission_key: 'bookings.manage', created_at: now },
      { user_id: IDS.targetStaff, permission_key: 'bookings.view', created_at: now },
      { user_id: IDS.targetAdmin, permission_key: 'bookings.manage', created_at: now },
    ],
    bookings: [
      { id: IDS.booking1, user_id: null, full_name: 'Ada Pending', email: 'ada@example.test', phone: '+441234567890', event_date: '2027-03-10', event_location: 'London', services_requested: ['catering'], estimated_guest_count: 100, celebration_details: 'Wedding', status: 'pending', created_at: now, updated_at: now, booking_amount: 1000, currency: 'GBP', booking_reference: 'DF-0001', completed_at: null, archived_at: null },
      { id: IDS.booking2, user_id: null, full_name: 'Bola Confirmed', email: 'bola@example.test', phone: null, event_date: '2027-04-20', event_location: 'Lagos', services_requested: [], estimated_guest_count: 250, celebration_details: null, status: 'confirmed', created_at: now, updated_at: now, booking_amount: 0, currency: 'GBP', booking_reference: 'DF-0002', completed_at: null, archived_at: null },
      { id: IDS.booking3, user_id: null, full_name: 'Chi Archived', email: 'chi@example.test', phone: null, event_date: '2026-09-01', event_location: 'Abuja', services_requested: [], estimated_guest_count: 50, celebration_details: null, status: 'archived', created_at: now, updated_at: now, booking_amount: 500, currency: 'NGN', booking_reference: 'DF-0003', completed_at: null, archived_at: '2026-06-01T00:00:00.000Z' },
      { id: IDS.booking4, user_id: null, full_name: 'Dele Completed', email: 'dele@example.test', phone: null, event_date: '2026-07-01', event_location: 'Ibadan', services_requested: [], estimated_guest_count: 80, celebration_details: null, status: 'completed', created_at: now, updated_at: now, booking_amount: 0, currency: 'GBP', booking_reference: 'DF-0004', completed_at: '2026-07-02T00:00:00.000Z', archived_at: null },
    ],
    payments: [{ id: IDS.payment1, booking_id: IDS.booking1, user_id: IDS.admin, amount: 400, currency: 'GBP', payment_type: 'deposit', provider: 'manual', status: 'successful', gateway_reference: null, gateway_transaction_id: null, payment_method: 'cash', customer_email: 'ada@example.test', metadata: {}, paid_at: now, created_at: now, updated_at: now }],
    messages: [
      { id: IDS.message1, full_name: 'Dayo', email: 'dayo@example.test', phone: null, subject: 'Hello', message: 'Question about packages', status: 'new', created_at: now, updated_at: now },
      { id: IDS.message2, full_name: 'Efe', email: 'efe@example.test', phone: null, subject: null, message: 'Another question', status: 'read', created_at: now, updated_at: now },
    ],
    blocked_dates: [{ event_date: '2027-05-01', note: 'Owner holiday', created_by: IDS.owner, created_at: now }],
    services: [
      { id: uuid(401), slug: 'wedding-planning', title: 'Wedding planning', short_description: 'Weddings', category: 'weddings', is_active: true, display_order: 1, created_at: now, updated_at: now },
      { id: uuid(402), slug: 'hidden', title: 'Hidden', short_description: 'Hidden', category: 'other', is_active: false, display_order: 2, created_at: now, updated_at: now },
    ],
    gallery: [{ id: uuid(501), title: 'Gala', image_url: 'https://img.example.test/1.jpg', alt_text: 'Gala', category: 'events', caption: 'A gala', aspect_ratio: 'landscape', is_featured: true, display_order: 1, created_at: now, updated_at: now }],
    testimonials: [{ id: uuid(601), quote: 'Wonderful', client_names: 'A & B', event_type: 'wedding', location: 'London', rating: 5, is_featured: true, is_placeholder: false, display_order: 1, created_at: now, updated_at: now }],
    site_settings: [{ id: uuid(701), key: 'contact_phone', value: '+44 0000', description: null, updated_by: null, updated_at: now }, { id: uuid(702), key: 'hero_title', value: 'Welcome', description: null, updated_by: null, updated_at: now }],
    audit_logs: [],
  };
}

function evalDefault(def, state) {
  if (def === null) return undefined;
  if (/gen_random_uuid/.test(def)) return uuid(1000 + (state.__uuid = (state.__uuid ?? 0) + 1));
  if (/\bnow\b/.test(def)) return state.__now();
  const lit = def.match(/^'(.*)'::"?[\w\[\]]+"?(?:\[\])?$/s);
  if (lit) return lit[1] === '{}' && /\[\]$/.test(def) ? [] : lit[1] === '{}' ? {} : lit[1];
  const num = def.match(/^\(?(-?[\d.]+)\)?(?:::\w+)?$/);
  if (num) return Number(num[1]);
  if (def === 'true') return true;
  if (def === 'false') return false;
  return undefined;
}

export function createFake({ schema }) {
  let state; let log; let counters; let buckets = {}; let fault = {};
  // Rate-limit buckets live across scenarios (the Express limiter does too); `reset(true)` clears them, and the driver does so whenever it restarts Express.
  const reset = (hard = false) => {
    fault = {};
    if (hard) buckets = {};
    state = seed(); counters = { booking: 4, user: 0, email: 0, clock: 0 };
    for (const [table, rows] of Object.entries(state)) if (schema[table]) state[table] = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k in schema[table].columns)));
    state.__now = () => `2026-11-12T09:00:${String(counters.clock++ % 60).padStart(2, '0')}.000Z`;
    log = { db: [], emails: [], auth: [], unhandled: [] };
  };
  reset();

  const classify = (headers) => {
    const key = headers.get('apikey') ?? '';
    const bearer = (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (key === SERVICE_KEY || bearer === SERVICE_KEY) return 'service-role';
    if (bearer === ANON_KEY || bearer === '') return 'anon';
    return 'user-jwt';
  };

  const parseFilter = (name, raw) => {
    const dot = raw.indexOf('.');
    let op = raw.slice(0, dot); let val = raw.slice(dot + 1); let negate = false;
    if (op === 'not') { negate = true; const d2 = val.indexOf('.'); op = val.slice(0, d2); val = val.slice(d2 + 1); }
    return { col: name, op, val, negate };
  };
  const matches = (row, f) => {
    const v = row[f.col];
    let ok;
    switch (f.op) {
      case 'eq': ok = v !== null && v !== undefined && String(v) === f.val; break;
      case 'neq': ok = !(v !== null && v !== undefined && String(v) === f.val); break;
      case 'in': ok = f.val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(v)); break;
      case 'gte': ok = v != null && cmp(v, f.val) >= 0; break;
      case 'lte': ok = v != null && cmp(v, f.val) <= 0; break;
      case 'gt': ok = v != null && cmp(v, f.val) > 0; break;
      case 'lt': ok = v != null && cmp(v, f.val) < 0; break;
      case 'is': ok = f.val === 'null' ? v === null || v === undefined : String(v) === f.val; break;
      case 'ilike': case 'like': ok = new RegExp(`^${f.val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, f.op === 'ilike' ? 'i' : '').test(String(v ?? '')); break;
      default: throw Object.assign(new Error(`unsupported filter ${f.op}`), { unsupported: true });
    }
    return f.negate ? !ok : ok;
  };

  const missingColumns = (table, names) => { const cols = schema[table]?.columns ?? {}; const bad = names.filter((n) => !(n in cols)); return bad.length ? bad : null; };
  const project = (row, select) => {
    if (!select || select === '*') return clone(row);
    const out = {};
    for (const c of select.split(',').map((s) => s.trim()).filter(Boolean)) out[c] = clone(row[c] ?? null);
    return out;
  };

  const makeRow = (table, input) => {
    const t = schema[table];
    const row = {};
    for (const [name, col] of Object.entries(t.columns)) {
      if (name in input) row[name] = input[name];
      else { const d = evalDefault(col.def, state); row[name] = d === undefined ? null : d; }
    }
    if (table === 'bookings' && (row.booking_reference === null || String(row.booking_reference).trim() === '')) row.booking_reference = `DF-${String(++counters.booking).padStart(4, '0')}`;
    for (const [name, col] of Object.entries(t.columns)) if (col.notNull && (row[name] === null || row[name] === undefined)) throw { status: 400, code: '23502', message: `null value in column "${name}" of relation "${table}" violates not-null constraint` };
    return row;
  };
  const checkConstraints = (table, row, replacing) => {
    const t = schema[table];
    const others = state[table].filter((r) => r !== replacing);
    for (const cols of [t.pk, ...t.unique].filter((c) => c.length)) {
      if (cols.every((c) => row[c] === null || row[c] === undefined)) continue;
      if (others.some((r) => cols.every((c) => String(r[c]) === String(row[c])))) {
        const name = (t.constraints ?? []).find((k) => k.cols.join() === cols.join())?.name ?? `${table}_${cols.join('_')}_key`;
        // same wording as PostgreSQL / PostgREST, so error classification is exercised on realistic errors
        throw { status: 409, code: '23505', message: `duplicate key value violates unique constraint "${name}"`, details: `Key (${cols.join(', ')})=(${cols.map((c) => row[c]).join(', ')}) already exists.` };
      }
    }
    if (table === 'audit_logs') for (const c of ['actor_user_id', 'target_user_id']) if (row[c] && !state.profiles.some((p) => p.id === row[c])) throw { status: 409, code: '23503', message: `insert or update on table "audit_logs" violates foreign key constraint on ${c}` };
    if (table === 'payments' && !state.bookings.some((b) => b.id === row.booking_id)) throw { status: 409, code: '23503', message: 'payments_booking_id_fkey' };
    if (table === 'bookings' && ['pending', 'confirmed'].includes(String(row.status ?? 'pending').toLowerCase()) && state.blocked_dates.some((d) => d.event_date === row.event_date)) throw { status: 400, code: 'P0001', message: 'This date is unavailable. Please select another event date.' };
  };

  async function handle(request) {
    const url = new URL(request.url);
    const text = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
    const cred = classify(request.headers);
    if (url.hostname === 'api.resend.com') {
      const body = text ? JSON.parse(text) : {};
      log.emails.push({ method: request.method, path: url.pathname, authorized: /^Bearer .+/.test(request.headers.get('authorization') ?? ''), from: body.from, to: [].concat(body.to ?? []), subject: body.subject, reply_to: body.reply_to ?? body.replyTo ?? null, has_html: typeof body.html === 'string' && body.html.length > 0, has_text: typeof body.text === 'string' && body.text.length > 0, html: body.html ?? null, text: body.text ?? null, rejected: Boolean(fault.resend) });
      if (fault.resend) return json(fault.resend, { name: 'application_error', message: 'simulated provider failure', statusCode: fault.resend });
      return json(200, { id: `email-${++counters.email}` });
    }
    if (url.hostname !== new URL(SUPABASE_URL).hostname) { log.unhandled.push(`${request.method} ${url.href}`); throw new TypeError(`fake: unexpected host ${url.hostname}`); }

    if (url.pathname === '/auth/v1/user' && request.method === 'GET') {
      const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const id = TOKENS[token];
      log.auth.push({ call: 'getUser', cred, token_known: Boolean(id) });
      if (!id) return json(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
      const p = state.profiles.find((r) => r.id === id);
      return json(200, { id, aud: 'authenticated', role: 'authenticated', email: p?.email ?? `${id}@example.test`, user_metadata: {}, app_metadata: {} });
    }
    if (url.pathname === '/auth/v1/admin/users' && request.method === 'POST') {
      const b = JSON.parse(text || '{}');
      log.auth.push({ call: 'admin.createUser', cred, email: b.email, email_confirm: b.email_confirm ?? null, has_password: typeof b.password === 'string' && b.password.length > 0, user_metadata: b.user_metadata ?? null });
      if (state.profiles.some((p) => p.email === b.email) || (state.__authUsers ?? []).some((u) => u.email === b.email)) return json(422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
      const id = uuid(900 + ++counters.user);
      (state.__authUsers ??= []).push({ id, email: b.email });
      return json(200, { id, email: b.email, user_metadata: b.user_metadata ?? {}, app_metadata: {}, aud: 'authenticated', role: 'authenticated', created_at: state.__now() });
    }

    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (rpc) {
      log.db.push({ cred, op: 'RPC', table: rpc[1], filters: [], body: text ? JSON.parse(text) : null });
      if (rpc[1] === 'consume_rate_limit') {
        const b = text ? JSON.parse(text) : {};
        buckets[b.p_bucket_key] = (buckets[b.p_bucket_key] ?? 0) + 1;
        return json(200, buckets[b.p_bucket_key] <= b.p_limit);
      }
      log.unhandled.push(`RPC ${rpc[1]}`); return pgError(404, 'PGRST202', `no such function ${rpc[1]}`);
    }
    const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (!m) { log.unhandled.push(`${request.method} ${url.pathname}`); return pgError(404, 'PGRST000', 'not handled'); }
    const table = m[1];
    if (!schema[table]) { log.db.push({ cred, op: request.method, table, filters: [], body: null, error: '42P01' }); return pgError(404, '42P01', `relation "public.${table}" does not exist`); }

    const filters = []; const params = {};
    for (const [k, v] of url.searchParams) { if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) params[k] = v; else filters.push(parseFilter(k, v)); }
    const prefer = request.headers.get('prefer') ?? '';
    const accept = request.headers.get('accept') ?? '';
    const wantsRep = /return=representation/.test(prefer);
    const body = text ? JSON.parse(text) : null;
    const entry = { cred, op: request.method, table, filters: filters.map((f) => `${f.negate ? 'not.' : ''}${f.col}.${f.op}.${f.val}`).sort(), select: params.select ?? null, order: params.order ?? null, limit: params.limit ?? null, upsert: /merge-duplicates|ignore-duplicates/.test(prefer) ? (params.on_conflict ?? true) : null, single: /pgrst\.object/.test(accept), body: clone(body) };
    log.db.push(entry);

    try {
      const badFilter = missingColumns(table, filters.map((f) => f.col)); if (badFilter) { entry.error = '42703'; return pgError(400, '42703', `column ${table}.${badFilter[0]} does not exist`); }
      if (params.select && params.select !== '*') { const bad = missingColumns(table, params.select.split(',').map((s) => s.trim()).filter(Boolean)); if (bad) { entry.error = '42703'; return pgError(400, '42703', `column ${table}.${bad[0]} does not exist`); } }
      const rows = state[table];
      const respondRows = (list, status) => {
        const out = list.map((r) => project(r, params.select));
        if (/pgrst\.object/.test(accept)) { if (out.length !== 1) return pgError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned', `The result contains ${out.length} rows`); return json(status, out[0]); }
        return json(status, out);
      };
      if (request.method === 'GET') {
        let list = rows.filter((r) => filters.every((f) => matches(r, f)));
        if (params.order) for (const o of params.order.split(',').reverse()) { const [col, dir] = o.split('.'); list = [...list].sort((a, b) => (dir === 'desc' ? -1 : 1) * cmp(a[col], b[col])); }
        if (params.offset) list = list.slice(Number(params.offset));
        if (params.limit) list = list.slice(0, Number(params.limit));
        return respondRows(list, 200);
      }
      if (request.method === 'POST') {
        const inputs = Array.isArray(body) ? body : [body];
        const badCols = missingColumns(table, [...new Set(inputs.flatMap((i) => Object.keys(i)))]); if (badCols) { entry.error = 'PGRST204'; return pgError(400, 'PGRST204', `Could not find the '${badCols[0]}' column of '${table}' in the schema cache`); }
        const created = []; const staged = rows.slice();
        for (const input of inputs) {
          const row = makeRow(table, input);
          const conflictCols = typeof params.on_conflict === 'string' ? params.on_conflict.split(',') : schema[table].pk;
          const existing = /merge-duplicates/.test(prefer) ? staged.find((r) => conflictCols.every((c) => String(r[c]) === String(row[c]))) : null;
          if (existing) { const merged = { ...existing }; for (const k of Object.keys(input)) merged[k] = row[k]; checkConstraints(table, merged, existing); Object.assign(existing, merged); created.push(existing); continue; }
          if (/ignore-duplicates/.test(prefer) && staged.find((r) => conflictCols.every((c) => String(r[c]) === String(row[c])))) continue;
          checkConstraints(table, row, null);
          staged.push(row); created.push(row);
        }
        state[table] = staged;
        return wantsRep ? respondRows(created, 201) : new Response(null, { status: 201 });
      }
      if (request.method === 'PATCH') {
        const badCols = missingColumns(table, Object.keys(body ?? {})); if (badCols) { entry.error = 'PGRST204'; return pgError(400, 'PGRST204', `Could not find the '${badCols[0]}' column of '${table}' in the schema cache`); }
        const target = rows.filter((r) => filters.every((f) => matches(r, f)));
        const updated = [];
        for (const r of target) { const next = { ...r, ...clone(body) }; checkConstraints(table, next, r); Object.assign(r, next); updated.push(r); }
        return wantsRep ? respondRows(updated, 200) : new Response(null, { status: 204 });
      }
      if (request.method === 'DELETE') {
        const target = rows.filter((r) => filters.every((f) => matches(r, f)));
        state[table] = rows.filter((r) => !target.includes(r));
        if (table === 'profiles') {
          for (const r of target) {
            state.user_permissions = state.user_permissions.filter((u) => u.user_id !== r.id);
            for (const [t, cols] of Object.entries({ audit_logs: ['actor_user_id', 'target_user_id'], bookings: ['user_id'], payments: ['user_id'] })) for (const row of state[t]) for (const c of cols) if (row[c] === r.id) row[c] = null;
          }
        }
        if (table === 'bookings') state.payments = state.payments.filter((p) => !target.some((b) => b.id === p.booking_id));
        return wantsRep ? respondRows(target, 200) : new Response(null, { status: 204 });
      }
      log.unhandled.push(`${request.method} ${table}`); return pgError(405, 'PGRST000', 'method');
    } catch (error) {
      if (error?.unsupported) { log.unhandled.push(error.message); return pgError(400, 'PGRST100', error.message); }
      if (error?.code) { entry.error = error.code; return pgError(error.status ?? 400, error.code, error.message, error.details ?? null); }
      throw error;
    }
  }

  return {
    fetch: (input, init) => handle(new Request(input, init)),
    reset,
    setFault: (f) => { fault = { ...fault, ...f }; },
    getLog: () => ({ db: clone(log.db), emails: clone(log.emails), auth: clone(log.auth), unhandled: clone(log.unhandled) }),
    snapshot: () => { const out = {}; for (const [k, v] of Object.entries(state)) if (!k.startsWith('__')) out[k] = clone(v); out.__authUsers = clone(state.__authUsers ?? []); return out; },
  };
}
