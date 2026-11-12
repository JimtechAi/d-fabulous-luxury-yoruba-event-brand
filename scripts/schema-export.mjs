// Static (never executing) validator, inventory builder and comparator for a schema-only `pg_dump` of the public schema.
//
//   node scripts/schema-export.mjs validate <dump.sql> [--out-dir supabase/staging/source] [--base production_public_schema]
//        checks the dump, writes <base>.sha256, schema_inventory.md and schema_validation_report.md. Exit 1 on any FAIL.
//   node scripts/schema-export.mjs compare <production-dump.sql> <expected-dump.sql> [--out <file.md>]
//        compares the verified production export with the dump of what the proposed staging install produces.
//
// It only reads the files it is given. It does not open a database connection and does not run any SQL. Matched secret text is never
// printed: findings carry the pattern name and line number only.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const MANAGED_SCHEMAS = ['auth', 'storage', 'realtime', 'graphql', 'graphql_public', 'vault', 'extensions', 'pgsodium', 'pgsodium_masks', 'supabase_functions', 'supabase_migrations', 'net', 'cron', 'pgbouncer', '_realtime', 'information_schema', 'pg_catalog'];

/** Splits SQL into top-level statements, ignoring comments and psql meta-commands, respecting quotes and dollar quoting. */
export function splitStatements(sql) {
  const statements = [];
  let buffer = '';
  let i = 0;
  const flush = () => { const text = buffer.trim(); if (text) statements.push(text); buffer = ''; };
  while (i < sql.length) {
    const ch = sql[i];
    const atLineStart = i === 0 || sql[i - 1] === '\n';
    if (atLineStart && ch === '\\') { while (i < sql.length && sql[i] !== '\n') i++; continue; }
    if (ch === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; continue; }
    if (ch === '/' && sql[i + 1] === '*') { const end = sql.indexOf('*/', i + 2); i = end < 0 ? sql.length : end + 2; continue; }
    if (ch === "'") {
      let j = i + 1;
      while (j < sql.length) { if (sql[j] === "'" && sql[j + 1] === "'") j += 2; else if (sql[j] === "'") break; else j++; }
      buffer += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === '"' && sql[j + 1] !== '"')) j += sql[j] === '"' ? 2 : 1;
      buffer += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (ch === '$') {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        const stop = end < 0 ? sql.length : end + tag[0].length;
        buffer += sql.slice(i, stop); i = stop; continue;
      }
    }
    if (ch === ';') { flush(); i++; continue; }
    buffer += ch; i++;
  }
  flush();
  return statements;
}

const norm = (text) => text.replace(/"/g, '').replace(/\s+/g, ' ').trim();
const unq = (text) => text.replace(/"/g, '');
const qname = /"?([A-Za-z0-9_$]+)"?\."?([A-Za-z0-9_$]+)"?/;

function topLevelSplit(body, separator = ',') {
  const parts = [];
  let depth = 0; let inQuote = null; let current = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuote) { current += ch; if (ch === inQuote) inQuote = null; continue; }
    if (ch === "'" || ch === '"') { inQuote = ch; current += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === separator && depth === 0) { parts.push(current.trim()); current = ''; } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function matchingParen(text, openIndex) {
  let depth = 0; let inQuote = null;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) { if (ch === inQuote) inQuote = null; continue; }
    if (ch === "'" || ch === '"') { inQuote = ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function parseColumn(element) {
  const match = /^"((?:[^"]|"")+)"\s+([\s\S]*)$/.exec(element);
  if (!match) return null;
  const rest = match[2];
  const cut = rest.search(/\s(?:DEFAULT|NOT NULL|NULL|GENERATED|COLLATE|CONSTRAINT)\b/);
  const type = norm(cut < 0 ? rest : rest.slice(0, cut)).toLowerCase();
  const tail = cut < 0 ? '' : rest.slice(cut);
  const defaultMatch = /\sDEFAULT\s+([\s\S]*?)(?=\sNOT NULL\b|\sGENERATED\b|\sCOLLATE\b|$)/.exec(tail);
  return { name: match[1], type, notNull: /\bNOT NULL\b/.test(tail), default: defaultMatch ? norm(defaultMatch[1]) : null };
}

