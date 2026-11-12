// Builds supabase/staging/install/01_production_schema.sql (Stage 4 / Phase 1) from the UNCHANGED production export.
//   node scripts/build-stage4-baseline.mjs            write 01_production_schema.sql and refresh the generated block of 03_validate_baseline.sql
//   node scripts/build-stage4-baseline.mjs --check    fail if either file differs from a fresh build
// Reads only repository files; writes only inside supabase/staging/install/. It never connects to any database and executes no SQL.
//
// The restore copy differs from the export ONLY by:
//   R1 removing `CREATE SCHEMA "public"`, its OWNER and COMMENT statements (the schema exists on every Supabase project);
//   R2 removing the 12 `ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"` statements (another role's defaults; not changeable by the `postgres` login);
//   R3 wrapping `rls_auto_enable()` (CREATE + OWNER + REVOKE) in a conditional block that skips it if a fresh project already ships it;
// and by ADDING a guarded header, an install marker, post-conditions and the session-setting resets. Every removed statement is replaced by a
// `-- [stage4 removed]` comment so the diff is auditable. verifyDerivation() proves nothing else changed.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { splitStatements } from './schema-export.mjs';
import { buildInventory } from './generate-production-inventory.mjs';

export const PROJECT_REF = 'qwoxxroszmwobnzqgndr';
export const SOURCE_SHA256 = 'f41bf2fee49c315b0b6806552f512960381c635907cc88a73004b1f708f2ad50';
export const SOURCE_BYTES = 52351;
const root = fileURLToPath(new URL('..', import.meta.url));
const sourcePath = `${root}supabase/staging/source/production_public_schema.sql`;
const outPath = `${root}supabase/staging/install/01_production_schema.sql`;
const validatePath = `${root}supabase/staging/install/03_validate_baseline.sql`;
const hardenedPath = `${root}supabase/staging/install/07_validate_hardened.sql`;

export const REMOVED_EXACT = [
  'CREATE SCHEMA "public";',
  'ALTER SCHEMA "public" OWNER TO "pg_database_owner";',
  "COMMENT ON SCHEMA \"public\" IS 'standard public schema';",
];
const RLS_CREATE = /CREATE FUNCTION "public"\."rls_auto_enable"\(\)[\s\S]*?\n\$\$;\n/;
const RLS_ALTER = 'ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";';
const RLS_REVOKE = 'REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;';
const SETTINGS_TO_RESET = ['statement_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout', 'transaction_timeout', 'client_encoding', 'standard_conforming_strings', 'search_path', 'check_function_bodies', 'xmloption', 'client_min_messages', 'row_security', 'default_table_access_method'];

export function readSource() {
  const bytes = readFileSync(sourcePath);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== SOURCE_BYTES || sha !== SOURCE_SHA256) throw new Error(`production export changed (size ${bytes.length}, sha256 ${sha}); refusing to build`);
  return bytes.toString('utf8');
}

export function transformDump(dump) {
  let text = dump;
  const removed = [];
  for (const statement of REMOVED_EXACT) {
    if (!text.includes(`\n${statement}\n`)) throw new Error(`expected statement not found: ${statement}`);
    text = text.replace(`\n${statement}\n`, `\n-- [stage4 removed R1] ${statement}\n`);
    removed.push(statement);
  }
  const defaultPrivileges = text.split('\n').filter((line) => line.startsWith('ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"'));
  if (defaultPrivileges.length !== 12) throw new Error(`expected 12 supabase_admin default-privilege statements, found ${defaultPrivileges.length}`);
  for (const line of defaultPrivileges) { text = text.replace(`\n${line}\n`, `\n-- [stage4 removed R2] ${line}\n`); removed.push(line); }

  const create = RLS_CREATE.exec(text)?.[0];
  if (!create || !text.includes(`\n${RLS_ALTER}\n`) || !text.includes(`\n${RLS_REVOKE}\n`)) throw new Error('rls_auto_enable statements not found');
  const conditional = [
    '-- [stage4 R3] rls_auto_enable(): created only if the target does not already have it (a fresh Supabase project may ship it, owned by another role).',
    'DO $stage4_conditional$',
    'BEGIN',
    "  IF to_regprocedure('public.rls_auto_enable()') IS NULL THEN",
    '    EXECUTE $stage4_sql$',
    create.trimEnd(),
    '$stage4_sql$;',
    `    EXECUTE $stage4_sql$${RLS_ALTER}$stage4_sql$;`,
    `    EXECUTE $stage4_sql$${RLS_REVOKE}$stage4_sql$;`,
    '  ELSE',
    "    RAISE NOTICE 'stage4: public.rls_auto_enable() already exists on the target; production definition NOT applied (compare it manually).';",
    '  END IF;',
    'END',
    '$stage4_conditional$;',
    '',
  ].join('\n');
  text = text.replace(create, () => conditional);
  text = text.replace(`\n${RLS_ALTER}\n`, () => `\n-- [stage4 R3] moved into the conditional block above: ${RLS_ALTER}\n`);
  text = text.replace(`\n${RLS_REVOKE}\n`, () => `\n-- [stage4 R3] moved into the conditional block above: ${RLS_REVOKE}\n`);
  return { text, removed };
}

