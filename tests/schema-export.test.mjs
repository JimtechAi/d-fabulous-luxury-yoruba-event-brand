// Tests for scripts/schema-export.mjs: the static validator/inventory/comparator that will process the production schema-only export.
// Nothing here connects to a database. The "expected" sample is a pg_dump of the in-memory baseline (see scripts/dump-expected-baseline.mjs);
// it is NOT production data. Credential-looking strings are assembled at runtime so the repository secret scan stays meaningful.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CREDENTIAL_PATTERNS, buildComparisonReport, buildInventory, compareModels, parseDump, splitStatements, validateDump } from '../scripts/schema-export.mjs';

const sample = readFileSync(new URL('../supabase/staging/expected/baseline_after_install.pgdump.sql', import.meta.url), 'utf8');
const samplePath = fileURLToPath(new URL('../supabase/staging/expected/baseline_after_install.pgdump.sql', import.meta.url));
const statusOf = (result, id) => result.checks.find((check) => check.id === id).status;

/** Emulates the sed pipeline that the Supabase CLI applies to pg_dump output (comments removed, IF NOT EXISTS added). */
function asSupabaseCliOutput(text) {
  return text
    .replace(/^CREATE SCHEMA "/gm, 'CREATE SCHEMA IF NOT EXISTS "')
    .replace(/^CREATE TABLE "/gm, 'CREATE TABLE IF NOT EXISTS "')
    .replace(/^CREATE SEQUENCE "/gm, 'CREATE SEQUENCE IF NOT EXISTS "')
    .replace(/^CREATE FUNCTION "/gm, 'CREATE OR REPLACE FUNCTION "')
    .replace(/^CREATE TRIGGER "/gm, 'CREATE OR REPLACE TRIGGER "')
    .split('\n').filter((line) => !line.startsWith('--')).join('\n');
}

describe('statement splitting', () => {
  test('keeps dollar-quoted bodies, quoted semicolons and comments intact', () => {
    const statements = splitStatements(`-- c\nSELECT 'a;b'; /* x; */ CREATE FUNCTION f() RETURNS int AS $$ BEGIN INSERT INTO t VALUES (1); RETURN 1; END $$ LANGUAGE plpgsql;\n\\restrict abc\nSELECT 2;`);
    assert.equal(statements.length, 3);
    assert.match(statements[1], /INSERT INTO t VALUES \(1\); RETURN 1;/);
  });
});

describe('validation of a clean schema-only dump', () => {
  const result = validateDump(sample, { requirePostgresMajor: 18 });

  test('passes every blocking check', () => {
    assert.deepEqual(result.checks.filter((check) => check.status === 'FAIL'), []);
    assert.equal(result.failed, false);
  });

  test('INSERT statements inside function bodies are not mistaken for data', () => {
    const withBody = `${sample}\nCREATE FUNCTION "public"."log_it"() RETURNS void LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.audit_logs (action) VALUES ('x'); END $$;`;
    assert.equal(statusOf(validateDump(withBody, { requirePostgresMajor: 18 }), 1), 'PASS');
  });

  test('flags a dump from the wrong PostgreSQL major version (staging is 17)', () => {
    assert.equal(statusOf(validateDump(sample, { requirePostgresMajor: 17 }), 9), 'FAIL');
  });

  test('inventories all expected objects', () => {
    const { model } = result;
    for (const table of ['profiles', 'bookings', 'payments', 'messages', 'services', 'gallery', 'testimonials', 'site_settings', 'blocked_dates', 'permissions', 'user_permissions', 'audit_logs']) {
      assert.ok(model.tables.has(`public.${table}`), table);
    }
    assert.ok(model.indexes.has('bookings_active_event_date_unique'));
    assert.ok(model.functions.has('public.is_owner()') && model.functions.has('public.prevent_role_escalation()'));
    assert.ok(model.triggers.has('public.profiles|trg_prevent_role_escalation'));
    assert.ok(model.policies.size >= 20 && model.grants.size > 0 && model.defaultPrivileges.size > 0 && model.owners.size > 0);
    assert.ok([...model.externalReferences].some((ref) => ref.includes('auth.users')), 'dependency on auth.users is reported');
    const inventory = buildInventory(model, { file: 'x.sql', sha256: 'abc', bytes: 1 });
    assert.match(inventory, /## Functions/);
    assert.match(inventory, /public\.is_owner\(\)/);
  });

  test('the same model results from the Supabase CLI output format (comments stripped, IF NOT EXISTS)', () => {
    const cli = parseDump(asSupabaseCliOutput(sample));
    const original = result.model;
    assert.equal(cli.tables.size, original.tables.size);
    assert.equal(cli.policies.size, original.policies.size);
    assert.equal(cli.functions.size, original.functions.size);
    assert.equal(compareModels(cli, original).length, 0);
    assert.equal(validateDump(asSupabaseCliOutput(sample), { requirePostgresMajor: 18 }).failed, false);
  });
});

describe('validation rejects unsafe exports', () => {
  const secret = (...parts) => parts.join('');
  const cases = [
    ['INSERT data', `${sample}\nINSERT INTO "public"."bookings" ("id") VALUES (gen_random_uuid());`, 1],
    ['COPY data block', `${sample}\nCOPY "public"."messages" ("id") FROM stdin;\n1\n\\.\n`, 1],
    ['sequence values', `${sample}\nSELECT pg_catalog.setval('public.seq', 5, true);`, 1],
    ['Supabase secret key', `${sample}\nCOMMENT ON TABLE "public"."bookings" IS '${secret('sb_', 'secret_', 'a'.repeat(24))}';`, 2],
    ['connection string', `${sample}\nCOMMENT ON TABLE "public"."bookings" IS '${secret('post', 'gres://user:pw@host:5432/db')}';`, 2],
    ['role password', `${sample}\nALTER ROLE "x" WITH PASSWORD 'abc';`, 2],
    ['custom role', `${sample}\nCREATE ROLE "custom" LOGIN;`, 3],
    ['managed auth table', `${sample}\nCREATE TABLE "auth"."users" ("id" uuid);`, 5],
    ['storage schema', `${sample}\nCREATE SCHEMA "storage";`, 5],
    ['pg_cron extension', `${sample}\nCREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";`, 8],
    ['PostgreSQL 18 syntax', `${sample}\nCREATE FUNCTION "public"."f"() RETURNS uuid LANGUAGE sql AS $$ SELECT uuidv7() $$;`, 10],
  ];
  for (const [name, text, id] of cases) {
    test(`fails on ${name}`, () => {
      const result = validateDump(text, { requirePostgresMajor: 18 });
      assert.equal(statusOf(result, id), 'FAIL', name);
      assert.equal(result.failed, true);
    });
  }

  test('flags embedded email addresses for review without failing the export', () => {
    const result = validateDump(`${sample}\nCREATE FUNCTION "public"."owner_email"() RETURNS text LANGUAGE sql AS $$ SELECT 'someone@example.test' $$;`, { requirePostgresMajor: 18 });
    assert.equal(statusOf(result, 4), 'REVIEW');
    assert.equal(result.failed, false);
  });

  test('reports of rejected exports never contain the matched secret text', () => {
    const key = secret('sb_', 'secret_', 'Z'.repeat(24));
    const result = validateDump(`${sample}\nCOMMENT ON TABLE "public"."bookings" IS '${key}';`, { requirePostgresMajor: 18 });
    assert.doesNotMatch(JSON.stringify(result.checks), new RegExp(key));
  });
});

describe('comparison with the expected install', () => {
  const base = () => parseDump(sample);

  test('identical dumps have no differences', () => assert.deepEqual(compareModels(base(), base()), []));

  test('reports missing and invented tables and columns, type differences, constraints, policies, functions and grants', () => {
    const production = parseDump(
      sample
        .replace(/^CREATE TABLE "public"\."testimonials"/m, 'CREATE TABLE "public"."extra_prod_table" ("id" uuid);\nCREATE TABLE "public"."testimonials"')
        .replace(/^(\s+)"quote" "text"/m, '$1"prod_only_column" "text",\n$1"quote" "text"')
        .replace(/("public"\."bookings"[\s\S]*?"phone" )"text"/, '$1"character varying(40)"')
        .replace(/CREATE POLICY "Public read services"/, 'CREATE POLICY "Public read services v2"')
        .replace(/GRANT ALL ON TABLE "public"\."gallery" TO "anon";/, '')
        .replace(/ALTER TABLE "public"\."payments" ENABLE ROW LEVEL SECURITY;/, ''),
    );
    production.tables.delete('public.gallery');
    const findings = compareModels(production, base());
    const has = (kind, area, item) => findings.some((f) => f.kind === kind && f.area === area && (item === undefined || f.item.includes(item)));
    assert.ok(has('MISSING_IN_EXPECTED', 'table', 'extra_prod_table'));
    assert.ok(has('NOT_IN_PRODUCTION', 'table', 'public.gallery'));
    assert.ok(has('MISSING_IN_EXPECTED', 'column', 'prod_only_column'));
    assert.ok(has('DIFFERENT', 'column', 'public.bookings.phone'));
    assert.ok(has('NAME_ONLY', 'policy'));
    assert.ok(has('DIFFERENT', 'rls', 'public.payments'));
    const report = buildComparisonReport(findings, { productionFile: 'p.sql', expectedFile: 'e.sql' });
    assert.match(report, /invented or assumed by the derived schema/);
  });

  test('detects a different is_owner() definition (the competing-variant risk)', () => {
    const production = parseDump(sample.replaceAll('RETURN EXISTS (', 'RETURN NOT NOT EXISTS ('));
    const findings = compareModels(production, base());
    assert.ok(findings.length >= 2);
    assert.ok(findings.some((f) => f.area === 'function' && f.kind === 'DIFFERENT' && f.item === 'public.is_owner()'));
  });

  test('detects an extra trigger, a renamed index and a missing extension', () => {
    const production = parseDump(`${sample.replaceAll('bookings_active_event_date_unique', 'bookings_date_idx')}\nCREATE TRIGGER "on_profile_x" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_role_escalation"();\nCREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "public";`);
    const findings = compareModels(production, base());
    assert.ok(findings.some((f) => f.area === 'trigger' && f.kind === 'MISSING_IN_EXPECTED'));
    assert.ok(findings.some((f) => f.area === 'index' && f.kind === 'NAME_ONLY'));
    assert.ok(findings.some((f) => f.area === 'extension' && f.item === 'pgcrypto'));
  });
});

describe('export tooling safety', () => {
  const runbook = readFileSync(new URL('../supabase/staging/source/README.md', import.meta.url), 'utf8');
  const helper = readFileSync(new URL('../scripts/export-production-schema.ps1', import.meta.url), 'utf8');
  const commandLines = helper.split('\n').filter((line) => /db dump/.test(line) && !/^\s*#/.test(line));

  test('the helper performs exactly one CLI call: pinned version, URL target, public schema only', () => {
    assert.equal(commandLines.length, 1);
    assert.match(commandLines[0], /"supabase@\$cliVersion" db dump "--remote=\$url" --schema public --file \$dumpFile/);
    assert.match(helper, /\$cliVersion = '3\.1\.0'/);
  });

  test('no forbidden flag or command is executed by the helper', () => {
    const code = helper.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
    for (const forbidden of ['--dry-run', '--debug', '--yes', '--password', '--data-only', '--role-only', '--use-copy', 'supabase link', 'db push', 'db reset', 'db diff', 'db pull', ' login', 'setx', '$env:']) {
      assert.ok(!code.includes(forbidden), `helper must not contain ${forbidden}`);
    }
    assert.doesNotMatch(code, /--remote=\$?(ref|ProductionRef)|--remote\s/, 'only the URL form of --remote is allowed');
  });

  test('the helper guards against staging, the wrong project, the transaction pooler and overwriting, and never echoes the password', () => {
    for (const guard of ['This looks like STAGING', 'Neither the host nor the user contains the production project ref', '6543', 'already exists', 'AsSecureString']) assert.ok(helper.includes(guard), guard);
    assert.doesNotMatch(helper, /Write-(Host|Output|Verbose|Debug)[^\n]*\$(plain|url|secure)\b/);
  });

  test('the runbook documents the verified syntax and forbids the dangerous options', () => {
    assert.match(runbook, /--remote=<url>/);
    assert.match(runbook, /Prints `PGPASSWORD` in clear text/);
    assert.match(runbook, /DockerRunError/);
    assert.match(runbook, /temporary login role/);
    assert.match(runbook, /Forbidden with production:.*--dry-run.*--yes.*--password/);
    assert.doesNotMatch(runbook, /\$env:DFAB_PROD_DB_URL/);
  });
});

describe('prepared inspection request', () => {
  test('is strictly read-only: one READ ONLY transaction containing only SELECT statements, rolled back', () => {
    const statements = splitStatements(readFileSync(new URL('../supabase/staging/source/auth_inspection_request_READONLY_NOT_EXECUTED.sql', import.meta.url), 'utf8'));
    assert.match(statements[0], /^BEGIN READ ONLY$/i);
    assert.match(statements.at(-1), /^ROLLBACK$/i);
    for (const statement of statements.slice(1, -1)) assert.match(statement, /^SELECT\b/i);
    assert.doesNotMatch(statements.join('\n'), /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|REVOKE|CREATE)\b\s/i);
    assert.doesNotMatch(statements.join('\n'), /FROM\s+auth\.users|FROM\s+public\.(bookings|payments|messages|profiles)\b/i, 'no customer data tables are read');
  });

  test('the owner runbook contains no connection string, key or password value', () => {
    const runbook = readFileSync(new URL('../supabase/staging/source/README.md', import.meta.url), 'utf8');
    for (const [name, pattern] of CREDENTIAL_PATTERNS) assert.doesNotMatch(runbook.replace(/postgres:\/\/ /g, ''), pattern, name);
  });
});

describe('command line', () => {
  test('validate writes the checksum, inventory and report, exits 1 on FAIL and never executes SQL', () => {
    const out = mkdtempSync(join(tmpdir(), 'schema-export-'));
    const run = () => execFileSync(process.execPath, ['scripts/schema-export.mjs', 'validate', samplePath, '--out-dir', out, '--base', 'sample'], { encoding: 'utf8', stdio: 'pipe' });
    assert.throws(run, (error) => error.status === 1, 'the sample is PostgreSQL 18, so check 9 fails against the PostgreSQL 17 requirement');
    assert.deepEqual(readdirSync(out).sort(), ['sample.sha256', 'schema_inventory.md', 'schema_validation_report.md']);
    const expected = createHash('sha256').update(readFileSync(samplePath)).digest('hex');
    assert.equal(readFileSync(join(out, 'sample.sha256'), 'utf8').split(' ')[0], expected);
    assert.match(readFileSync(join(out, 'schema_validation_report.md'), 'utf8'), /FAILED/);
  });

  test('compare writes a report', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'schema-export-')), 'cmp.md');
    execFileSync(process.execPath, ['scripts/schema-export.mjs', 'compare', samplePath, samplePath, '--out', out], { encoding: 'utf8' });
    assert.match(readFileSync(out, 'utf8'), /Production export vs proposed staging install/);
  });
});