export function parseDump(sql) {
  const model = {
    version: /Dumped from database version ([0-9.]+)/.exec(sql)?.[1] ?? null,
    statements: splitStatements(sql),
    extensions: new Map(), schemas: new Set(), tables: new Map(), constraints: new Map(), indexes: new Map(), rls: new Map(), policies: new Map(),
    functions: new Map(), triggers: new Map(), views: new Map(), sequences: new Set(), types: new Set(), grants: new Set(), revokes: new Set(),
    defaultPrivileges: new Set(), owners: new Set(), externalReferences: new Set(), other: [],
  };
  for (const statement of model.statements) {
    let m;
    if ((m = /^CREATE EXTENSION (?:IF NOT EXISTS )?"?([^"\s]+)"?(?:\s+WITH SCHEMA "?([^"\s]+)"?)?/i.exec(statement))) {
      model.extensions.set(m[1], { schema: m[2] ?? null });
    } else if ((m = /^CREATE SCHEMA (?:IF NOT EXISTS )?"?([^"\s]+)"?/i.exec(statement))) {
      model.schemas.add(m[1]);
    } else if (/^CREATE TABLE /i.test(statement)) {
      m = /^CREATE TABLE (?:IF NOT EXISTS )?("?[A-Za-z0-9_$]+"?\."?[A-Za-z0-9_$]+"?)\s*\(/i.exec(statement);
      if (!m) { model.other.push(statement); continue; }
      const open = statement.indexOf('(', m[0].length - 1);
      const close = matchingParen(statement, open);
      const table = unq(m[1]);
      const columns = new Map();
      for (const element of topLevelSplit(statement.slice(open + 1, close))) {
        const column = parseColumn(element);
        if (column) columns.set(column.name, column);
        else model.constraints.set(`${table}|${norm(element).split(' ')[1] ?? element}`, { table, name: norm(element).split(' ')[1] ?? '', def: norm(element) });
      }
      model.tables.set(table, { columns, trailer: norm(statement.slice(close + 1)) });
      for (const ref of statement.matchAll(/REFERENCES\s+("?[A-Za-z0-9_$]+"?\."?[A-Za-z0-9_$]+"?)/gi)) model.externalReferences.add(`${table} -> ${unq(ref[1])}`);
    } else if ((m = /^ALTER TABLE (?:ONLY )?("?[A-Za-z0-9_$]+"?\."?[A-Za-z0-9_$]+"?)\s+ADD CONSTRAINT "?([^"\s]+)"?\s+([\s\S]*)$/i.exec(statement))) {
      const table = unq(m[1]);
      model.constraints.set(`${table}|${m[2]}`, { table, name: m[2], def: norm(m[3]) });
      for (const ref of m[3].matchAll(/REFERENCES\s+("?[A-Za-z0-9_$]+"?\."?[A-Za-z0-9_$]+"?)/gi)) model.externalReferences.add(`${table} -> ${unq(ref[1])}`);
    } else if ((m = /^ALTER TABLE (?:ONLY )?("?[A-Za-z0-9_$]+"?\."?[A-Za-z0-9_$]+"?)\s+(ENABLE|FORCE|DISABLE|NO FORCE) ROW LEVEL SECURITY/i.exec(statement))) {
      const table = unq(m[1]);
      const state = model.rls.get(table) ?? { enabled: false, forced: false };
      const verb = m[2].toUpperCase();
      if (verb === 'ENABLE') state.enabled = true; else if (verb === 'DISABLE') state.enabled = false; else if (verb === 'FORCE') state.forced = true; else state.forced = false;
      model.rls.set(table, state);
    } else if ((m = /^ALTER (TABLE|FUNCTION|PROCEDURE|SEQUENCE|VIEW|MATERIALIZED VIEW|SCHEMA|TYPE|DOMAIN)\s+(?:ONLY )?([\s\S]*?)\s+OWNER TO "?([^"\s]+)"?$/i.exec(statement))) {
      model.owners.add(`${m[1].toUpperCase()} ${norm(m[2])} OWNER ${m[3]}`);
    } else if ((m = /^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?"?([^"\s]+)"? ON (?:ONLY )?("?[A-Za-z0-9_$]+"?\."?[A-Za-z0-9_$]+"?)\s+([\s\S]*)$/i.exec(statement))) {
      model.indexes.set(m[1], { table: unq(m[2]), name: m[1], def: norm(`${/^CREATE UNIQUE/i.test(statement) ? 'UNIQUE ' : ''}${m[3]}`) });
    } else if ((m = /^CREATE POLICY "((?:[^"]|"")+)" ON ("?[A-Za-z0-9_$]+"?\."?[A-Za-z0-9_$]+"?)\s*([\s\S]*)$/i.exec(statement))) {
      const table = unq(m[2]);
      model.policies.set(`${table}|${m[1]}`, { table, name: m[1], def: norm(m[3]) });
    } else if ((m = /^CREATE (?:OR REPLACE )?(FUNCTION|PROCEDURE) ("?[A-Za-z0-9_$]+"?\."?[A-Za-z0-9_$]+"?)\(/i.exec(statement))) {
      const open = statement.indexOf('(', m[0].length - 1);
      const close = matchingParen(statement, open);
      const key = `${unq(m[2])}(${norm(statement.slice(open + 1, close)).toLowerCase()})`;
      const definition = norm(statement.replace(/^CREATE OR REPLACE /i, 'CREATE '));
      model.functions.set(key, {
        kind: m[1].toUpperCase(), key, def: definition,
        securityDefiner: /\bSECURITY DEFINER\b/i.test(statement),
        searchPath: /SET "?search_path"? (?:TO|=) ([^\n]*?)(?=\s+AS\s|\s*$)/i.exec(unq(statement))?.[1]?.trim() ?? null,
      });
    } else if ((m = /^CREATE (?:OR REPLACE )?(?:CONSTRAINT )?TRIGGER "?([^"\s]+)"? ([\s\S]*?) ON ("?[A-Za-z0-9_$]+"?\."?[A-Za-z0-9_$]+"?)\s*([\s\S]*)$/i.exec(statement))) {
      const table = unq(m[3]);
      model.triggers.set(`${table}|${m[1]}`, { table, name: m[1], def: norm(`${m[2]} ON ${m[3]} ${m[4]}`) });
    } else if ((m = /^CREATE (?:OR REPLACE )?(?:MATERIALIZED )?VIEW ("?[A-Za-z0-9_$]+"?\."?[A-Za-z0-9_$]+"?)/i.exec(statement))) {
      model.views.set(unq(m[1]), norm(statement));
    } else if ((m = /^CREATE SEQUENCE (?:IF NOT EXISTS )?("?[A-Za-z0-9_$]+"?\."?[A-Za-z0-9_$]+"?)/i.exec(statement))) {
      model.sequences.add(unq(m[1]));
    } else if ((m = /^CREATE (?:TYPE|DOMAIN) ("?[A-Za-z0-9_$]+"?\."?[A-Za-z0-9_$]+"?)/i.exec(statement))) {
      model.types.add(unq(m[1]));
    } else if (/^ALTER DEFAULT PRIVILEGES/i.test(statement)) {
      model.defaultPrivileges.add(norm(statement));
    } else if ((m = /^GRANT (.+?) ON (?:(TABLE|SEQUENCE|FUNCTION|PROCEDURE|SCHEMA|TYPE|DOMAIN|ALL TABLES IN SCHEMA) )?([\s\S]+?) TO ([\s\S]+?)(\s+WITH GRANT OPTION)?$/i.exec(statement))) {
      const privileges = m[1].split(',').map((p) => norm(p).toUpperCase()).sort().join(',');
      for (const role of m[4].split(',')) model.grants.add(`${(m[2] ?? 'TABLE').toUpperCase()} ${norm(m[3])} -> ${norm(role)}: ${privileges}${m[5] ? ' WITH GRANT OPTION' : ''}`);
    } else if (/^REVOKE /i.test(statement)) {
      model.revokes.add(norm(statement));
    } else if (!/^(SET|SELECT pg_catalog\.set_config|COMMENT ON|ALTER TABLE .* (?:ALTER COLUMN|ATTACH))/i.test(statement)) {
      model.other.push(statement);
    }
  }
  return model;
}