function inventoryCounts(dump) {
  const inv = buildInventory(dump, { sha256: SOURCE_SHA256, bytes: SOURCE_BYTES, file: 'x' });
  return { inv, tables: Object.keys(inv.tables), functions: Object.keys(inv.functions).length, triggers: inv.triggers.length, policies: inv.policies.length, indexes: inv.indexes.length, constraints: inv.constraints.length };
}

function header(counts) {
  const tableList = counts.tables.map((t) => `'${t}'`).join(', ');
  return `-- D'FABULOUS STAGE 4 / PHASE 1 / 01: production-equivalent schema (STAGING ONLY)
-- STATUS: PREPARED, NOT EXECUTED. Generated by scripts/build-stage4-baseline.mjs from supabase/staging/source/production_public_schema.sql
--   (SHA-256 ${SOURCE_SHA256}, ${SOURCE_BYTES} bytes, verified before this file was built). Do not edit by hand; run \`npm run stage4:build\`.
-- Target: dfabulous-staging (${PROJECT_REF}), PostgreSQL 17.x. Run ONLY on that project, in the SQL editor or psql as the \`postgres\` login.
-- Contents: DDL only. No rows, no Auth users, no Storage objects, no roles, no extensions, no pg_cron, no cron job, no event trigger, no publication.
-- Differences from the export (everything else is byte-for-byte the export):
--   R1 removed CREATE SCHEMA "public" and its OWNER/COMMENT statements (the schema already exists);
--   R2 removed 12 ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" statements (not changeable by the postgres login; equal to Supabase's own defaults);
--   R3 rls_auto_enable() is created only if absent (a fresh project may ship it);
--   plus this guard, an install marker, post-conditions and resets of the session settings the export changes.
-- Privileges: this file reproduces the export's GRANT/REVOKE lines, which are ADDITIVE over Supabase's default privileges. The privilege state is only
--   correct after 02_privilege_normalisation.sql. Do not expose the project to traffic between 01 and 02.
-- Never run after this file: supabase/staging/legacy_install/*, 08 Development/*, or any "production schema restore" twice.
-- To arm the guard, run this in the same session immediately before the script (it is a deliberate acknowledgement, not proof of the target):
--   SELECT set_config('dfabulous.confirm_project', '${PROJECT_REF}', false);

BEGIN;
SET LOCAL lock_timeout = '10s';

DO $stage4_guard$
DECLARE
  v_ref constant text := '${PROJECT_REF}';
  v_name text;
  v_found text;
BEGIN
  IF coalesce(current_setting('dfabulous.confirm_project', true), '') <> v_ref THEN
    RAISE EXCEPTION 'STAGE4 GUARD: not armed. In this session run: SELECT set_config(''dfabulous.confirm_project'', ''%'', false); and only against the staging project.', v_ref;
  END IF;
  IF current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
     AND coalesce(current_setting('dfabulous.allow_non_17', true), '') <> 'simulation-only' THEN
    RAISE EXCEPTION 'STAGE4 GUARD: the target must be PostgreSQL 17.x (found %).', current_setting('server_version');
  END IF;
  FOREACH v_name IN ARRAY ARRAY['postgres', 'anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_name) THEN
      RAISE EXCEPTION 'STAGE4 GUARD: platform role % does not exist; this is not a Supabase project.', v_name;
    END IF;
  END LOOP;
  IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'STAGE4 GUARD: auth.users / auth.uid() not found; this is not a Supabase project.';
  END IF;
  IF to_regnamespace('dfabulous_stage4') IS NOT NULL THEN
    RAISE EXCEPTION 'STAGE4 GUARD: schema dfabulous_stage4 already exists; this baseline is a one-time restore. Use the rollback first.';
  END IF;
  SELECT string_agg(c.relname, ', ') INTO v_found
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f');
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'STAGE4 GUARD: public schema is not empty (found: %). The production-schema restore requires an empty public schema; production itself would stop here.', v_found;
  END IF;
  SELECT string_agg(p.proname, ', ') INTO v_found
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname <> 'rls_auto_enable'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e');
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION 'STAGE4 GUARD: unexpected functions in public (%).', v_found;
  END IF;
END
$stage4_guard$;

CREATE SCHEMA dfabulous_stage4;
REVOKE ALL ON SCHEMA dfabulous_stage4 FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE dfabulous_stage4.install_marker (
  project_ref   text        PRIMARY KEY,
  phase         text        NOT NULL,
  source_sha256 text        NOT NULL,
  installed_at  timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE dfabulous_stage4.install_marker FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO dfabulous_stage4.install_marker (project_ref, phase, source_sha256) VALUES ('${PROJECT_REF}', 'phase1-baseline', '${SOURCE_SHA256}');

-- Shared snapshot tables (also used by 02 and by the Phase 2 scripts) and the PRE-INSTALL state of schema ACL and default privileges, for rollback/01.
CREATE TABLE dfabulous_stage4.privilege_snapshot (
  scope       text    NOT NULL,
  kind        text    NOT NULL,
  object_name text    NOT NULL,
  grantee     text    NOT NULL,
  privilege   text    NOT NULL,
  grantable   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (scope, kind, object_name, grantee, privilege)
);
CREATE TABLE dfabulous_stage4.snapshot_status (
  scope       text PRIMARY KEY,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dfabulous_stage4.phase2_state (
  proposal   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE dfabulous_stage4.privilege_snapshot, dfabulous_stage4.snapshot_status, dfabulous_stage4.phase2_state FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO dfabulous_stage4.privilege_snapshot (scope, kind, object_name, grantee, privilege, grantable)
SELECT 'baseline', 'schema', 'public', '*', '*', false
UNION ALL
SELECT 'baseline', 'schema', 'public', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type, a.is_grantable
FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
WHERE n.nspname = 'public' AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role', 'postgres'))
UNION ALL
SELECT 'baseline', 'default_acl', format('%s|%s|%s', rl.rolname, coalesce(n.nspname, '*'), d.defaclobjtype), '*', '*', false
FROM pg_default_acl d JOIN pg_roles rl ON rl.oid = d.defaclrole LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE rl.rolname IN ('postgres', 'supabase_admin') AND (n.nspname = 'public' OR d.defaclnamespace = 0) AND d.defaclobjtype IN ('r', 'S', 'f')
UNION ALL
SELECT 'baseline', 'default_acl', format('%s|%s|%s', rl.rolname, coalesce(n.nspname, '*'), d.defaclobjtype), CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type, a.is_grantable
FROM pg_default_acl d JOIN pg_roles rl ON rl.oid = d.defaclrole LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) a
WHERE rl.rolname IN ('postgres', 'supabase_admin') AND (n.nspname = 'public' OR d.defaclnamespace = 0) AND d.defaclobjtype IN ('r', 'S', 'f')
  AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'));
INSERT INTO dfabulous_stage4.snapshot_status (scope) VALUES ('baseline');

-- ---------------------------------------------------------------------------------------------------------------------------------
-- BEGIN production export (unchanged except R1-R3)
-- ---------------------------------------------------------------------------------------------------------------------------------
`;
}

