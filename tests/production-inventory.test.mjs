// Static tests for the Stage 3 forensic review: the production export is unchanged, the committed inventory is reproducible from it, the facts the
// reports rely on really are in the export, and the reports are consistent. Nothing here opens a database connection or executes SQL.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { CREDENTIAL_PATTERNS } from '../scripts/schema-export.mjs';
import { buildInventory } from '../scripts/generate-production-inventory.mjs';

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url));
const dumpBytes = read('supabase/staging/source/production_public_schema.sql');
const dump = dumpBytes.toString('utf8');
const SHA = 'f41bf2fee49c315b0b6806552f512960381c635907cc88a73004b1f708f2ad50';
const committed = JSON.parse(read('supabase/staging/reports/production_schema_inventory.json').toString('utf8'));
const reports = {
  forensic: read('docs/STAGING_PRODUCTION_SCHEMA_FORENSIC_REVIEW.md').toString('utf8'),
  matrix: read('supabase/staging/reports/staging_compatibility_matrix.md').toString('utf8'),
  recommendation: read('supabase/staging/reports/staging_installation_recommendation.md').toString('utf8'),
  gaps: read('supabase/staging/reports/staging_security_gap_analysis.md').toString('utf8'),
};

describe('the production export is preserved unchanged', () => {
  test('size and SHA-256 equal the approved values and the recorded checksum file', () => {
    assert.equal(dumpBytes.length, 52351);
    assert.equal(createHash('sha256').update(dumpBytes).digest('hex'), SHA);
    assert.match(read('supabase/staging/source/production_public_schema.sha256').toString('utf8'), new RegExp(`^${SHA}`));
  });
});

describe('inventory JSON', () => {
  test('is exactly what the generator produces from the unchanged export (reproducible)', () => {
    const fresh = buildInventory(dump, { sha256: SHA, bytes: dumpBytes.length, file: 'supabase/staging/source/production_public_schema.sql' });
    assert.deepEqual(committed, JSON.parse(JSON.stringify(fresh)));
  });

  test('object counts match the export and the reports', () => {
    const columns = Object.values(committed.tables).reduce((n, t) => n + t.columns.length, 0);
    assert.equal(Object.keys(committed.tables).length, 12);
    assert.equal(columns, 110);
    assert.equal(Object.keys(committed.functions).length, 12);
    assert.equal(committed.triggers.length, 10);
    assert.equal(committed.policies.length, 35);
    assert.equal(committed.indexes.length, 25);
    assert.equal(committed.constraints.length, 35);
    const byType = Object.fromEntries(['PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK'].map((t) => [t, committed.constraints.filter((c) => c.type === t).length]));
    assert.deepEqual(byType, { 'PRIMARY KEY': 12, 'FOREIGN KEY': 11, UNIQUE: 5, CHECK: 7 });
    assert.equal(Object.keys(committed.sequences).length, 1);
    assert.equal(committed.grants.length, 35);
    assert.equal(committed.revokes.length, 10);
    assert.equal(committed.defaultPrivileges.length, 18);
    assert.deepEqual(committed.extensions, []);
    assert.equal(committed.source.dumpedFromServer, '17.6');
    assert.equal(committed.source.dumpedByPgDump, '17.11');
    // counts the CREATE statements in the raw text independently of the parser
    assert.equal((dump.match(/^CREATE POLICY /gm) ?? []).length, 35);
    assert.equal((dump.match(/^CREATE (UNIQUE )?INDEX /gm) ?? []).length, 25);
    assert.equal((dump.match(/^CREATE TRIGGER /gm) ?? []).length, 10);
    assert.equal((dump.match(/^CREATE FUNCTION /gm) ?? []).length, 12);
    assert.equal((dump.match(/^CREATE TABLE /gm) ?? []).length, 12);
  });

  test('RLS is enabled on every table and forced on none; there is no data, role, extension or non-public definition', () => {
    for (const [name, table] of Object.entries(committed.tables)) assert.deepEqual(table.rls, { enabled: true, forced: false }, name);
    assert.doesNotMatch(dump, /^(COPY|INSERT INTO) /m);
    assert.doesNotMatch(dump, /^(CREATE|ALTER) (ROLE|USER)\b/m);
    assert.doesNotMatch(dump, /^CREATE (EXTENSION|VIEW|MATERIALIZED VIEW|TYPE|DOMAIN)\b/m);
    for (const [pattern] of CREDENTIAL_PATTERNS.map((p) => [p[1]])) assert.doesNotMatch(dump, pattern);
  });
});