const schemaOf = (qualified) => qualified.split('.')[0];

export const CREDENTIAL_PATTERNS = [
  ['postgres connection string with credentials', /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@]+@/i],
  ['postgres connection string', /postgres(?:ql)?:\/\/[^\s]+/i],
  ['Supabase secret key (sb_secret_)', /sb_secret_[A-Za-z0-9_-]{8,}/],
  ['Supabase publishable key (sb_publishable_)', /sb_publishable_[A-Za-z0-9_-]{8,}/],
  ['JWT (eyJ...)', /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/],
  ['Resend API key (re_)', /\bre_[A-Za-z0-9]{16,}\b/],
  ['password literal', /\bPASSWORD\s+'[^']*'/i],
  ['PGPASSWORD assignment', /PGPASSWORD\s*=/i],
  ['service role key assignment', /service[_-]?role[_-]?key\s*[:=]/i],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

export function validateDump(text, { requirePostgresMajor = 17 } = {}) {
  const model = parseDump(text);
  const checks = [];
  const add = (id, title, status, detail = '') => checks.push({ id, title, status, detail });
  const lines = text.split(/\r?\n/);

  const dataStatements = model.statements.filter((s) => /^(INSERT\s+INTO|COPY\s)/i.test(s) || /^SELECT\s+pg_catalog\.setval/i.test(s));
  const copyTerminators = lines.filter((line) => line === '\\.').length;
  add(1, 'No INSERT, COPY or sequence-value (data) statements at top level', dataStatements.length === 0 && copyTerminators === 0 ? 'PASS' : 'FAIL',
    dataStatements.length ? `${dataStatements.length} data statement(s); first begins "${dataStatements[0].slice(0, 12)}"` : '');

  const credentialHits = [];
  lines.forEach((line, index) => { for (const [name, pattern] of CREDENTIAL_PATTERNS) if (pattern.test(line)) credentialHits.push(`line ${index + 1}: ${name}`); });
  add(2, 'No credentials, connection strings, passwords or API keys', credentialHits.length === 0 ? 'PASS' : 'FAIL', credentialHits.slice(0, 20).join('; '));

  const roleStatements = model.statements.filter((s) => /^(CREATE|ALTER|DROP)\s+(ROLE|USER|GROUP)\b/i.test(s));
  add(3, 'No custom role definitions or role passwords', roleStatements.length === 0 ? 'PASS' : 'FAIL', roleStatements.length ? `${roleStatements.length} role statement(s)` : '');

  const emails = [];
  lines.forEach((line, index) => { if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(line) && !/^\s*--/.test(line)) emails.push(`line ${index + 1}`); });
  add(4, 'No email addresses (customer or owner identifiers) embedded in definitions', emails.length === 0 ? 'PASS' : 'REVIEW', emails.length ? `email-like text at ${emails.slice(0, 10).join(', ')}; inspect each (a hard-coded owner email in a function is a configuration dependency)` : '');

  const foreign = [];
  for (const statement of model.statements) {
    const match = /^(?:CREATE|ALTER)\s+(?:OR REPLACE\s+)?(?:UNIQUE\s+)?(?:MATERIALIZED\s+)?(TABLE|VIEW|FUNCTION|PROCEDURE|SEQUENCE|TYPE|DOMAIN|INDEX|POLICY|TRIGGER|SCHEMA)\s+(?:IF NOT EXISTS\s+)?(?:ONLY\s+)?([\s\S]*?)$/i.exec(statement);
    if (!match) continue;
    let schema = null;
    if (match[1].toUpperCase() === 'SCHEMA') schema = /^"?([^"\s]+)"?/.exec(match[2])?.[1];
    else if (/^(INDEX|POLICY|TRIGGER)$/i.test(match[1])) schema = /\bON\s+(?:ONLY\s+)?"?([A-Za-z0-9_$]+)"?\./.exec(match[2])?.[1];
    else schema = qname.exec(match[2])?.[1];
    if (schema && schema !== 'public') foreign.push(`${match[1].toUpperCase()} in schema ${schema}`);
  }
  const foreignGrants = [...model.grants].filter((g) => /^(SCHEMA)\s/.test(g) && !/^SCHEMA public\b/.test(g));
  add(5, 'No object definitions outside the public schema (no managed auth/storage/realtime/cron definitions)', foreign.length === 0 && foreignGrants.length === 0 ? 'PASS' : 'FAIL', [...foreign, ...foreignGrants].slice(0, 10).join('; '));

  const managedTables = [...model.tables.keys()].filter((t) => MANAGED_SCHEMAS.includes(schemaOf(t)));
  add(6, 'No managed Auth or Storage table definitions', managedTables.length === 0 ? 'PASS' : 'FAIL', managedTables.join(', '));

  const extensions = [...model.extensions.entries()].map(([name, info]) => `${name}${info.schema ? ` (schema ${info.schema})` : ''}`);
  add(7, 'Extension dependencies identified', 'INFO', extensions.length ? extensions.join(', ') : 'none created by the dump; extensions installed in other schemas are not part of a public-only dump and must be listed from the project dashboard');
  if (model.extensions.has('pg_cron')) add(8, 'pg_cron is not part of the initial staging installation', 'FAIL', 'the dump creates pg_cron');
  else add(8, 'pg_cron is not part of the initial staging installation', 'PASS', '');

  const major = model.version ? Number(model.version.split('.')[0]) : null;
  add(9, `Dump header records the source PostgreSQL version (expected major ${requirePostgresMajor})`, major === null ? 'REVIEW' : major === requirePostgresMajor ? 'PASS' : 'FAIL', model.version ? `dumped from ${model.version}` : 'no "Dumped from database version" header (the Supabase CLI strips comments); confirm 17.x from the dashboard');
  const pg18 = [/\bSET transaction_timeout\b/i.test(text) && 'SET transaction_timeout (PostgreSQL 17+, accepted on 17)', /\buuidv7\s*\(/i.test(text) && 'uuidv7() (PostgreSQL 18 only)', /\bvirtual\b.*GENERATED ALWAYS AS/i.test(text) && 'virtual generated columns (PostgreSQL 18 only)'].filter(Boolean);
  const pg18Only = pg18.filter((item) => /PostgreSQL 18/.test(item));
  add(10, 'No PostgreSQL 18-only syntax (staging is PostgreSQL 17)', pg18Only.length === 0 ? 'PASS' : 'FAIL', pg18.join('; '));

  const restrict = lines.filter((line) => /^\\(un)?restrict\b/.test(line)).length;
  add(11, 'psql meta-commands (\\restrict / \\unrestrict) absent or ignorable', restrict === 0 ? 'PASS' : 'REVIEW', restrict ? `${restrict} meta-command line(s); they are not SQL and must be removed or commented before pasting into the SQL editor` : '');

  const unclassified = model.other.filter((s) => !/^(CREATE|ALTER|COMMENT|SET|SELECT pg_catalog\.set_config)/i.test(s));
  add(12, 'Every top-level statement was classified', model.other.length === 0 ? 'PASS' : unclassified.length ? 'FAIL' : 'REVIEW', model.other.length ? `${model.other.length} unclassified statement(s); first begins "${model.other[0].slice(0, 40).replace(/\s+/g, ' ')}"` : '');

  const withoutRls = [...model.tables.keys()].filter((t) => !model.rls.get(t)?.enabled);
  add(13, 'Row level security enabled on every table', withoutRls.length === 0 ? 'PASS' : 'REVIEW', withoutRls.join(', '));

  return { model, checks, failed: checks.some((c) => c.status === 'FAIL') };
}

