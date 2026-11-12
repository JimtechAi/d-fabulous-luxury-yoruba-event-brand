// Static consistency checks (no database engine involved): the Stage 2 proposals must be reconciled with the repository and
// must not invent schema, roles or policies; and the application's database access patterns must match what the proposals assume.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const root = new URL('..', import.meta.url);
const path = (relative) => new URL(relative, root);
const read = (relative) => readFileSync(path(relative), 'utf8');
const stripComments = (text) => text.replace(/--.*$/gm, '');
const stripLiterals = (text) => stripComments(text).replace(/'(?:[^']|'')*'/g, "''");

const proposalFiles = readdirSync(path('supabase/proposals/')).filter((name) => name.endsWith('.sql')).sort();
const forward = proposalFiles.filter((name) => /_(a|b|c)_.*\.sql$/.test(name) && !name.endsWith('.rollback.sql'));
const rollback = proposalFiles.filter((name) => name.endsWith('.rollback.sql'));
const repoSqlFiles = readdirSync(path('08 Development/')).filter((name) => name.endsWith('.sql')).map((name) => read(`08 Development/${name}`)).join('\n');

const ALLOWED_OBJECTS = new Set(['profiles', 'permissions', 'user_permissions', 'audit_logs', 'security_remediation_snapshots', 'is_admin', 'is_owner', 'prevent_role_escalation']);
const ALLOWED_ROLES = new Set(['public', 'anon', 'authenticated', 'service_role']);

describe('proposal package structure', () => {
  test('there are three forward proposals, each with a matching rollback, plus read-only inspect/verify scripts', () => {
    assert.equal(forward.length, 3);
    for (const file of forward) assert.ok(rollback.includes(file.replace(/\.sql$/, '.rollback.sql')), `${file} has no rollback`);
    assert.ok(proposalFiles.includes('20261112_00_inspect_readonly.sql') && proposalFiles.includes('20261112_99_verify_readonly.sql'));
  });

  test('nothing in supabase/proposals/ is visible to `supabase db push` (they are not in supabase/migrations/)', () => {
    const migrations = readdirSync(path('supabase/migrations/'));
    for (const file of proposalFiles) assert.ok(!migrations.includes(file), `${file} must not be in supabase/migrations`);
    for (const file of migrations) assert.ok(!/restrict_direct|role_trigger|rls_helpers/.test(file));
  });

  test('every forward/rollback script is transactional, bounded by lock_timeout and labelled PROPOSAL ONLY', () => {
    for (const file of [...forward, ...rollback]) {
      const text = read(`supabase/proposals/${file}`);
      assert.match(text, /PROPOSAL ONLY/, file);
      assert.match(text, /^BEGIN;/m, file);
      assert.match(text, /^COMMIT;/m, file);
      assert.match(text, /SET LOCAL lock_timeout = '5s';/, file);
    }
  });

  test('the read-only scripts contain no statement that changes anything', () => {
    for (const file of ['20261112_00_inspect_readonly.sql', '20261112_99_verify_readonly.sql']) {
      const code = stripLiterals(read(`supabase/proposals/${file}`));
      assert.doesNotMatch(code, /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i, file);
    }
  });
});

describe('proposals do not invent schema, roles or policies', () => {
  test('forward scripts add no table (other than the snapshot table), column, constraint, role, trigger, extension or GRANT', () => {
    for (const file of forward) {
      const code = stripLiterals(read(`supabase/proposals/${file}`));
      const tables = [...code.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? ([\w.]+)/gi)].map((match) => match[1]);
      assert.deepEqual([...new Set(tables)].filter((name) => name !== 'public.security_remediation_snapshots'), [], file);
      assert.doesNotMatch(code, /ADD COLUMN|ADD CONSTRAINT|CREATE ROLE|CREATE TRIGGER|CREATE EXTENSION|CREATE SCHEMA|\bGRANT\b/i, file);
    }
  });

  test('only repository objects are referenced', () => {
    for (const file of [...forward, ...rollback]) {
      const code = stripComments(read(`supabase/proposals/${file}`));
      for (const [, name] of code.matchAll(/\bpublic\.([a-z_]+)/g)) assert.ok(ALLOWED_OBJECTS.has(name), `${file}: unexpected object public.${name}`);
      for (const [, list] of code.matchAll(/ARRAY\[((?:'[a-z_]+',?\s*)+)\]/g)) {
        for (const [, item] of list.matchAll(/'([a-z_]+)'/g)) {
          assert.ok(ALLOWED_OBJECTS.has(item) || ALLOWED_ROLES.has(item) || /^(profiles)$/.test(item), `${file}: unexpected array item '${item}'`);
        }
      }
    }
  });

  test('only the standard Supabase roles named by repository SQL are referenced', () => {
    for (const file of [...forward, ...rollback]) {
      const code = stripComments(read(`supabase/proposals/${file}`));
      const roleLists = [...code.matchAll(/\b(?:FROM|TO)\s+((?:PUBLIC|anon|authenticated|service_role)(?:\s*,\s*(?:PUBLIC|anon|authenticated|service_role))*)/g)].map((m) => m[1]);
      assert.ok(roleLists.length > 0 || file.includes('c_rls') || file.includes('b_role'), file);
      for (const list of roleLists) for (const role of list.split(',')) assert.ok(ALLOWED_ROLES.has(role.trim().toLowerCase()), `${file}: ${role}`);
      assert.doesNotMatch(code, /postgres'|supabase_admin|supabase_auth_admin|authenticator/i, `${file} must not name roles the repository never mentions`);
    }
    assert.match(stripComments(read('supabase/proposals/20261112_b_role_trigger_allow_service_role.sql')), /current_user = 'service_role'/);
  });

  test('every policy the proposals drop or recreate exists in repository SQL', () => {
    for (const file of [...forward, ...rollback]) {
      const code = stripComments(read(`supabase/proposals/${file}`));
      for (const [, name] of code.matchAll(/DROP POLICY (?:IF EXISTS )?"([^"]+)"/g)) {
        assert.ok(repoSqlFiles.includes(`CREATE POLICY "${name}"`) || name === 'user_permissions_read_owner_admin', `${file}: policy "${name}" not found in repository SQL`);
      }
    }
  });

  test('the objects the proposals modify match the repository definitions they were reconciled against', () => {
    assert.match(repoSqlFiles, /CREATE OR REPLACE FUNCTION public\.prevent_role_escalation\(\)/);
    assert.match(repoSqlFiles, /CREATE TRIGGER trg_prevent_role_escalation\s+BEFORE UPDATE ON public\.profiles/);
    assert.match(repoSqlFiles, /CREATE TABLE IF NOT EXISTS public\.user_permissions/);
    assert.match(repoSqlFiles, /CREATE TABLE IF NOT EXISTS public\.audit_logs/);
    assert.match(repoSqlFiles, /CREATE TABLE IF NOT EXISTS public\.permissions/);
    assert.doesNotMatch(repoSqlFiles, /CREATE TABLE (IF NOT EXISTS )?public\.profiles\b/i, 'if profiles is ever defined in the repository the fixture and proposals must be re-reconciled');
    const filesWithIsActive = readdirSync(path('08 Development/')).filter((name) => name.endsWith('.sql') && /is_active/i.test(read(`08 Development/${name}`)));
    assert.deepEqual(filesWithIsActive, ['20260815_seed_services.sql'], 'is_active is only the services column in repository SQL; profiles.is_active is defined nowhere (proposal C keeps its existence preflight)');
  });
});