describe('facts the forensic reports rely on', () => {
  const fn = (name) => Object.values(committed.functions).find((f) => f.name === name);
  const grantsFor = (role, table) => committed.grants.filter((g) => g.kind === 'TABLE' && g.object === `public.${table}` && g.roles.includes(role)).flatMap((g) => g.privileges);

  test('profiles.is_active exists, is NOT NULL and defaults to true; role is constrained', () => {
    const column = committed.tables.profiles.columns.find((c) => c.name === 'is_active');
    assert.deepEqual({ type: column.type, nullable: column.nullable, default: column.default }, { type: 'boolean', nullable: false, default: 'true' });
    assert.ok(committed.constraints.some((c) => c.table === 'profiles' && c.type === 'CHECK' && /owner.*admin.*staff.*user/.test(c.expression)));
  });

  test('is_owner() is the EXISTS variant, returns false without auth.uid(), and (like is_admin()) ignores is_active', () => {
    const body = (name) => new RegExp(`CREATE FUNCTION "public"\\."${name}"\\(\\)[\\s\\S]*?\\n\\$\\$;`).exec(dump)[0];
    for (const name of ['is_owner', 'is_admin']) {
      assert.match(body(name), /RETURN EXISTS \(/);
      assert.doesNotMatch(body(name), /is_active/);
      assert.equal(fn(name).security, 'DEFINER');
      assert.equal(fn(name).searchPath, 'public, pg_temp');
      assert.deepEqual(fn(name).executeGrants, ['authenticated']);
    }
    assert.match(body('is_owner'), /role = 'owner'/);
  });

  test('prevent_role_escalation() relies on is_owner() and has no service-role exception, so it blocks the service key', () => {
    const body = /CREATE FUNCTION "public"\."prevent_role_escalation"\(\)[\s\S]*?\n\$\$;/.exec(dump)[0];
    assert.match(body, /IF NOT public\.is_owner\(\) THEN/);
    assert.doesNotMatch(body, /service_role|current_user|session_user/);
    assert.ok(committed.triggers.some((t) => t.name === 'trg_prevent_role_escalation' && t.table === 'profiles' && t.timing === 'BEFORE' && t.events === 'UPDATE'));
    assert.deepEqual(grantsFor('service_role', 'profiles').sort(), ['INSERT', 'SELECT', 'UPDATE'], 'no DELETE for service_role on profiles');
  });

  test('handle_new_user() fixes the role to user and never reads a role from metadata; its trigger on auth.users is not in the export', () => {
    const body = /CREATE FUNCTION "public"\."handle_new_user"\(\)[\s\S]*?\$\$;/.exec(dump)[0];
    assert.match(body, /'user'\s*\)/);
    assert.doesNotMatch(body, /raw_(app_)?meta_data->>'role'/);
    assert.ok(!committed.triggers.some((t) => t.function === 'public.handle_new_user()'));
    assert.doesNotMatch(dump, /ON "auth"\."users"\s+FOR EACH ROW/);
  });

  test('user_permissions has the active-owner/admin ALL policy under the real name and authenticated holds ALL; no payments trigger exists', () => {
    const policy = committed.policies.find((p) => p.table === 'user_permissions');
    assert.equal(policy.name, 'user_permissions_manage_active_owner_admin');
    assert.equal(policy.command, 'ALL');
    assert.deepEqual(grantsFor('authenticated', 'user_permissions'), ['ALL']);
    assert.ok(!committed.policies.some((p) => p.name === 'user_permissions_manage_owner_admin'), 'proposal A looks up a name that production does not have');
    assert.ok(!committed.triggers.some((t) => t.table === 'payments'));
    assert.ok(committed.policies.some((p) => p.table === 'payments' && p.command === 'UPDATE' && p.using === 'public.is_admin()'));
  });

  test('exactly four policies check is_active, and 26 other helper-based policies do not', () => {
    const helper = committed.policies.filter((p) => /is_(admin|owner)\(\)/.test(`${p.using} ${p.withCheck}`));
    assert.equal(helper.length, 30);
    assert.equal(helper.filter((p) => /is_active/.test(`${p.using} ${p.withCheck}`)).length, 4);
    assert.equal(committed.findings.policiesNotCheckingIsActive.length, 26);
  });

  test('every REVOKE targets PUBLIC only, so a restore cannot strip default privileges from anon/authenticated/service_role', () => {
    assert.ok(committed.revokes.every((r) => r.kind === 'FUNCTION' && r.roles.length === 1 && r.roles[0] === 'PUBLIC'));
    assert.equal(committed.defaultPrivileges.filter((d) => d.forRole === 'supabase_admin').length, 12);
    assert.equal(committed.defaultPrivileges.filter((d) => d.forRole === 'postgres').length, 6);
    assert.equal((dump.match(/^CREATE SCHEMA "public";$/gm) ?? []).length, 1);
  });

  test('authenticated and anon hold the table privileges the gap analysis cites', () => {
    for (const table of ['audit_logs', 'gallery', 'permissions', 'testimonials', 'messages', 'services']) {
      assert.ok(['TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN'].every((p) => grantsFor('authenticated', table).includes(p)), table);
    }
    assert.deepEqual(grantsFor('anon', 'services').sort(), ['MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE']);
    assert.deepEqual(committed.findings.functionsWithNoApiRoleExecute.length, 7);
    assert.ok(Object.values(committed.functions).filter((f) => f.executeGrants.includes('anon')).length === 0);
  });

  test('the services seed targets text ids but production services.id is uuid', () => {
    const idColumn = committed.tables.services.columns.find((c) => c.name === 'id');
    assert.equal(idColumn.type, 'uuid');
    const seed = read('08 Development/20260815_seed_services.sql').toString('utf8');
    assert.match(seed, /'alaga-iduro',\s*'\/services\/alaga-iduro'/);
  });
});