const mdList = (items) => (items.length ? items.map((i) => `- \`${i}\``).join('\n') : '_none_');

export function buildInventory(model, { file, sha256, bytes }) {
  const tables = [...model.tables.entries()].sort(([a], [b]) => a.localeCompare(b));
  const perTable = (map) => (table) => [...map.values()].filter((entry) => entry.table === table).length;
  const constraintCount = perTable(model.constraints); const indexCount = perTable(model.indexes); const policyCount = perTable(model.policies); const triggerCount = perTable(model.triggers);
  const rows = tables.map(([name, info]) => `| \`${name}\` | ${info.columns.size} | ${constraintCount(name)} | ${indexCount(name)} | ${model.rls.get(name)?.enabled ? 'on' : '**off**'}${model.rls.get(name)?.forced ? ' (forced)' : ''} | ${policyCount(name)} | ${triggerCount(name)} |`);
  const columns = tables.map(([name, info]) => `#### ${name}\n\n| column | type | not null | default |\n|---|---|---|---|\n${[...info.columns.values()].map((c) => `| ${c.name} | ${c.type} | ${c.notNull ? 'yes' : 'no'} | ${c.default ? `\`${c.default.slice(0, 80)}\`` : ''} |`).join('\n')}`);
  const functions = [...model.functions.values()].sort((a, b) => a.key.localeCompare(b.key)).map((f) => `| \`${f.key}\` | ${f.kind.toLowerCase()} | ${f.securityDefiner ? 'DEFINER' : 'invoker'} | ${f.searchPath ?? '**not set**'} |`);
  return `# Schema inventory (generated)

Generated by \`scripts/schema-export.mjs validate\` from \`${basename(file)}\` (${bytes} bytes, SHA-256 \`${sha256}\`). Static analysis only; nothing was executed.

## Summary

| Object | Count |
|---|---|
| Tables | ${model.tables.size} |
| Columns | ${[...model.tables.values()].reduce((n, t) => n + t.columns.size, 0)} |
| Constraints | ${model.constraints.size} |
| Indexes | ${model.indexes.size} |
| RLS-enabled tables | ${[...model.rls.values()].filter((s) => s.enabled).length} |
| Policies | ${model.policies.size} |
| Functions/procedures | ${model.functions.size} |
| Triggers | ${model.triggers.size} |
| Views | ${model.views.size} |
| Sequences | ${model.sequences.size} |
| Types/domains | ${model.types.size} |
| Extensions created by the dump | ${model.extensions.size} |
| GRANT entries | ${model.grants.size} |
| REVOKE statements | ${model.revokes.size} |
| ALTER DEFAULT PRIVILEGES | ${model.defaultPrivileges.size} |
| Ownership statements | ${model.owners.size} |

## Tables

| table | columns | constraints | indexes | RLS | policies | triggers |
|---|---|---|---|---|---|---|
${rows.join('\n')}

## Columns

${columns.join('\n\n')}

## Constraints

${mdList([...model.constraints.values()].map((c) => `${c.table}: ${c.name} ${c.def}`).sort())}

## Indexes

${mdList([...model.indexes.values()].map((i) => `${i.table}: ${i.name} ${i.def}`).sort())}

## Policies

${mdList([...model.policies.values()].map((p) => `${p.table}: ${p.name} ${p.def}`).sort())}

## Functions

| signature | kind | security | search_path |
|---|---|---|---|
${functions.join('\n') || '| _none_ | | | |'}

## Triggers

${mdList([...model.triggers.values()].map((t) => `${t.table}: ${t.name} ${t.def}`).sort())}

## Views, sequences and types

${mdList([...model.views.keys(), ...[...model.sequences].map((s) => `sequence ${s}`), ...[...model.types].map((t) => `type ${t}`)])}

## References to objects outside the public schema (dependencies that must already exist on staging)

${mdList([...model.externalReferences].filter((r) => !/-> public\./.test(r)).sort())}

## Extensions created by the dump

${mdList([...model.extensions.entries()].map(([n, i]) => `${n}${i.schema ? ` in ${i.schema}` : ''}`))}

## Ownership statements (review: staging objects are owned by the role that runs the installation)

${mdList([...model.owners].sort())}

## Privileges (review: GRANT, REVOKE and default privileges)

### GRANT

${mdList([...model.grants].sort())}

### REVOKE

${mdList([...model.revokes].sort())}

### ALTER DEFAULT PRIVILEGES

${mdList([...model.defaultPrivileges].sort())}
`;
}