function footer(counts) {
  return `
-- ---------------------------------------------------------------------------------------------------------------------------------
-- END production export
-- ---------------------------------------------------------------------------------------------------------------------------------
${SETTINGS_TO_RESET.map((s) => `RESET ${s};`).join('\n')}

DO $stage4_postcondition$
DECLARE
  v_tables int; v_rls int; v_forced int; v_triggers int; v_policies int; v_indexes int; v_functions int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE c.relrowsecurity), count(*) FILTER (WHERE c.relforcerowsecurity) INTO v_tables, v_rls, v_forced
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r';
  SELECT count(*) INTO v_triggers FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal;
  SELECT count(*) INTO v_policies FROM pg_policies WHERE schemaname = 'public';
  SELECT count(*) INTO v_indexes FROM pg_indexes WHERE schemaname = 'public';
  SELECT count(*) INTO v_functions FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public';
  IF v_tables <> ${counts.tables.length} OR v_rls <> ${counts.tables.length} OR v_forced <> 0 THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION: tables/RLS mismatch (% tables, % with RLS, % forced)', v_tables, v_rls, v_forced; END IF;
  IF v_triggers <> ${counts.triggers} THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION: expected ${counts.triggers} triggers, found %', v_triggers; END IF;
  IF v_policies <> ${counts.policies} THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION: expected ${counts.policies} policies, found %', v_policies; END IF;
  IF v_indexes <> ${counts.indexes + counts.tables.length + 5} THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION: expected ${counts.indexes + counts.tables.length + 5} indexes (incl. primary/unique), found %', v_indexes; END IF;
  IF v_functions <> ${counts.functions} THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION: expected ${counts.functions} functions, found %', v_functions; END IF;
END
$stage4_postcondition$;

COMMIT;
`;
}

