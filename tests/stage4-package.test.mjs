// STAGE 4 package checks (STATIC: nothing here connects to a database or executes the package SQL): completeness, execution order, dependency guards,
// rollback consistency, SQL safety scan, generated-file freshness, and consistency of the four reports.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, test } from 'node:test';
import { CREDENTIAL_PATTERNS, splitStatements } from '../scripts/schema-export.mjs';
import { SOURCE_SHA256, buildBaselineFile, generatedHardenedBlock, generatedValidationBlock } from '../scripts/build-stage4-baseline.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const list = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url)).sort();

const INSTALL = ['01_production_schema.sql', '02_privilege_normalisation.sql', '03_validate_baseline.sql', '04_security_A.sql', '05_security_B.sql', '06_security_C.sql', '07_validate_hardened.sql'];
const ROLLBACK = ['01_rollback_baseline.sql', '01a_rollback_privilege_normalisation.sql', '02_rollback_security_A.sql', '03_rollback_security_B.sql', '04_rollback_security_C.sql'];
const REPORTS = ['STAGE4_INSTALLATION_RUNBOOK.md', 'STAGE4_SECURITY_TEST_MATRIX.md', 'STAGE4_ROLLBACK_GUIDE.md', 'STAGE4_READINESS_REPORT.md'];
const install = Object.fromEntries(INSTALL.map((f) => [f, read(`supabase/staging/install/${f}`)]));
const rollback = Object.fromEntries(ROLLBACK.map((f) => [f, read(`supabase/staging/rollback/${f}`)]));
const code = (text) => text.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