describe('application database access patterns match the proposals\' assumptions', () => {
  const appFiles = ['server.ts', ...readdirSync(path('supabase/functions/dfabulous-api/routes/')).map((name) => `supabase/functions/dfabulous-api/routes/${name}`), 'supabase/functions/dfabulous-api/lib/auth.ts'];
  const source = appFiles.map((file) => read(file)).join('\n');

  // Calls made with the CALLER'S token (RLS applies to the caller's role).
  const userTokenCalls = new Set([...source.matchAll(/requestSupabase\s*\.from\('(\w+)'\)\s*\.(select|insert|update|upsert|delete)\b/g)].map((m) => `${m[1]}:${m[2]}`));

  test('with the caller\'s token the API only touches profiles/user_permissions (select), bookings (select/update/delete) and payments (select/insert)', () => {
    const allowed = new Set(['profiles:select', 'user_permissions:select', 'bookings:select', 'bookings:update', 'bookings:delete', 'payments:select', 'payments:insert']);
    for (const call of userTokenCalls) assert.ok(allowed.has(call), `unexpected user-token database call: ${call}`);
    for (const expected of allowed) assert.ok(userTokenCalls.has(expected), `expected user-token call not found (pattern drift?): ${expected}`);
  });

  test('every write to profiles, user_permissions, permissions and audit_logs uses the server-side (service_role) client', () => {
    const writers = [...source.matchAll(/([A-Za-z_]+(?:\(\))?)\s*\.from\('(profiles|user_permissions|permissions|audit_logs)'\)\s*\.(insert|update|upsert|delete)\b/g)];
    assert.ok(writers.length >= 8, `expected at least 8 writes, found ${writers.length}`);
    for (const [, client, table, verb] of writers) {
      assert.ok(['serverDatabase', 'db', 'serviceClient()'].includes(client), `${verb} on ${table} through ${client}`);
    }
  });

  test('the browser (src/) reads only the services table and never writes or calls RPCs', () => {
    const files = [];
    const walk = (dir) => { for (const entry of readdirSync(path(dir), { withFileTypes: true })) { const next = `${dir}${entry.name}`; if (entry.isDirectory()) walk(`${next}/`); else if (/\.(ts|tsx)$/.test(entry.name)) files.push(next); } };
    walk('src/');
    const code = files.map((file) => read(file)).join('\n');
    const tables = [...code.matchAll(/\.from\('(\w+)'\)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(tables)], ['services']);
    assert.doesNotMatch(code, /\.(insert|upsert|rpc)\(/);
    assert.doesNotMatch(code, /supabase\s*\.from\([^)]*\)\s*\.(update|delete)\(/);
  });

  test('the API never uses app_metadata for authorisation and never updates payment rows', () => {
    assert.doesNotMatch(source, /app_metadata\??\.role/, 'authorisation must not read app_metadata.role');
    assert.doesNotMatch(source, /\.from\('payments'\)\s*\.(update|delete|upsert)/);
  });

  test('the Edge Function is not activated by anything in the repository other than its own configuration', () => {
    assert.ok(existsSync(path('supabase/functions/dfabulous-api/index.ts')));
    const frontend = ['vercel.json', 'index.html', '.env.example'].map((file) => read(file)).join('\n');
    assert.doesNotMatch(frontend.replace(/#.*$/gm, ''), /functions\/v1\/dfabulous-api/, 'no active reference to the Edge Function URL');
  });
});