export function buildValidationReport(result, { file, sha256, bytes }) {
  const rows = result.checks.map((c) => `| ${c.id} | ${c.title} | **${c.status}** | ${c.detail.replace(/\|/g, '\\|')} |`);
  return `# Schema export validation report (generated)

File: \`${basename(file)}\` | ${bytes} bytes | SHA-256 \`${sha256}\`
Overall: **${result.failed ? 'FAILED: do not use this export' : 'no FAIL findings'}** (REVIEW items need a human decision).
Method: static text analysis by \`scripts/schema-export.mjs\`. The SQL was not executed anywhere. Matched secret text is never printed; only the pattern name and line number.

| # | Check | Result | Detail |
|---|---|---|---|
${rows.join('\n')}
`;
}

function diffNamed(a, b, label, out) {
  const find = (map, entry, byName) => [...map.values()].find((other) => other.table === entry.table && (byName ? other.name === entry.name : other.def === entry.def));
  for (const entry of a.values()) {
    const same = find(b, entry, true);
    if (same && same.def === entry.def) continue;
    if (same) { out.push({ kind: 'DIFFERENT', area: label, item: `${entry.table}.${entry.name}`, production: entry.def, expected: same.def }); continue; }
    const renamed = find(b, entry, false);
    if (renamed) out.push({ kind: 'NAME_ONLY', area: label, item: `${entry.table}`, production: entry.name, expected: renamed.name });
    else out.push({ kind: 'MISSING_IN_EXPECTED', area: label, item: `${entry.table}.${entry.name}`, production: entry.def, expected: '' });
  }
  for (const entry of b.values()) {
    const same = find(a, entry, true);
    if (same || find(a, entry, false)) continue;
    out.push({ kind: 'NOT_IN_PRODUCTION', area: label, item: `${entry.table}.${entry.name}`, production: '', expected: entry.def });
  }
}

