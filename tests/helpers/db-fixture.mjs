// Shared fixture for the database security tests. It rebuilds, inside an in-process PostgreSQL (PGlite, memory only), the
// part of the schema that the repository actually defines, using the repository's own SQL statements verbatim.
//
// RULES (so nothing is invented):
//  * Objects and statements come from the repository SQL files; they are located by text and the fixture throws if a
//    statement can no longer be found (the tests then fail loudly instead of silently testing something else).
//  * public.profiles is NOT defined by any repository migration. The fixture creates the minimum shape the repository relies on,
//    column by column, with the evidence listed below. No constraint other than the primary key (needed by the foreign keys that
//    reference it) is added, and no default is added.
//  * Tables the proposals never touch (bookings, payments) are stubbed with ONLY the columns that repository policies reference,
//    so the repository's own policies can be attached and their behaviour compared before/after the proposals.
//  * auth.uid(), the auth schema and the anon/authenticated/service_role roles are Supabase platform objects, emulated here.
//
// Evidence for public.profiles columns:
//   id          uuid PK   : `user_id uuid REFERENCES public.profiles(id)` (20260902_admin_permissions_migration.sql), `WHERE id = auth.uid()`
//   email       text      : `WHERE email = 'fabulousevents@hotmail.com'` (security_remediation_migration.sql)
//   role        text      : `p.role IN ('owner','admin')` (policies), `NEW.role` (prevent_role_escalation)
//   is_active   boolean   : read/written by server.ts and the Edge routes (`profile.is_active`, `.update({ is_active })`); not in any SQL file
//   full_name, created_at, updated_at : selected/ordered by server.ts (`select('id, email, full_name, role, is_active, ...')`, `order('created_at')`)
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const remediation = read('08 Development/security_remediation_migration.sql');
const rls0814 = read('08 Development/20260814_admin_rls_privileges.sql');
const publicHardening0819 = read('08 Development/20260819_public_data_access_hardening.sql');
const finalHardening0902 = read('08 Development/20260902_final_security_hardening.sql');
const payments0818 = read('08 Development/20260818_payments_rls_hardening.sql');

function slice(text, from, to, label) {
  const start = text.indexOf(from);
  const end = to ? text.indexOf(to, start) : text.length;
  if (start < 0 || end < 0) throw new Error(`fixture: cannot find section "${label}"`);
  return text.slice(start, end).replace(/\n-- -+\s*$/, '\n');
}

/** Returns the exact statement line containing `needle`; throws if the repository no longer contains it. */
export function pickLine(text, needle) {
  const line = text.split(/\r?\n/).find((candidate) => candidate.includes(needle));
  if (!line) throw new Error(`fixture: statement not found in repository SQL: ${needle}`);
  return line.trim();
}