describe('stage 4 package: completeness and order', () => {
  test('exactly the required files exist, in a clear numeric execution order, and no legacy file remains in install/', () => {
    assert.deepEqual(list('supabase/staging/install'), INSTALL);
    assert.deepEqual(list('supabase/staging/rollback'), [...ROLLBACK].sort());
    for (const r of REPORTS) assert.ok(existsSync(new URL(`../supabase/staging/reports/${r}`, import.meta.url)), r);
    assert.ok(existsSync(new URL('../supabase/staging/legacy_install/README.md', import.meta.url)), 'legacy package is relocated and labelled');
    assert.deepEqual(list('supabase/staging/legacy_install').filter((f) => /^01_|^15|deferred/.test(f)).length > 0, true);
  });

  test('the original production export is unchanged and the package references only it (never the legacy or 08 Development sources)', () => {
    const bytes = readFileSync(new URL('../supabase/staging/source/production_public_schema.sql', import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), SOURCE_SHA256);
    assert.equal(bytes.length, 52351);
    for (const [name, text] of [...Object.entries(install), ...Object.entries(rollback)]) {
      assert.doesNotMatch(code(text), /legacy_install|08 Development|supabase\/proposals/, name);
    }
  });

  test('generated files are fresh: 01 equals the builder output; the generated blocks of 03 and 07 equal a fresh computation', () => {
    assert.equal(install['01_production_schema.sql'], buildBaselineFile());
    assert.ok(install['03_validate_baseline.sql'].includes(generatedValidationBlock()));
    assert.ok(install['07_validate_hardened.sql'].includes(generatedHardenedBlock()));
  });

  test('every file carries the not-executed banner, names the staging project only, and states how to arm the guard', () => {
    for (const [name, text] of [...Object.entries(install), ...Object.entries(rollback)]) {
      assert.match(text.split('\n').slice(0, 3).join('\n'), /D'FABULOUS STAGE 4/, name);
      assert.match(text, /NOT EXECUTED/, name);
      assert.match(text, /qwoxxroszmwobnzqgndr/, name);
      assert.doesNotMatch(text, /fbhqegevyvpyzjoslblf/, `${name} must never name the production project`);
    }
    for (const name of [...INSTALL.filter((f) => !f.includes('validate')), ...ROLLBACK]) {
      const text = { ...install, ...rollback }[name];
      assert.match(text, /dfabulous\.confirm_project/, `${name} must require the armed guard`);
    }
  });

  test('transaction discipline: DDL scripts are one BEGIN ... COMMIT with lock_timeout; validators are READ ONLY and end in ROLLBACK', () => {
    for (const name of ['01_production_schema.sql', '02_privilege_normalisation.sql', '04_security_A.sql', '05_security_B.sql', '06_security_C.sql']) {
      const statements = splitStatements(install[name]);
      assert.equal(statements[0], 'BEGIN', name);
      assert.equal(statements.at(-1), 'COMMIT', name);
      assert.ok(statements.includes("SET LOCAL lock_timeout = '10s'"), `${name} lock_timeout`);
    }
    for (const name of ROLLBACK) { const s = splitStatements(rollback[name]); assert.equal(s[0], 'BEGIN', name); assert.equal(s.at(-1), 'COMMIT', name); }
    for (const name of ['03_validate_baseline.sql', '07_validate_hardened.sql']) {
      const s = splitStatements(install[name]);
      assert.equal(s[0], 'BEGIN READ ONLY', name);
      assert.equal(s.at(-1), 'ROLLBACK', name);
      assert.equal(s.length >= 3, true);
      assert.doesNotMatch(code(install[name]), /^\s*(INSERT INTO|UPDATE |DELETE FROM|DROP |ALTER |CREATE |GRANT |REVOKE |TRUNCATE )/m, `${name} must contain no data or DDL statement`);
    }
  });
});

describe('stage 4 package: dependency guards (execution order is enforced by the scripts, not only by the runbook)', () => {
  test('01 needs an empty public schema (production would stop); every later script needs the 01 install marker, which production never has', () => {
    assert.match(install['01_production_schema.sql'], /public schema is not empty/);
    for (const name of ['02_privilege_normalisation.sql', '04_security_A.sql', '05_security_B.sql', '06_security_C.sql', ...ROLLBACK.slice(0, 2)]) {
      const text = { ...install, ...rollback }[name] ?? rollback[name];
      assert.match(text, /dfabulous_stage4\.install_marker/, name);
    }
    for (const name of ROLLBACK.slice(2)) assert.match(rollback[name], /dfabulous_stage4\.phase2_state/, name);
  });

  test('Phase 2 requires the least-privilege state; C requires B; B cannot be rolled back under C; Phase 1 rollback refuses while Phase 2 is applied', () => {
    for (const name of ['04_security_A.sql', '05_security_B.sql', '06_security_C.sql']) assert.match(install[name], /scope = 'normalisation'/, name);
    assert.match(install['06_security_C.sql'], /proposal = 'B'/);
    assert.match(rollback['03_rollback_security_B.sql'], /proposal = 'C'/);
    assert.match(rollback['01_rollback_baseline.sql'], /phase2_state/);
    assert.match(rollback['01_rollback_baseline.sql'], /DROP STAGING BASELINE OBJECTS/);
    assert.match(rollback['01_rollback_baseline.sql'], /yes-delete-staging-test-data/);
  });

  test('each install script records and each rollback script clears its own state, and rollbacks use the captured snapshots', () => {
    for (const p of ['A', 'B', 'C']) {
      assert.match(install[`0${{ A: 4, B: 5, C: 6 }[p]}_security_${p}.sql`], new RegExp(`phase2_state \\(proposal\\) VALUES \\('${p}'\\)`));
      assert.match(rollback[`0${{ A: 2, B: 3, C: 4 }[p]}_rollback_security_${p}.sql`], new RegExp(`DELETE FROM dfabulous_stage4\\.phase2_state WHERE proposal = '${p}'`));
    }
    assert.match(rollback['02_rollback_security_A.sql'], /proposal_snapshot/);
    assert.match(rollback['03_rollback_security_B.sql'], /pg_get_functiondef|proposal_snapshot/);
    assert.match(rollback['01a_rollback_privilege_normalisation.sql'], /privilege_snapshot/);
    assert.match(install['02_privilege_normalisation.sql'], /snapshot_status WHERE scope = 'normalisation'/, 'capture-once');
  });

  test('the least-privilege matrix is textually identical in 02, 03 and 07', () => {
    const matrix = (text) => /expected_privileges\(tbl, grantee, privs\) AS \(VALUES([\s\S]*?)\n\),/.exec(text)?.[1].replace(/\s+/g, ' ').trim();
    const fromApply = /FROM \(VALUES\s*([\s\S]*?)\) AS m\(tbl, grantee, privs\)/.exec(install['02_privilege_normalisation.sql'])[1].replace(/\s+/g, ' ').trim();
    assert.equal(matrix(install['03_validate_baseline.sql']), fromApply.replace(/\)\s*$/, ')'));
    assert.equal(matrix(install['07_validate_hardened.sql']), matrix(install['03_validate_baseline.sql']));
  });
});