function diffSets(a, b, label, out) {
  for (const item of a) if (!b.has(item)) out.push({ kind: 'MISSING_IN_EXPECTED', area: label, item, production: 'present', expected: '' });
  for (const item of b) if (!a.has(item)) out.push({ kind: 'NOT_IN_PRODUCTION', area: label, item, production: '', expected: 'present' });
}

/** production = verified export; expected = dump of what the proposed staging installation produces. */
export function compareModels(production, expected) {
  const findings = [];
  for (const [table, info] of production.tables) {
    const other = expected.tables.get(table);
    if (!other) { findings.push({ kind: 'MISSING_IN_EXPECTED', area: 'table', item: table, production: `${info.columns.size} columns`, expected: '' }); continue; }
    for (const [name, column] of info.columns) {
      const mine = other.columns.get(name);
      if (!mine) { findings.push({ kind: 'MISSING_IN_EXPECTED', area: 'column', item: `${table}.${name}`, production: `${column.type}${column.notNull ? ' NOT NULL' : ''}`, expected: '' }); continue; }
      const prod = `${column.type}${column.notNull ? ' NOT NULL' : ''}${column.default ? ` DEFAULT ${column.default}` : ''}`;
      const exp = `${mine.type}${mine.notNull ? ' NOT NULL' : ''}${mine.default ? ` DEFAULT ${mine.default}` : ''}`;
      if (prod !== exp) findings.push({ kind: 'DIFFERENT', area: 'column', item: `${table}.${name}`, production: prod, expected: exp });
    }
    for (const name of other.columns.keys()) if (!info.columns.has(name)) findings.push({ kind: 'NOT_IN_PRODUCTION', area: 'column', item: `${table}.${name}`, production: '', expected: other.columns.get(name).type });
  }
  for (const table of expected.tables.keys()) if (!production.tables.has(table)) findings.push({ kind: 'NOT_IN_PRODUCTION', area: 'table', item: table, production: '', expected: 'invented or assumed by the derived schema' });
  diffNamed(production.constraints, expected.constraints, 'constraint', findings);
  diffNamed(production.indexes, expected.indexes, 'index', findings);
  diffNamed(production.policies, expected.policies, 'policy', findings);
  diffNamed(production.triggers, expected.triggers, 'trigger', findings);
  for (const [key, fn] of production.functions) {
    const other = expected.functions.get(key);
    if (!other) findings.push({ kind: 'MISSING_IN_EXPECTED', area: 'function', item: key, production: `${fn.securityDefiner ? 'SECURITY DEFINER' : 'invoker'}, search_path ${fn.searchPath ?? 'unset'}`, expected: '' });
    else if (other.def !== fn.def) findings.push({ kind: 'DIFFERENT', area: 'function', item: key, production: `sha ${createHash('sha256').update(fn.def).digest('hex').slice(0, 10)}, ${fn.securityDefiner ? 'DEFINER' : 'invoker'}, search_path ${fn.searchPath ?? 'unset'}`, expected: `sha ${createHash('sha256').update(other.def).digest('hex').slice(0, 10)}, ${other.securityDefiner ? 'DEFINER' : 'invoker'}, search_path ${other.searchPath ?? 'unset'}` });
  }
  for (const key of expected.functions.keys()) if (!production.functions.has(key)) findings.push({ kind: 'NOT_IN_PRODUCTION', area: 'function', item: key, production: '', expected: 'present' });
  for (const table of new Set([...production.rls.keys(), ...expected.rls.keys()])) {
    const a = JSON.stringify(production.rls.get(table) ?? { enabled: false, forced: false }); const b = JSON.stringify(expected.rls.get(table) ?? { enabled: false, forced: false });
    if (a !== b) findings.push({ kind: 'DIFFERENT', area: 'rls', item: table, production: a, expected: b });
  }
  diffSets(production.grants, expected.grants, 'grant', findings);
  diffSets(production.defaultPrivileges, expected.defaultPrivileges, 'default privilege', findings);
  diffSets(new Set([...production.extensions.keys()]), new Set([...expected.extensions.keys()]), 'extension', findings);
  diffSets(production.sequences, expected.sequences, 'sequence', findings);
  diffSets(new Set(production.views.keys()), new Set(expected.views.keys()), 'view', findings);
  diffSets(production.types, expected.types, 'type', findings);
  return findings;
}