export const sql = {
  remediationHead: slice(remediation, '-- 1. HARDENED', '-- 3. BOOKINGS TABLE SECURITY', 'remediation sections 1-2'),
  remediationBookings: slice(remediation, '-- 3. BOOKINGS TABLE SECURITY', '-- 4. MESSAGES', 'remediation section 3'),
  helpers0814: slice(rls0814, 'CREATE OR REPLACE FUNCTION public.is_admin()', 'REVOKE ALL ON FUNCTION public.is_admin()', '20260814 helpers'),
  helpers0814Grants: [
    pickLine(rls0814, 'REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;'),
    pickLine(rls0814, 'REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC;'),
    pickLine(rls0814, 'GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;'),
    pickLine(rls0814, 'GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;'),
  ].join('\n'),
  // Verbatim privilege statements from later hardening migrations that touch the objects under test.
  hardeningGrants: [
    pickLine(publicHardening0819, 'REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon;'),
    pickLine(publicHardening0819, 'GRANT SELECT ON TABLE public.profiles TO authenticated;'),
    pickLine(publicHardening0819, 'REVOKE ALL ON TABLE public.bookings FROM PUBLIC, anon;'),
    pickLine(publicHardening0819, 'GRANT SELECT, UPDATE ON TABLE public.bookings TO authenticated;'),
    pickLine(publicHardening0819, 'REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;'),
    pickLine(publicHardening0819, 'REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC, anon;'),
    pickLine(publicHardening0819, 'GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;'),
    pickLine(publicHardening0819, 'GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;'),
    pickLine(finalHardening0902, 'REVOKE EXECUTE ON FUNCTION public.prevent_role_escalation() FROM PUBLIC, anon, authenticated;'),
    pickLine(finalHardening0902, 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;'),
    pickLine(finalHardening0902, 'GRANT SELECT, INSERT, UPDATE ON TABLE public.bookings TO service_role;'),
  ].join('\n'),
  permissionsMigration: read('08 Development/20260902_admin_permissions_migration.sql').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''),
  paymentsPolicies: [
    pickLine(payments0818, 'ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;'),
    pickLine(payments0818, 'REVOKE ALL ON TABLE public.payments FROM anon;'),
    pickLine(payments0818, 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payments TO authenticated;'),
    ...(payments0818.match(/CREATE POLICY "[^"]+"\s+ON public\.payments[\s\S]*?;/g) ?? []),
  ].join('\n'),
};
if (!/Admins insert payments/.test(sql.paymentsPolicies)) throw new Error('fixture: payments policies not found');

export const proposals = Object.fromEntries(
  ['a_restrict_direct_identity_writes', 'b_role_trigger_allow_service_role', 'c_rls_helpers_require_active'].map((name) => [
    name[0].toUpperCase(),
    { up: read(`supabase/proposals/20261112_${name}.sql`), down: read(`supabase/proposals/20261112_${name}.rollback.sql`) },
  ]),
);
export const inspectSql = read('supabase/proposals/20261112_00_inspect_readonly.sql');
export const verifySql = read('supabase/proposals/20261112_99_verify_readonly.sql');

export const ID = {
  OWNER: '00000000-0000-0000-0000-0000000000a1',
  ADMIN: '00000000-0000-0000-0000-0000000000a2',
  ADMIN2: '00000000-0000-0000-0000-0000000000a7',
  ADMIN_SUSPENDED: '00000000-0000-0000-0000-0000000000a3',
  STAFF: '00000000-0000-0000-0000-0000000000a4',
  STAFF_SUSPENDED: '00000000-0000-0000-0000-0000000000a5',
  VIEWER: '00000000-0000-0000-0000-0000000000a6',
  NEW_USER: '00000000-0000-0000-0000-0000000000b1',
};

/**
 * variant 'null'   : 20260814 helpers first, security_remediation last  -> is_owner() returns NULL without auth.uid()
 * variant 'exists' : security_remediation first, 20260814 helpers last   -> is_owner() returns false
 */
export async function buildDatabase({ variant, supabaseDefaults = true }) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  `);
  if (supabaseDefaults) {
    await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;');
  }
  await db.exec(`
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY, email text, full_name text, role text, is_active boolean, created_at timestamptz, updated_at timestamptz
    );
    CREATE TABLE public.bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE public.payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
  `);

  if (variant === 'null') {
    await db.exec(sql.helpers0814);
    await db.exec(sql.remediationHead);
  } else if (variant === 'exists') {
    await db.exec(sql.remediationHead);
    await db.exec(sql.helpers0814);
    await db.exec(sql.helpers0814Grants);
  } else {
    throw new Error(`unknown variant ${variant}`);
  }
  await db.exec(sql.remediationBookings);
  await db.exec(sql.hardeningGrants);
  await db.exec(sql.permissionsMigration);
  await db.exec(sql.paymentsPolicies);

  await db.exec(`
    INSERT INTO public.profiles (id, email, role, is_active) VALUES
      ('${ID.OWNER}', 'owner@example.test', 'owner', true),
      ('${ID.ADMIN}', 'admin@example.test', 'admin', true),
      ('${ID.ADMIN2}', 'admin2@example.test', 'admin', true),
      ('${ID.ADMIN_SUSPENDED}', 'admin.suspended@example.test', 'admin', false),
      ('${ID.STAFF}', 'staff@example.test', 'staff', true),
      ('${ID.STAFF_SUSPENDED}', 'staff.suspended@example.test', 'staff', false),
      ('${ID.VIEWER}', 'viewer@example.test', 'viewer', true);
    INSERT INTO public.user_permissions (user_id, permission_key) VALUES ('${ID.STAFF}', 'bookings.view'), ('${ID.ADMIN}', 'bookings.manage');
    INSERT INTO public.bookings DEFAULT VALUES;
  `);
  return db;
}

/** Runs one statement as a database role with an optional JWT subject, as PostgREST does. */
export async function as(db, role, sub, statement) {
  await db.exec(`SET ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [sub ?? '']);
  try {
    return await db.query(statement);
  } finally {
    await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false)");
  }
}

export const RLS_OR_PRIVILEGE = /row-level security|permission denied/i;

export async function applyProposals(db, ...names) {
  for (const name of names) await db.exec(proposals[name].up);
}
export async function rollbackProposals(db, ...names) {
  for (const name of names) await db.exec(proposals[name].down);
}

/** Full, order-stable description of everything the proposals may change, for exact before/after comparison. */
export async function catalog(db) {
  const tables = ['profiles', 'permissions', 'user_permissions', 'audit_logs', 'bookings', 'payments'];
  const list = tables.map((t) => `'public.${t}'::regclass`).join(',');
  const rows = async (statement) => (await db.query(statement)).rows;
  return {
    rls: await rows(`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid IN (${list}) ORDER BY 1`),
    policies: await rows(`SELECT tablename, policyname, permissive, roles::text AS roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename IN (${tables.map((t) => `'${t}'`).join(',')}) ORDER BY 1, 2`),
    tableGrants: await rows(`SELECT c.relname, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type
      FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
      WHERE c.oid IN (${list}) AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon','authenticated','service_role')) ORDER BY 1, 2, 3`),
    functions: await rows(`SELECT p.oid::regprocedure::text AS signature, pg_get_functiondef(p.oid) AS definition FROM pg_proc p
      WHERE p.oid IN ('public.is_admin()'::regprocedure, 'public.is_owner()'::regprocedure, 'public.prevent_role_escalation()'::regprocedure) ORDER BY 1`),
    functionGrants: await rows(`SELECT p.oid::regprocedure::text AS signature, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type
      FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid IN ('public.is_admin()'::regprocedure, 'public.is_owner()'::regprocedure, 'public.prevent_role_escalation()'::regprocedure)
        AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon','authenticated','service_role')) ORDER BY 1, 2, 3`),
    triggers: await rows(`SELECT tgrelid::regclass::text AS table_name, tgname, tgenabled, pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE NOT tgisinternal AND tgrelid = 'public.profiles'::regclass ORDER BY 2`),
  };
}

export const count = async (db, statement) => (await db.query(`SELECT count(*)::int AS n FROM (${statement}) q`)).rows[0].n;
