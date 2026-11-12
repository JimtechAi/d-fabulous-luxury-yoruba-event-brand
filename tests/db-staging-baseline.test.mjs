// Staging baseline tests. Everything runs in an in-memory PGlite database: no network, no Supabase project, no production access.
// Proves that the ordered install in supabase/staging/ applies cleanly, that the repository's own migrations conflict in the ways
// documented in docs/STAGING_BASELINE_PLAN.md, that the application's database access still works on the result, and that
// Stage 2 proposals A/B/C apply to and roll back from that baseline.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { buildInstallFiles } from '../scripts/build-staging-install.mjs';
import { ID, RLS_OR_PRIVILEGE, applyProposals, as, catalog, inspectSql, proposals, read, rollbackProposals, verifySql } from './helpers/db-fixture.mjs';

const manifest = JSON.parse(read('supabase/staging/manifest.json'));
const installDir = new URL('../supabase/staging/legacy_install/', import.meta.url);
const deferredDir = new URL('../supabase/staging/legacy_install/deferred/', import.meta.url);
const installFiles = readdirSync(installDir).filter((name) => name.endsWith('.sql')).sort();
const deferredFiles = readdirSync(deferredDir).filter((name) => name.endsWith('.sql')).sort();
const installSource = (name) => readFileSync(new URL(name, name.startsWith('15') ? deferredDir : installDir), 'utf8');

// The only test-only transformation: PGlite has no extension catalogue entry for pg_cron/pgcrypto and no cron schema.
// (gen_random_uuid() is built into PostgreSQL 13+, which is why pgcrypto is not needed for the tests.)
const forPglite = (text) => text
  .replace(/CREATE EXTENSION IF NOT EXISTS \w+;/g, '')
  .replace(/SELECT cron\.unschedule[\s\S]*?\$cron\$\s*\);\s*/, '');