describe('the generator is read-only', () => {
  test('it imports no network, child-process or database module', () => {
    const source = read('scripts/generate-production-inventory.mjs').toString('utf8');
    for (const forbidden of [/node:net|node:http|node:https|node:tls|node:dns/, /child_process/, /\bfetch\(/, /from 'pg'|require\('pg'\)|@supabase\//, /\bexecSync|spawn\(/]) assert.doesNotMatch(source, forbidden);
  });
});

describe('the five deliverables are consistent', () => {
  test('exactly one readiness classification is stated, identically in the review and the recommendation', () => {
    const decision = 'A. READY FOR STAGING INSTALLATION PREPARATION';
    assert.equal((reports.forensic.match(/\*\*Readiness decision: A\. READY FOR STAGING INSTALLATION PREPARATION\.\*\*/g) ?? []).length, 1);
    assert.match(reports.forensic, /## 12\. Explicit readiness decision\s+\*\*A\. READY FOR STAGING INSTALLATION PREPARATION\.\*\*/);
    assert.match(reports.recommendation, /\*\*Readiness: A\. READY FOR STAGING INSTALLATION PREPARATION\.\*\*/);
    for (const text of Object.values(reports)) {
      assert.doesNotMatch(text, /\*\*(B\. READY FOR CONTROLLED STAGING INSTALLATION|C\. NOT READY\. ADDITIONAL WORK REQUIRED)\.?\*\*/);
    }
    assert.ok(decision.startsWith('A.'));
  });

  test('every report names the verified hash; the required sections are present', () => {
    for (const [name, text] of Object.entries(reports)) assert.ok(text.includes(SHA) || text.includes('f41bf2fe'), `${name} cites the source hash`);
    for (const heading of ['## 1. Executive summary', '## 2. REVIEW 1', '## 3. REVIEW 2', '## 4. REVIEW 3', '## 5. REVIEW 4', '## 6. REVIEW 5', '## 7. REVIEW 6', '## 8. REVIEW 7', '## 9. REVIEW 8', '## 10. REVIEW 9', '## 11. Findings consolidated', '## 12. Explicit readiness decision']) {
      assert.ok(reports.forensic.includes(heading), heading);
    }
    for (const heading of ['## 3. Recommended installation sequence', '## 4. Rollback considerations', '## 7. Outstanding questions']) assert.ok(reports.recommendation.includes(heading), heading);
  });

  test('numbers quoted in the reports match the inventory', () => {
    assert.match(reports.forensic, /\*\*12 tables, 110 columns, 35 constraints, 25 indexes, 12 functions, 10 triggers, 35 RLS policies, 1 sequence, 35 grants, 10 revokes, 18 default-privilege statements\*\*/);
    assert.match(reports.forensic, /26 of 30 helper-based policies/);
    assert.match(reports.recommendation, /12 tables, 12 functions \(11 if `rls_auto_enable` skipped\), 1 sequence, 10 triggers, 35 policies, 25 indexes, 35 constraints/);
  });

  test('no report contains a credential, connection string or e-mail address', () => {
    for (const [name, text] of Object.entries(reports)) {
      for (const [pattern] of CREDENTIAL_PATTERNS.filter((p) => !/connection string$/.test(p[0])).map((p) => [p[1]])) assert.doesNotMatch(text, pattern, name);
      assert.doesNotMatch(text, /postgres(ql)?:\/\//i, name);
      assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, name);
    }
  });

  test('the reports record that nothing was executed', () => {
    assert.match(reports.forensic, /No database \(production or staging\) was contacted, no SQL was executed/);
    assert.match(reports.gaps, /No SQL was executed against any database/);
    assert.match(reports.recommendation, /Nothing below has been executed/);
  });
});
