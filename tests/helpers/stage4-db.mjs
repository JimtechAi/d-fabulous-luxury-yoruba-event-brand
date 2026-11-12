// Shared helper for the Stage 4 package tests. SIMULATION ONLY: it builds, inside an in-process PGlite (PostgreSQL 18.x, memory only), a database that
// emulates the parts of a fresh Supabase project that matter for privileges and RLS (roles, auth schema, default privileges, auth.uid()).
// Results prove how the SQL behaves in this simulation. They do NOT prove behaviour on a real Supabase project (PostgREST role switching, pooler,
// Auth hooks, dashboard-managed objects, PostgreSQL 17.11 specifics).
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const REF = 'qwoxxroszmwobnzqgndr';
export const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
export const INSTALL = (name) => read(`supabase/staging/install/${name}`);
export const ROLLBACK = (name) => read(`supabase/staging/rollback/${name}`);

export const ID = {
  OWNER: '00000000-0000-0000-0000-0000000000a1',
  ADMIN: '00000000-0000-0000-0000-0000000000a2',
  ADMIN_INACTIVE: '00000000-0000-0000-0000-0000000000a3',
  OWNER_INACTIVE: '00000000-0000-0000-0000-0000000000a4',
  STAFF: '00000000-0000-0000-0000-0000000000a5',
  VIEWER: '00000000-0000-0000-0000-0000000000a6',
  USER: '00000000-0000-0000-0000-0000000000a7',
  USER_INACTIVE: '00000000-0000-0000-0000-0000000000a8',
  ADMIN2: '00000000-0000-0000-0000-0000000000a9',
};

export const PERSONA = {
  anon: { role: 'anon', sub: null },
  user: { role: 'authenticated', sub: ID.USER },
  userInactive: { role: 'authenticated', sub: ID.USER_INACTIVE },
  staff: { role: 'authenticated', sub: ID.STAFF },
  viewer: { role: 'authenticated', sub: ID.VIEWER },
  admin: { role: 'authenticated', sub: ID.ADMIN },
  admin2: { role: 'authenticated', sub: ID.ADMIN2 },
  adminInactive: { role: 'authenticated', sub: ID.ADMIN_INACTIVE },
  owner: { role: 'authenticated', sub: ID.OWNER },
  ownerInactive: { role: 'authenticated', sub: ID.OWNER_INACTIVE },
  service: { role: 'service_role', sub: null },
};

/** A fresh-Supabase-like database. `defaults: 'supabase'` reproduces the default privileges that make a verbatim restore additive. */
export async function freshSupabase({ defaults = 'supabase' } = {}) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE supabase_admin NOLOGIN;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    GRANT ALL ON SCHEMA public TO anon, authenticated, service_role;
  `);
  if (defaults === 'supabase') {
    await db.exec(`
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
    `);
  }
  return db;
}

export const arm = (db) => db.exec(`SELECT set_config('dfabulous.confirm_project', '${REF}', false); SELECT set_config('dfabulous.allow_non_17', 'simulation-only', false);`);

/** Runs a package script exactly as an operator would: arm the guard in the same session, then the script text. */
export async function runScript(db, text) {
  await arm(db);
  try {
    return await db.exec(text);
  } catch (error) {
    await db.exec('ROLLBACK').catch(() => {});
    throw error;
  }
}

export async function installBaseline(db) {
  await runScript(db, INSTALL('01_production_schema.sql'));
}

/** Seeds structural test personas and a few rows (SIMULATION data only; created as postgres, bypassing the guards). */
export async function seedPersonas(db) {
  const rows = [
    [ID.OWNER, 'owner', true], [ID.ADMIN, 'admin', true], [ID.ADMIN2, 'admin', true], [ID.ADMIN_INACTIVE, 'admin', false], [ID.OWNER_INACTIVE, 'owner', false],
    [ID.STAFF, 'staff', true], [ID.VIEWER, 'user', true], [ID.USER, 'user', true], [ID.USER_INACTIVE, 'user', false],
  ];
  for (const [id, role, active] of rows) {
    await db.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [id, `${id.slice(-2)}@example.test`]);
    await db.query('INSERT INTO public.profiles (id, email, full_name, role, is_active) VALUES ($1, $2, $3, $4, $5)', [id, `${id.slice(-2)}@example.test`, `Person ${id.slice(-2)}`, role, active]);
  }
  await db.query(`INSERT INTO public.permissions (permission_key, description) VALUES ('bookings.manage', 'x'), ('users.manage', 'x')`);
  await db.query(`INSERT INTO public.user_permissions (user_id, permission_key) VALUES ($1, 'bookings.manage'), ($2, 'users.manage')`, [ID.STAFF, ID.ADMIN]);
  await db.query(`INSERT INTO public.services (slug, title, short_description, is_active) VALUES ('s-active', 'Active', 'x', true), ('s-hidden', 'Hidden', 'x', false)`);
  await db.query(`INSERT INTO public.bookings (user_id, full_name, email, event_date, event_location) VALUES ($1, 'B One', 'b1@example.test', '2027-01-10', 'Lagos')`, [ID.USER]);
  await db.query(`INSERT INTO public.payments (booking_id, user_id, amount, provider) SELECT id, $1, 100, 'manual' FROM public.bookings LIMIT 1`, [ID.USER]);
  await db.query(`INSERT INTO public.messages (full_name, email, message) VALUES ('M', 'm@example.test', 'hello')`);
  await db.query(`INSERT INTO public.audit_logs (actor_user_id, action) VALUES ($1, 'seed')`, [ID.OWNER]);
}

/** Runs `fn(tx)` inside a transaction as `persona` (SET LOCAL ROLE + JWT subject) and always rolls back. */
export async function asUser(db, persona, fn) {
  let result;
  await db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE ${persona.role}`);
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [persona.sub ?? '']);
    result = await fn(tx);
    await tx.rollback();
  });
  return result;
}

/** One statement as a persona. Returns { ok, rows, count, code, message }; never throws for SQL errors. */
export async function attempt(db, persona, sql, params = []) {
  try {
    const out = await asUser(db, persona, (tx) => tx.query(sql, params));
    return { ok: true, rows: out.rows, count: out.affectedRows ?? out.rows.length };
  } catch (error) {
    return { ok: false, rows: [], count: 0, code: error.code, message: String(error.message) };
  }
}

export const denied = (r) => !r.ok && r.code === '42501';
/** A write is "blocked" when it errors with insufficient_privilege / RLS violation or affects zero rows. */
export const blocked = (r) => (!r.ok && (r.code === '42501' || /row-level security|permission denied/i.test(r.message))) || (r.ok && r.count === 0);

export async function acl(db, query) {
  return (await db.query(query)).rows;
}

export const tablePriv = async (db, role, table) => {
  const privs = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
  const out = [];
  for (const p of privs) if ((await db.query(`SELECT has_table_privilege($1, $2, $3) AS ok`, [role, `public.${table}`, p])).rows[0].ok) out.push(p);
  return out;
};