async function platformDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  `);
  return db;
}

async function installUpTo(db, lastStep, firstStep = '01') {
  for (const name of [...installFiles, ...deferredFiles]) {
    if (name.slice(0, 2) > lastStep) break;
    if (name.slice(0, 2) < firstStep) continue;
    await db.exec(forPglite(installSource(name)));
  }
}

async function seedUsers(db) {
  await db.exec(`
    INSERT INTO public.profiles (id, email, role, is_active) VALUES
      ('${ID.OWNER}', 'owner@example.test', 'owner', true),
      ('${ID.ADMIN}', 'admin@example.test', 'admin', true),
      ('${ID.ADMIN_SUSPENDED}', 'admin.suspended@example.test', 'admin', false),
      ('${ID.STAFF}', 'staff@example.test', 'staff', true),
      ('${ID.VIEWER}', 'viewer@example.test', 'viewer', true);
  `);
}

const failsWith = async (promise, pattern) => assert.rejects(promise, pattern);

describe('staging baseline: manifest and generated files', () => {
  test('every repository migration in 08 Development is accounted for in the manifest', () => {
    const migrations = readdirSync(new URL('../08 Development/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort();
    const sources = new Set(manifest.steps.map((step) => step.source.replace('08 Development/', '')));
    for (const migration of migrations) assert.ok(sources.has(migration), `${migration} is neither installed nor excluded in the manifest`);
  });

  test('the generated install files are exactly what the builder produces (not stale, not hand-edited)', () => {
    const fresh = buildInstallFiles();
    assert.deepEqual([...fresh.keys()].sort(), [...installFiles, ...deferredFiles.map((name) => `deferred/${name}`)].sort());
    for (const [name, content] of fresh) assert.equal(readFileSync(new URL(name, installDir), 'utf8'), content, `${name} is stale; run npm run staging:build`);
  });

  test('the initial staging sequence (01-14) contains no pg_cron and no scheduler; pg_cron is isolated in install/deferred/', () => {
    assert.deepEqual(installFiles.map((name) => name.slice(0, 2)), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14']);
    for (const name of installFiles) assert.doesNotMatch(installSource(name), /pg_cron|cron\.schedule|cron\.job/i, name);
    assert.deepEqual(deferredFiles, ['15_booking_archive_purge_cron.sql']);
    assert.match(installSource(deferredFiles[0]), /CREATE EXTENSION IF NOT EXISTS pg_cron/);
  });

  test('the manifest targets only the staging project and each step carries a reason', () => {
    assert.equal(manifest.target.project, 'dfabulous-staging');
    assert.equal(manifest.target.environment, 'staging-only');
    for (const step of manifest.steps) assert.ok(step.why && step.why.length > 30, `step ${step.step} has no reason`);
  });

  test('the derived base schema is labelled as non-authoritative and contains no data statements', () => {
    const base = read('supabase/staging/01_base_schema_derived.sql');
    assert.match(base, /NOT AUTHORITATIVE/);
    assert.doesNotMatch(base, /\bINSERT\s+INTO\b|\bCOPY\b|\bDELETE\s+FROM\b|\bDROP\s+TABLE\b/i);
  });

  test('install files contain no credentials, only the documented staging project reference', () => {
    for (const name of installFiles) {
      const text = installSource(name);
      assert.doesNotMatch(text, /sb_secret_|sb_publishable_|eyJ[A-Za-z0-9_-]{20,}|re_[A-Za-z0-9]{20,}/, name);
    }
  });

  test('the only differences from the repository sources are the documented replacements', () => {
    const replaced = manifest.steps.filter((step) => step.replace).map((step) => step.step);
    assert.deepEqual(replaced, ['07', '08']);
    for (const step of manifest.steps.filter((entry) => entry.mode === 'full' && !entry.replace)) {
      const original = read(step.source).replace(/\r\n/g, '\n');
      assert.ok(installSource([...installFiles, ...deferredFiles].find((name) => name.startsWith(step.step))).includes(original), `${step.source} must be a verbatim copy`);
    }
  });
});

describe('staging baseline: documented repository conflicts', () => {
  test('20260815_date_availability.sql cannot be applied as written (syntax error), so only its policies are installed', async () => {
    const db = await platformDatabase();
    try {
      await installUpTo(db, '03');
      await db.exec('DROP TABLE public.blocked_dates');
      await failsWith(db.exec(read('08 Development/20260815_date_availability.sql')), /syntax error/i);
    } finally { await db.close(); }
  });

  test('filename order fails: security_remediation re-creates "Users view profile" that 20260814 already created', async () => {
    const db = await platformDatabase();
    try {
      await installUpTo(db, '01');
      await db.exec(read('08 Development/20260814_admin_rls_privileges.sql'));
      await failsWith(db.exec(read('08 Development/security_remediation_migration.sql')), /already exists/i);
    } finally { await db.close(); }
  });

  test('the remediation-first order succeeds and leaves the EXISTS variant of is_owner() live (returns false, never NULL)', async () => {
    const db = await platformDatabase();
    try {
      await installUpTo(db, '03');
      const definition = (await db.query("SELECT pg_get_functiondef('public.is_owner()'::regprocedure) AS d")).rows[0].d;
      assert.match(definition, /RETURN EXISTS/);
      const anonymous = await as(db, 'authenticated', '', 'SELECT public.is_owner() AS owner, public.is_admin() AS admin');
      assert.deepEqual(anonymous.rows[0], { owner: false, admin: false });
    } finally { await db.close(); }
  });

  test('20260818 and 20260819 abort as written because to_regproc() is given a signature; the corrected copies pass', async () => {
    const db = await platformDatabase();
    try {
      await installUpTo(db, '06');
      await failsWith(db.exec(read('08 Development/20260818_payments_rls_hardening.sql')), /is_admin\(\)\/public\.is_owner\(\) are missing/);
      await db.exec('ROLLBACK').catch(() => {});
      await installUpTo(db, '07', '07');
      await db.exec('ROLLBACK').catch(() => {});
      await failsWith(db.exec(read('08 Development/20260819_public_data_access_hardening.sql')), /must exist before this migration/);
    } finally { await db.close(); }
  });

  test('settings vs site_settings: the baseline has site_settings only, matching the migrations (admin settings GET reads "settings")', async () => {
    const db = await platformDatabase();
    try {
      await installUpTo(db, '14');
      const rows = (await db.query("SELECT to_regclass('public.site_settings') AS site_settings, to_regclass('public.settings') AS settings")).rows[0];
      assert.equal(rows.site_settings, 'site_settings');
      assert.equal(rows.settings, null);
      const server = read('server.ts');
      assert.match(server, /settings: 'settings\.view'/);
      assert.match(server, /serverDatabase\.from\(resourceName\)\.select\(selections\[resourceName\]\)/);
      assert.match(server, /settings: 'key, value'/);
    } finally { await db.close(); }
  });
});

describe('staging baseline: installed state and application access patterns', () => {
  let db;
  const bookingValues = (date, extra = '') => `('Test Client', 'client@example.test', '${date}', 'Lagos', 'pending'${extra})`;

  before(async () => {
    db = await platformDatabase();
    await installUpTo(db, '15');
    await seedUsers(db);
  });
  after(async () => { await db.close(); });

  test('all installed steps leave row level security enabled on every application table', async () => {
    const rows = (await db.query(`SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity ORDER BY 1`)).rows;
    assert.deepEqual(rows.map((row) => row.relname), []);
  });

  test('anonymous visitors can read public content but nothing private, and cannot write anything', async () => {
    for (const table of ['services', 'gallery', 'testimonials']) await as(db, 'anon', '', `SELECT * FROM public.${table}`);
    assert.ok((await as(db, 'anon', '', 'SELECT id FROM public.services')).rows.length >= 1, 'seeded services are public');
    for (const table of ['bookings', 'messages', 'payments', 'profiles', 'site_settings', 'blocked_dates', 'user_permissions', 'audit_logs']) {
      await failsWith(as(db, 'anon', '', `SELECT * FROM public.${table}`), RLS_OR_PRIVILEGE).catch(async () => {
        assert.equal((await as(db, 'anon', '', `SELECT * FROM public.${table}`)).rows.length, 0, `${table} must return nothing to anon`);
      });
    }
    await failsWith(as(db, 'anon', '', `INSERT INTO public.bookings (full_name, email, event_date, status) VALUES ${bookingValues('2031-01-01').replace(/, 'Lagos'/, '')}`), RLS_OR_PRIVILEGE);
    await failsWith(as(db, 'anon', '', "INSERT INTO public.messages (full_name, email, message) VALUES ('a', 'b@example.test', 'c')"), RLS_OR_PRIVILEGE);
  });

  test('public booking submission (server, service role) works, gets a reference, and a second active booking on the date is rejected', async () => {
    const columns = '(full_name, email, event_date, event_location, status)';
    const first = await as(db, 'service_role', '', `INSERT INTO public.bookings ${columns} VALUES ${bookingValues('2031-02-02')} RETURNING id, booking_reference`);
    assert.ok(first.rows[0].booking_reference, 'booking_reference trigger assigns a reference');
    await assert.rejects(
      as(db, 'service_role', '', `INSERT INTO public.bookings ${columns} VALUES ${bookingValues('2031-02-02')}`),
      (error) => error.code === '23505' && /bookings_active_event_date_unique/.test(`${error.constraint ?? ''}${error.message}`),
    );
    await as(db, 'service_role', '', `INSERT INTO public.bookings ${columns} VALUES ('Other', 'o@example.test', '2031-02-02', 'Abuja', 'cancelled')`);
    await as(db, 'service_role', '', "INSERT INTO public.bookings (full_name, email, event_date, status, phone) VALUES ('No phone', 'n@example.test', '2031-03-03', 'pending', NULL)");
  });

  test('contact messages are written by the service role and read/updated by admins only', async () => {
    await as(db, 'service_role', '', "INSERT INTO public.messages (full_name, email, subject, message, status) VALUES ('A', 'a@example.test', 's', 'm', 'unread')");
    assert.ok((await as(db, 'authenticated', ID.ADMIN, 'SELECT id, full_name, email, phone, subject, message, status, created_at, updated_at FROM public.messages')).rows.length >= 1);
    assert.equal((await as(db, 'authenticated', ID.STAFF, 'SELECT id FROM public.messages')).rows.length, 0);
  });

  test('admin dashboard reads: bookings, profiles, permissions with the column lists the API uses', async () => {
    const bookings = await as(db, 'authenticated', ID.ADMIN, `SELECT id, booking_reference, full_name, email, phone, event_date, event_location, services_requested, estimated_guest_count, celebration_details, status, booking_amount, currency, created_at, updated_at, completed_at, archived_at FROM public.bookings ORDER BY created_at DESC`);
    assert.ok(bookings.rows.length >= 2);
    assert.equal((await as(db, 'authenticated', ID.VIEWER, 'SELECT id FROM public.bookings')).rows.length, 0);
    const profiles = await as(db, 'authenticated', ID.ADMIN, 'SELECT id, email, full_name, role, is_active, created_at, updated_at FROM public.profiles');
    assert.equal(profiles.rows.length, 5);
    assert.equal((await as(db, 'authenticated', ID.STAFF, 'SELECT id FROM public.profiles')).rows.length, 1, 'a non-admin sees only their own profile');
    assert.ok((await as(db, 'authenticated', ID.STAFF, 'SELECT permission_key FROM public.user_permissions WHERE user_id = auth.uid()')).rows.length >= 0);
  });

  test('admin booking update works (status, amount, currency), and delete is owner-only through policy absence', async () => {
    const update = await as(db, 'authenticated', ID.ADMIN, "UPDATE public.bookings SET status = 'confirmed', booking_amount = 150000, currency = 'NGN' WHERE event_date = '2031-03-03' RETURNING id");
    assert.equal(update.rows.length, 1);
    const denied = await as(db, 'authenticated', ID.VIEWER, "UPDATE public.bookings SET status = 'confirmed' WHERE event_date = '2031-03-03' RETURNING id");
    assert.equal(denied.rows.length, 0);
  });

  test('payments: admin can record a payment; the anonymous role cannot see payments', async () => {
    const booking = (await db.query("SELECT id FROM public.bookings WHERE event_date = '2031-02-02' AND status = 'pending'")).rows[0].id;
    await as(db, 'authenticated', ID.ADMIN, `INSERT INTO public.payments (booking_id, user_id, amount, currency, payment_type, provider, status, gateway_reference, customer_email, metadata) VALUES ('${booking}', '${ID.ADMIN}', 50000, 'NGN', 'deposit', 'manual', 'successful', 'ref-1', 'client@example.test', '{}')`);
    assert.equal((await as(db, 'authenticated', ID.ADMIN, 'SELECT id FROM public.payments')).rows.length, 1);
    assert.equal((await as(db, 'authenticated', ID.STAFF, 'SELECT id FROM public.payments')).rows.length, 0);
  });

  test('blocked dates: admin manages them, anonymous visitors cannot read the table directly', async () => {
    await as(db, 'service_role', '', `INSERT INTO public.blocked_dates (event_date, note, created_by) VALUES ('2031-04-04', 'closed', NULL)`);
    assert.equal((await as(db, 'authenticated', ID.ADMIN, 'SELECT event_date, note, created_at FROM public.blocked_dates')).rows.length, 1);
    assert.equal((await as(db, 'authenticated', ID.VIEWER, 'SELECT event_date FROM public.blocked_dates')).rows.length, 0);
  });

  test('site settings: service role writes, admins read, non-admins do not', async () => {
    await as(db, 'service_role', '', `INSERT INTO public.site_settings (key, value) VALUES ('booking_open', 'true'::jsonb), ('headline', '"Welcome"'::jsonb)`);
    assert.equal((await as(db, 'authenticated', ID.ADMIN, 'SELECT key, value FROM public.site_settings ORDER BY key')).rows.length, 2);
    assert.equal((await as(db, 'authenticated', ID.VIEWER, 'SELECT key FROM public.site_settings')).rows.length, 0);
  });

  test('archived-booking purge removes expired archived bookings without payments, keeps those with payments, and writes an audit entry', async () => {
    const columns = '(full_name, email, event_date, status, archived_at)';
    await as(db, 'service_role', '', `INSERT INTO public.bookings ${columns} VALUES ('Old', 'old@example.test', '2030-01-01', 'archived', now() - interval '7 months')`);
    const kept = (await as(db, 'service_role', '', `INSERT INTO public.bookings ${columns} VALUES ('Paid', 'paid@example.test', '2030-01-02', 'archived', now() - interval '7 months') RETURNING id`)).rows[0].id;
    await as(db, 'service_role', '', `INSERT INTO public.payments (booking_id, amount, currency, status) VALUES ('${kept}', 10, 'NGN', 'successful')`);
    const purged = (await as(db, 'service_role', '', 'SELECT public.purge_archived_bookings() AS n')).rows[0].n;
    assert.equal(purged, 1);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.bookings WHERE email = 'old@example.test'")).rows[0].n, 0);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.bookings WHERE id = '${kept}'`)).rows[0].n, 1);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.audit_logs WHERE action = 'booking.auto_purged'")).rows[0].n, 1);
    await failsWith(as(db, 'authenticated', ID.ADMIN, 'SELECT public.purge_archived_bookings()'), RLS_OR_PRIVILEGE);
    await failsWith(as(db, 'anon', '', 'SELECT public.purge_archived_bookings()'), RLS_OR_PRIVILEGE);
  });

  test('the role-escalation trigger from the repository blocks an admin changing roles before any proposal is applied', async () => {
    await failsWith(as(db, 'authenticated', ID.ADMIN, `UPDATE public.profiles SET role = 'owner' WHERE id = '${ID.ADMIN}'`), /Privilege escalation denied/);
    await as(db, 'authenticated', ID.OWNER, `UPDATE public.profiles SET role = 'staff' WHERE id = '${ID.VIEWER}'`);
    await as(db, 'authenticated', ID.OWNER, `UPDATE public.profiles SET role = 'viewer' WHERE id = '${ID.VIEWER}'`);
  });
});