export function buildBaselineFile() {
  const dump = readSource();
  const counts = inventoryCounts(dump);
  const { text } = transformDump(dump);
  const body = text.replace(/^--\n-- PostgreSQL database dump\n--\n\n\n/, '--\n-- PostgreSQL database dump (production export, header kept)\n--\n\n');
  return `${header(counts)}${body.trimEnd()}\n${footer(counts)}`;
}

/** Proves the restore copy is the export plus the documented changes only. Returns a list of problems (empty = proven). */
export function verifyDerivation(dump, restore) {
  const problems = [];
  const exportStatements = splitStatements(dump);
  const restoreStatements = splitStatements(restore);
  const stripped = restoreStatements.map((s) => s.replace(/\s+/g, ' ').trim());
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const removed = new Set([...REMOVED_EXACT.map((s) => norm(s.replace(/;$/, ''))), norm(RLS_ALTER.replace(/;$/, '')), norm(RLS_REVOKE.replace(/;$/, ''))]);
  for (const statement of exportStatements) {
    const n = norm(statement);
    if (removed.has(n) || n.startsWith('ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"')) continue;
    if (/^CREATE FUNCTION "public"\."rls_auto_enable"/.test(n)) { if (!restore.includes(statement)) problems.push('rls_auto_enable body changed'); continue; }
    if (!stripped.includes(n) && !restore.includes(statement)) problems.push(`missing from restore copy: ${n.slice(0, 100)}`);
  }
  const exportSet = new Set(exportStatements.map(norm));
  const allowedAdditions = /^(BEGIN|COMMIT|SET LOCAL lock_timeout|RESET |DO \$stage4_|CREATE SCHEMA dfabulous_stage4|REVOKE ALL ON (SCHEMA|TABLE) dfabulous_stage4|CREATE TABLE dfabulous_stage4|INSERT INTO dfabulous_stage4)/;
  for (const statement of restoreStatements) {
    const n = norm(statement);
    if (!exportSet.has(n) && !allowedAdditions.test(n)) problems.push(`unexpected statement in restore copy: ${n.slice(0, 100)}`);
  }
  return problems;
}

// ---- generated block of 03_validate_baseline.sql ------------------------------------------------------------------------------
const BLOCK_START = '-- BEGIN GENERATED (scripts/build-stage4-baseline.mjs): expected hashes derived from the production export';
const BLOCK_END = '-- END GENERATED';

export function generatedValidationBlock(dump = readSource()) {
  const inv = buildInventory(dump, { sha256: SOURCE_SHA256, bytes: SOURCE_BYTES, file: 'x' });
  const md5 = (text) => createHash('md5').update(text).digest('hex');
  const bodies = [];
  for (const statement of splitStatements(dump)) {
    const m = /^CREATE FUNCTION "public"\."([^"]+)"\(([\s\S]*?)\) RETURNS [\s\S]*?\bAS \$([A-Za-z0-9_]*)\$([\s\S]*)\$\3\$$/.exec(statement);
    if (m) bodies.push([m[1], md5(m[4])]);
  }
  bodies.sort(([a], [b]) => a.localeCompare(b));
  const columns = Object.entries(inv.tables).sort(([a], [b]) => a.localeCompare(b)).map(([name, t]) => [name, md5(t.columns.map((c) => `${c.name}:${c.type}:${c.nullable ? 'null' : 'notnull'}`).join(','))]);
  const cType = { 'PRIMARY KEY': 'p', 'FOREIGN KEY': 'f', UNIQUE: 'u', CHECK: 'c' };
  const lists = {
    policies: inv.policies.map((p) => `${p.table}|${p.name}|${p.command}|${p.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}`),
    triggers: inv.triggers.map((t) => `${t.table}|${t.name}`),
    indexes: [...inv.indexes.map((i) => `${i.table}|${i.name}`), ...inv.constraints.filter((c) => c.type === 'PRIMARY KEY' || c.type === 'UNIQUE').map((c) => `${c.table}|${c.name}`)],
    constraints: inv.constraints.map((c) => `${c.table}|${c.name}|${cType[c.type]}`),
  };
  const names = Object.entries(lists).map(([kind, items]) => [kind, items.length, md5([...items].sort().join('\n'))]);
  const q = (s) => `'${s}'`;
  return `${BLOCK_START}
expected_function_bodies(name, body_md5) AS (VALUES
${bodies.map(([n, h]) => `  (${q(n)}, ${q(h)})`).join(',\n')}
),
expected_column_signatures(table_name, signature_md5) AS (VALUES
${columns.map(([n, h]) => `  (${q(n)}, ${q(h)})`).join(',\n')}
),
expected_object_names(kind, item_count, names_md5) AS (VALUES
${names.map(([k, n, h]) => `  (${q(k)}, ${n}, ${q(h)})`).join(',\n')}
),
${BLOCK_END}`;
}