export function buildComparisonReport(findings, { productionFile, expectedFile }) {
  const byKind = (kind) => findings.filter((f) => f.kind === kind);
  const section = (title, items) => `## ${title} (${items.length})\n\n${items.length ? `| area | object | production | expected after install |\n|---|---|---|---|\n${items.map((f) => `| ${f.area} | \`${f.item}\` | ${String(f.production).replace(/\|/g, '\\|').slice(0, 160)} | ${String(f.expected).replace(/\|/g, '\\|').slice(0, 160)} |`).join('\n')}` : '_none_'}\n`;
  return `# Production export vs proposed staging install (generated)

Production export: \`${basename(productionFile)}\`. Expected: \`${basename(expectedFile)}\` (the dump of what install steps 01-14 produce).
Static comparison only; nothing was executed.

${section('In production, absent from the proposed install (missing tables, columns, constraints, policies, grants...)', byKind('MISSING_IN_EXPECTED'))}
${section('In the proposed install, absent from production (invented or assumed by the derived schema)', byKind('NOT_IN_PRODUCTION'))}
${section('Present in both but different (types, defaults, definitions, privileges)', byKind('DIFFERENT'))}
${section('Same definition under a different name', byKind('NAME_ONLY'))}
`;
}

function main(argv) {
  const [command, ...rest] = argv;
  const option = (name, fallback) => { const index = rest.indexOf(name); return index >= 0 ? rest[index + 1] : fallback; };
  if (command === 'validate') {
    const file = rest[0];
    if (!file) throw new Error('usage: validate <dump.sql> [--out-dir dir] [--base name]');
    const text = readFileSync(file, 'utf8');
    const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
    const bytes = readFileSync(file).length;
    const result = validateDump(text);
    const outDir = option('--out-dir', 'supabase/staging/source');
    const base = option('--base', basename(file).replace(/\.sql$/, ''));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${base}.sha256`), `${sha256}  ${basename(file)}\n`);
    writeFileSync(join(outDir, 'schema_inventory.md'), buildInventory(result.model, { file, sha256, bytes }));
    writeFileSync(join(outDir, 'schema_validation_report.md'), buildValidationReport(result, { file, sha256, bytes }));
    for (const check of result.checks) console.log(`${String(check.id).padStart(2)} ${check.status.padEnd(6)} ${check.title}`);
    console.log(`${bytes} bytes, sha256 ${sha256}`);
    process.exit(result.failed ? 1 : 0);
  } else if (command === 'compare') {
    const [productionFile, expectedFile] = rest;
    if (!productionFile || !expectedFile) throw new Error('usage: compare <production-dump.sql> <expected-dump.sql> [--out file.md]');
    const findings = compareModels(parseDump(readFileSync(productionFile, 'utf8')), parseDump(readFileSync(expectedFile, 'utf8')));
    const report = buildComparisonReport(findings, { productionFile, expectedFile });
    const out = option('--out', 'supabase/staging/source/schema_comparison.md');
    mkdirSync(join(out, '..'), { recursive: true });
    writeFileSync(out, report);
    console.log(`${findings.length} difference(s); report written to ${out}`);
  } else {
    console.error('usage: node scripts/schema-export.mjs validate|compare ...');
    process.exit(2);
  }
}

if (process.argv[1] && process.argv[1].endsWith('schema-export.mjs')) main(process.argv.slice(2));