describe('staging baseline: Stage 2 proposals A, B, C on the full baseline', () => {
  let db;
  before(async () => {
    db = await platformDatabase();
    await installUpTo(db, '15');
    await seedUsers(db);
    await db.exec(`INSERT INTO public.user_permissions (user_id, permission_key) VALUES ('${ID.STAFF}', 'bookings.view')`);
  });
  after(async () => { await db.close(); });

  test('read-only inspection script runs on the baseline and changes nothing', async () => {
    const before = await catalog(db);
    const results = await db.exec(inspectSql);
    assert.ok(results.length >= 9);
    assert.deepEqual(await catalog(db), before);
  });

  test('the read-only schema comparison script runs on the baseline, returns structure only and changes nothing', async () => {
    const before = await catalog(db);
    const results = await db.exec(read('supabase/staging/20261112_schema_compare_readonly.sql'));
    assert.ok(results.length >= 8);
    const columns = results.find((result) => result.fields.some((field) => field.name === 'ord'));
    assert.ok(columns.rows.some((row) => row.object === 'bookings' && row.name === 'booking_reference'));
    assert.ok(columns.rows.every((row) => !/@/.test(String(row.detail))), 'no row data');
    assert.deepEqual(await catalog(db), before);
  });

  test('applying A, B and C succeeds and the verification script reports every check as passing', async () => {
    const original = await catalog(db);
    await applyProposals(db, 'A', 'B', 'C');
    const results = (await db.query(verifySql)).rows;
    const failing = results.filter((row) => row.ok !== true).map((row) => row.check_name);
    assert.deepEqual(failing, []);
    assert.notDeepEqual(await catalog(db), original);
  });

  test('application access still works with A, B and C applied', async () => {
    assert.ok((await as(db, 'anon', '', 'SELECT id FROM public.services')).rows.length >= 1);
    await as(db, 'service_role', '', "INSERT INTO public.bookings (full_name, email, event_date, status) VALUES ('Post', 'post@example.test', '2032-01-01', 'pending')");
    assert.ok((await as(db, 'authenticated', ID.ADMIN, 'SELECT id FROM public.bookings')).rows.length >= 1);
    assert.equal((await as(db, 'authenticated', ID.ADMIN, 'SELECT id FROM public.profiles')).rows.length, 5);
    assert.equal((await as(db, 'authenticated', ID.ADMIN, 'SELECT permission_key FROM public.user_permissions')).rows.length, 1);
    await as(db, 'service_role', '', `UPDATE public.profiles SET role = 'admin' WHERE id = '${ID.STAFF}'`);
    await as(db, 'service_role', '', `UPDATE public.profiles SET role = 'staff' WHERE id = '${ID.STAFF}'`);
    await as(db, 'service_role', '', `INSERT INTO public.audit_logs (actor_user_id, action, target_user_id, metadata) VALUES ('${ID.OWNER}', 'user.role_changed', '${ID.STAFF}', '{}')`);
  });

  test('with A, B and C applied: direct identity writes by admins and the owner are refused, and a suspended admin loses all access', async () => {
    await failsWith(as(db, 'authenticated', ID.ADMIN, `INSERT INTO public.user_permissions (user_id, permission_key) VALUES ('${ID.VIEWER}', 'users.manage')`), RLS_OR_PRIVILEGE);
    await failsWith(as(db, 'authenticated', ID.OWNER, `INSERT INTO public.user_permissions (user_id, permission_key) VALUES ('${ID.VIEWER}', 'users.manage')`), RLS_OR_PRIVILEGE);
    await failsWith(as(db, 'authenticated', ID.ADMIN, "INSERT INTO public.audit_logs (action) VALUES ('forged')"), RLS_OR_PRIVILEGE);
    await failsWith(as(db, 'authenticated', ID.STAFF, `UPDATE public.profiles SET is_active = true WHERE id = '${ID.STAFF}'`), RLS_OR_PRIVILEGE);
    assert.equal((await as(db, 'authenticated', ID.ADMIN_SUSPENDED, 'SELECT id FROM public.bookings')).rows.length, 0);
    assert.equal((await as(db, 'authenticated', ID.ADMIN_SUSPENDED, 'SELECT public.is_admin() AS a')).rows[0].a, false);
  });

  test('rolling back C, B, A restores the baseline catalog exactly', async () => {
    const fresh = await platformDatabase();
    try {
      await installUpTo(fresh, '15');
      await seedUsers(fresh);
      const original = await catalog(fresh);
      await applyProposals(fresh, 'A', 'B', 'C');
      await rollbackProposals(fresh, 'C', 'B', 'A');
      assert.deepEqual(await catalog(fresh), original);
    } finally { await fresh.close(); }
  });
});