export function applyGeneratedBlock(validateSql, block, startMarker = BLOCK_START) {
  const start = validateSql.indexOf(startMarker);
  const end = validateSql.indexOf(BLOCK_END, start);
  if (start < 0 || end < 0) throw new Error(`generated block markers not found (${startMarker})`);
  return validateSql.slice(0, start) + block + validateSql.slice(end + BLOCK_END.length);
}

// ---- generated block of 07_validate_hardened.sql ------------------------------------------------------------------------------
export const HARDENED_START = '-- BEGIN GENERATED (scripts/build-stage4-baseline.mjs): expected policy set after proposal A';
const DENY_TABLES = { profiles: ['INSERT', 'UPDATE', 'DELETE'], user_permissions: ['INSERT', 'UPDATE', 'DELETE'], permissions: ['INSERT', 'UPDATE', 'DELETE'], audit_logs: ['INSERT', 'UPDATE', 'DELETE'], payments: ['DELETE'] };

/** The policy set the hardened schema must have: production policies minus the three A drops, plus A's two read policies, 13 restrictive denies and the payments update requirement. */
export function hardenedPolicySet(dump = readSource()) {
  const inv = buildInventory(dump, { sha256: SOURCE_SHA256, bytes: SOURCE_BYTES, file: 'x' });
  const dropped = new Set(['profiles|Users update profile', 'profiles|Admins can update profiles', 'user_permissions|user_permissions_manage_active_owner_admin']);
  const items = inv.policies.filter((p) => !dropped.has(`${p.table}|${p.name}`)).map((p) => `${p.table}|${p.name}|${p.command}|${p.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}`);
  items.push('user_permissions|user_permissions_read_active_owner_admin|SELECT|PERMISSIVE', 'user_permissions|user_permissions_read_own|SELECT|PERMISSIVE', 'payments|stage4_require_active_admin_update|UPDATE|RESTRICTIVE');
  for (const [table, commands] of Object.entries(DENY_TABLES)) for (const c of commands) items.push(`${table}|stage4_deny_${c.toLowerCase()}|${c}|RESTRICTIVE`);
  return items.sort();
}

export function generatedHardenedBlock(dump = readSource()) {
  const items = hardenedPolicySet(dump);
  return `${HARDENED_START}
expected_policy_set(n, names_md5) AS (VALUES (${items.length}, '${createHash('md5').update(items.join('\n')).digest('hex')}')),
${BLOCK_END}`;
}

function main() {
  const check = process.argv.includes('--check');
  const restore = buildBaselineFile();
  const problems = verifyDerivation(readSource(), restore);
  if (problems.length) { console.error(`derivation check failed:\n${problems.join('\n')}`); process.exit(1); }
  const optional = (path, make) => { try { return make(readFileSync(path, 'utf8')); } catch (error) { if (check || !/ENOENT/.test(String(error))) throw error; return null; } };
  const validate = optional(validatePath, (text) => applyGeneratedBlock(text, generatedValidationBlock()));
  const hardened = optional(hardenedPath, (text) => applyGeneratedBlock(text, generatedHardenedBlock(), HARDENED_START));
  if (check) {
    const stale = [];
    if (readFileSync(outPath, 'utf8') !== restore) stale.push('01_production_schema.sql');
    if (readFileSync(validatePath, 'utf8') !== validate) stale.push('03_validate_baseline.sql');
    if (readFileSync(hardenedPath, 'utf8') !== hardened) stale.push('07_validate_hardened.sql');
    if (stale.length) { console.error(`stale: ${stale.join(', ')}; run npm run stage4:build`); process.exit(1); }
    console.log('Stage 4 generated files are up to date.');
    return;
  }
  writeFileSync(outPath, restore);
  if (validate) writeFileSync(validatePath, validate);
  if (hardened) writeFileSync(hardenedPath, hardened);
  console.log(`wrote ${outPath} (${restore.length} bytes); refreshed generated blocks: ${[validate && '03', hardened && '07'].filter(Boolean).join(', ') || 'none'}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