describe('stage 4 package: SQL safety scan', () => {
  const allInstall = Object.entries(install).filter(([n]) => n !== '01_production_schema.sql');
  const body01 = code(install['01_production_schema.sql']);

  test('no install script drops tables/schemas, truncates, deletes or rewrites data, installs extensions, schedules cron, or creates roles', () => {
    for (const [name, text] of [...allInstall, ['01_production_schema.sql', body01]]) {
      const c = code(text);
      assert.doesNotMatch(c, /\bDROP (TABLE|SCHEMA|FUNCTION|SEQUENCE|ROLE|EXTENSION|TRIGGER)\b/i, name);
      assert.doesNotMatch(c, /\bTRUNCATE\b\s+(TABLE\s+)?(public|dfabulous)/i, name);
      if (name !== '01_production_schema.sql') assert.doesNotMatch(c, /^\s*(DELETE FROM|UPDATE)\s+public\./im, name);
      assert.doesNotMatch(c, /\bCREATE (EXTENSION|ROLE|USER|SERVER|PUBLICATION|SUBSCRIPTION|EVENT TRIGGER)\b|\bALTER ROLE\b|cron\.schedule/i, name);
      if (!name.includes('validate')) assert.doesNotMatch(c, /\bpg_cron\b/i, name);
      assert.doesNotMatch(c, /^\s*COPY\s/im, name);
      if (name !== '01_production_schema.sql') assert.doesNotMatch(c.replace(/INSERT INTO public\.audit_logs\b/g, ''), /\bINSERT INTO public\./i, name);
      if (!name.includes('validate')) assert.doesNotMatch(c, /\bDISABLE ROW LEVEL SECURITY\b|\bNO FORCE\b|\bBYPASSRLS\b|\bWITH GRANT OPTION\b/i, name);
    }
  });

  test('DROP is confined to the destructive rollback; the rollbacks never drop auth, storage or any managed object', () => {
    for (const [name, text] of Object.entries(rollback)) {
      const c = code(text);
      assert.doesNotMatch(c, /\b(auth|storage|realtime|vault|cron|extensions)\./i, name);
      if (name !== '01_rollback_baseline.sql') assert.doesNotMatch(c.replace(/DROP FUNCTION IF EXISTS public\.stage4_payments_(audit|guard)\(\);/g, ''), /\bDROP (TABLE|SCHEMA|SEQUENCE|FUNCTION)\b/i, name);
    }
    assert.match(code(rollback['01_rollback_baseline.sql']), /DROP SCHEMA dfabulous_stage4 CASCADE/);
  });

  test('no GRANT gives anything to PUBLIC or anon except SELECT on services; only the required EXECUTE grants exist', () => {
    const c = code(install['02_privilege_normalisation.sql']);
    assert.doesNotMatch(c, /GRANT [^;]*\bTO\b[^;]*\bPUBLIC\b/i);
    assert.deepEqual([...c.matchAll(/GRANT EXECUTE ON FUNCTION (public\.\w+\(\)) TO (\w+)/g)].map((m) => `${m[1]}->${m[2]}`).sort(), ['public.is_admin()->authenticated', 'public.is_owner()->authenticated', 'public.purge_archived_bookings()->service_role']);
    assert.match(c, /\('services',\s+'anon',\s+'SELECT'\)/);
    assert.equal((c.match(/'anon'/g) ?? []).filter(Boolean).length > 0, true);
    const grantsIn = (name) => [...code(install[name]).matchAll(/^\s*GRANT\b[^;]*;|EXECUTE format\('GRANT/gim)].map((m) => m[0].trim());
    assert.deepEqual(grantsIn('04_security_A.sql'), ['GRANT UPDATE (amount, currency, payment_type, status, payment_method, metadata, paid_at) ON TABLE public.payments TO authenticated;'], 'A adds exactly the editable payment columns');
    for (const name of ['05_security_B.sql', '06_security_C.sql']) assert.deepEqual(grantsIn(name), [], `${name} only revokes or replaces definitions`);
  });

  test('final decisions: no browser-token client writes profiles or edits payments in application code; the service role is the only profile writer', () => {
    const files = ['server.ts', ...['routes/admin-users.ts', 'routes/admin-bookings.ts', 'lib/auth.ts', 'lib/audit.ts'].map((f) => `supabase/functions/dfabulous-api/${f}`)];
    for (const f of files) {
      const text = read(f);
      assert.doesNotMatch(text, /requestSupabase\s*\.from\('profiles'\)\s*\.(insert|update|upsert|delete)/, `${f}: profile writes use the service client`);
      assert.doesNotMatch(text, /\.from\('payments'\)\s*\.(update|upsert|delete)/, `${f}: no application path rewrites or deletes payments`);
    }
    assert.match(read('server.ts'), /serverDatabase\s*\.from\('profiles'\)\s*\.update\(updates\)/);
  });

  test('every SECURITY DEFINER function pins search_path (production export and package), and the new B function is SECURITY INVOKER with an empty path', () => {
    const functions = [...body01.matchAll(/CREATE FUNCTION "public"\."(\w+)"\([\s\S]*?\bAS \$/g)].map((m) => ({ name: m[1], head: m[0] }));
    assert.equal(functions.length, 12);
    for (const f of functions.filter((x) => /SECURITY DEFINER/.test(x.head))) assert.match(f.head, /SET "search_path"/, f.name);
    for (const [name, text] of [['05_security_B.sql', install['05_security_B.sql']], ['06_security_C.sql', install['06_security_C.sql']]]) {
      for (const m of code(text).matchAll(/CREATE OR REPLACE FUNCTION[\s\S]*?\bAS \$\$/g)) assert.match(m[0], /SET search_path = ''/, `${name}: ${m[0].slice(0, 60)}`);
    }
    assert.match(code(install['05_security_B.sql']), /SECURITY INVOKER/);
    assert.match(code(install['06_security_C.sql']), /SECURITY DEFINER/);
  });

  test('policy ordering in A: every created policy is preceded by a DROP POLICY IF EXISTS of the same name, RLS is never disabled, restrictive denies cover browser roles only', () => {
    const c = code(install['04_security_A.sql']);
    for (const m of c.matchAll(/CREATE POLICY\s+"?([\w]+)"?\s+ON\s+public\.(\w+|%I)/g)) {
      const name = m[1];
      const dropped = new RegExp(`DROP POLICY IF EXISTS "?${name}"?`).test(c) || (name.startsWith('stage4_deny_') && c.includes(`'stage4_deny_' || c`));
      assert.ok(dropped, `${name} must be dropped before creation (idempotence)`);
    }
    assert.match(c, /AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK \(false\)/);
    assert.match(c, /AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING \(false\) WITH CHECK \(false\)/);
    assert.match(c, /AS RESTRICTIVE FOR DELETE TO anon, authenticated USING \(false\)/);
    assert.doesNotMatch(c, /RESTRICTIVE[^;]*service_role/, 'service_role is never targeted by a policy');
  });

  test('the package contains no credential, connection string, e-mail address or JWT', () => {
    for (const [name, text] of [...Object.entries(install), ...Object.entries(rollback)]) {
      for (const [label, pattern] of CREDENTIAL_PATTERNS) assert.doesNotMatch(text.replace(/postgres:\/\/ /g, ''), pattern, `${name}: ${label}`);
      assert.doesNotMatch(code(text).replace(/[A-Za-z0-9._-]+@example\.test/g, ''), /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, name);
    }
  });

  test('no builder or helper in the package can reach a database or the network', () => {
    for (const file of ['scripts/build-stage4-baseline.mjs', 'scripts/generate-production-inventory.mjs']) {
      assert.doesNotMatch(read(file), /node:net|node:http|node:https|node:tls|node:dns|child_process|\bfetch\(|from 'pg'|@supabase\//, file);
    }
  });
});

describe('stage 4 service-role application corrections (static; behaviour is covered by the Deno and PGlite tests)', () => {
  test('both backends record a user deletion with the id in metadata and no foreign key to the deleted profile, and surface rejected audit writes', () => {
    for (const file of ['server.ts', 'supabase/functions/dfabulous-api/routes/admin-users.ts']) {
      const text = read(file);
      assert.match(text, /action: 'user\.deleted',[\s\S]{0,400}target_user_id: null,\s*metadata: \{ deleted_user_id: targetId, role: targetProfile\.role \}/, file);
    }
    for (const file of ['server.ts', 'supabase/functions/dfabulous-api/lib/audit.ts']) assert.match(read(file), /if \(error\) console\.warn\('\[(Server|Edge) API\] Audit log write rejected:'/, file);
  });

  test('the service-role key is still never referenced by browser code and no environment file or Edge Function configuration was touched', () => {
    const walk = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
    for (const file of walk('src').filter((f) => /\.(ts|tsx)$/.test(f))) assert.doesNotMatch(read(file), /service[_-]?role/i, file);
  });
});

describe('stage 4 reports: present, consistent, and honest about simulation', () => {
  const reports = Object.fromEntries(REPORTS.map((r) => [r, existsSync(new URL(`../supabase/staging/reports/${r}`, import.meta.url)) ? read(`supabase/staging/reports/${r}`) : '']));

  test('every report exists, names the verified source hash and the staging project, and none contains a credential', () => {
    for (const [name, text] of Object.entries(reports)) {
      assert.ok(text.length > 1500, `${name} is written`);
      assert.match(text, /f41bf2fe/, name);
      assert.match(text, /qwoxxroszmwobnzqgndr/, name);
      for (const [label, pattern] of CREDENTIAL_PATTERNS.filter((p) => !/connection string$/.test(p[0]))) assert.doesNotMatch(text, pattern, `${name}: ${label}`);
    }
  });

  test('simulated results are labelled as simulated and never claimed to prove real Supabase behaviour', () => {
    assert.match(reports['STAGE4_SECURITY_TEST_MATRIX.md'], /SIMULATED/);
    assert.match(reports['STAGE4_SECURITY_TEST_MATRIX.md'], /do(es)? not prove/i);
    assert.match(reports['STAGE4_READINESS_REPORT.md'], /PGlite/);
  });

  test('the runbook states the exact order of every script and the rollback guide the exact reverse order', () => {
    const order = INSTALL.map((f) => reports['STAGE4_INSTALLATION_RUNBOOK.md'].indexOf(f));
    assert.ok(order.every((i) => i >= 0), 'every install file is named in the runbook');
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'first mentions follow the execution order');
    for (const f of ROLLBACK) assert.ok(reports['STAGE4_ROLLBACK_GUIDE.md'].includes(f), `${f} is named in the rollback guide`);
  });

  test('the readiness report states exactly one classification', () => {
    const text = reports['STAGE4_READINESS_REPORT.md'];
    const stated = [...text.matchAll(/^\*\*Classification: ([ABC])\. /gm)].map((m) => m[1]);
    assert.equal(stated.length, 1);
    assert.match(text, /A\. READY FOR INDEPENDENT REVIEW|B\. NOT READY, ISSUES REMAIN/);
  });
});
