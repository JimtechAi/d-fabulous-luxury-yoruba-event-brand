// Static, read-only extraction of a structured inventory from the production schema-only dump.
//   node scripts/generate-production-inventory.mjs [dump.sql] [out.json]
// Defaults: supabase/staging/source/production_public_schema.sql -> supabase/staging/reports/production_schema_inventory.json
// It only reads the dump and writes the JSON. It opens no database connection and executes no SQL. The output is deterministic
// (no timestamps) so the committed JSON can be compared with a fresh run.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitStatements } from './schema-export.mjs';

const unq = (text) => text.replace(/"/g, '');
const squash = (text) => text.replace(/\s+/g, ' ').trim();

function matching(text, openIndex) {
  let depth = 0; let quote = null;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function splitTop(body) {
  const parts = []; let depth = 0; let quote = null; let current = '';
  for (const ch of body) {
    if (quote) { current += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; current += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Returns the text of the parenthesised group that follows `keyword` (e.g. USING, WITH CHECK), or null. */
function clause(text, keyword) {
  const m = new RegExp(`\\b${keyword}\\s*\\(`, 'i').exec(text);
  if (!m) return null;
  const open = text.indexOf('(', m.index);
  const close = matching(text, open);
  return squash(unq(text.slice(open + 1, close)));
}

function columnsOf(text) { return splitTop(text).map((c) => unq(c).trim().replace(/\s+(ASC|DESC)\b.*$/i, '')); }

export function buildInventory(sql, { sha256, bytes, file }) {
  const statements = splitStatements(sql);
  const inv = {
    source: { file, sha256, bytes, dumpedFromServer: /Dumped from database version ([0-9.]+)/.exec(sql)?.[1] ?? null, dumpedByPgDump: /Dumped by pg_dump version ([0-9.]+)/.exec(sql)?.[1] ?? null },
    tables: {}, sequences: {}, functions: {}, triggers: [], policies: [], indexes: [], constraints: [], grants: [], revokes: [], defaultPrivileges: [], owners: [],
    extensions: [], schemas: [], findings: {},
  };
  const grantsByObject = new Map();

  for (const statement of statements) {
    let m;
    if ((m = /^CREATE SCHEMA "?([^"\s]+)"?/i.exec(statement))) inv.schemas.push(m[1]);
    else if ((m = /^CREATE EXTENSION (?:IF NOT EXISTS )?"?([^"\s]+)"?/i.exec(statement))) inv.extensions.push(m[1]);
    else if ((m = /^CREATE TABLE "public"\."([^"]+)"\s*\(/i.exec(statement))) {
      const open = statement.indexOf('(', m[0].length - 1);
      const close = matching(statement, open);
      const table = { columns: [], rls: { enabled: false, forced: false }, owner: null };
      for (const element of splitTop(statement.slice(open + 1, close))) {
        const c = /^"([^"]+)"\s+([\s\S]*)$/.exec(element);
        if (c && !/^CONSTRAINT\b/i.test(element)) {
          const rest = c[2];
          const cut = rest.search(/\s(?:DEFAULT|NOT NULL|NULL|GENERATED|COLLATE|CONSTRAINT)\b/);
          const type = unq(squash(cut < 0 ? rest : rest.slice(0, cut)));
          const tail = cut < 0 ? '' : rest.slice(cut);
          const def = /\sDEFAULT\s+([\s\S]*?)(?=\sNOT NULL\b|\sGENERATED\b|\sCOLLATE\b|$)/.exec(tail);
          table.columns.push({ name: c[1], type, nullable: !/\bNOT NULL\b/.test(tail), default: def ? unq(squash(def[1])) : null, generated: /\bGENERATED\b/.test(tail) ? squash(tail.slice(tail.search(/GENERATED/))) : null });
        } else {
          const cm = /^CONSTRAINT "([^"]+)"\s+([\s\S]*)$/i.exec(element);
          if (cm) inv.constraints.push({ table: m[1], name: cm[1], ...classify(unq(squash(cm[2]))) });
        }
      }
      inv.tables[m[1]] = table;
    } else if ((m = /^ALTER TABLE ONLY "public"\."([^"]+)"\s+ADD CONSTRAINT "([^"]+)"\s+([\s\S]*)$/i.exec(statement))) {
      inv.constraints.push({ table: m[1], name: m[2], ...classify(unq(squash(m[3]))) });
    } else if ((m = /^ALTER TABLE "public"\."([^"]+)"\s+(ENABLE|FORCE|DISABLE|NO FORCE) ROW LEVEL SECURITY/i.exec(statement))) {
      const t = inv.tables[m[1]]; const v = m[2].toUpperCase();
      if (t) { if (v === 'ENABLE') t.rls.enabled = true; else if (v === 'DISABLE') t.rls.enabled = false; else if (v === 'FORCE') t.rls.forced = true; else t.rls.forced = false; }
    } else if ((m = /^ALTER (TABLE|FUNCTION|SEQUENCE|SCHEMA) ([\s\S]*?) OWNER TO "([^"]+)"$/i.exec(statement))) {
      inv.owners.push({ kind: m[1].toUpperCase(), object: unq(squash(m[2])), owner: m[3] });
      const t = /^"public"\."([^"]+)"$/.exec(squash(m[2]));
      if (m[1].toUpperCase() === 'TABLE' && t && inv.tables[t[1]]) inv.tables[t[1]].owner = m[3];
    } else if ((m = /^CREATE (UNIQUE )?INDEX "([^"]+)" ON "public"\."([^"]+)" USING "?(\w+)"? \(([\s\S]*)\)(?:\s+WHERE\s+([\s\S]*))?$/i.exec(statement))) {
      const cols = splitTop(m[5]).map((c) => unq(squash(c)));
      inv.indexes.push({ name: m[2], table: m[3], unique: Boolean(m[1]), method: m[4], columns: cols, predicate: m[6] ? unq(squash(m[6])) : null, functional: cols.some((c) => /[()]/.test(c)), definition: unq(squash(statement)) });
    } else if ((m = /^CREATE SEQUENCE "public"\."([^"]+)"/i.exec(statement))) {
      inv.sequences[m[1]] = { definition: unq(squash(statement)) };
    } else if ((m = /^CREATE TRIGGER "([^"]+)" (BEFORE|AFTER|INSTEAD OF) ([\s\S]*?) ON "public"\."([^"]+)" ([\s\S]*?)EXECUTE FUNCTION "public"\."([^"]+)"\(\)$/i.exec(statement))) {
      inv.triggers.push({ name: m[1], table: m[4], timing: m[2].toUpperCase(), events: unq(squash(m[3])), forEach: /FOR EACH ROW/i.test(m[5]) ? 'ROW' : 'STATEMENT', function: `public.${m[6]}()`, definition: unq(squash(statement)) });
    } else if ((m = /^CREATE POLICY "((?:[^"]|"")+)" ON "public"\."([^"]+)"\s*([\s\S]*)$/i.exec(statement))) {
      const rest = m[3];
      const head = rest.replace(/\bUSING\s*\([\s\S]*$/i, '').replace(/\bWITH CHECK\s*\([\s\S]*$/i, '');
      const roles = /\bTO\s+([\s\S]+)$/i.exec(head)?.[1];
      inv.policies.push({
        table: m[2], name: m[1].replace(/""/g, '"'), permissive: !/\bAS RESTRICTIVE\b/i.test(head),
        command: (/\bFOR (ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(head)?.[1] ?? 'ALL').toUpperCase(),
        roles: roles ? roles.split(',').map((r) => unq(r.trim())) : ['public'],
        using: clause(rest, 'USING'), withCheck: clause(rest, 'WITH CHECK'),
      });
    } else if ((m = /^CREATE FUNCTION "public"\."([^"]+)"\(([\s\S]*?)\) RETURNS ([\s\S]*?)\s+LANGUAGE "?(\w+)"?([\s\S]*?)\s+AS (\$[A-Za-z0-9_]*\$)([\s\S]*)\6$/i.exec(statement))) {
      const attrs = m[5];
      const open = statement.indexOf('(', statement.indexOf('"public"."' + m[1] + '"'));
      const sig = `public.${m[1]}(${unq(squash(statement.slice(open + 1, matching(statement, open)))).replace(/"/g, '')})`;
      const body = m[7];
      const argTypes = splitTop(statement.slice(open + 1, matching(statement, open))).map((a) => unq(squash(a)).replace(/\s+DEFAULT\s+.*$/i, '').split(' ').slice(1).join(' ')).filter(Boolean);
      const key = `public.${m[1]}(${argTypes.join(', ')})`;
      inv.functions[key] = {
        signature: sig, name: m[1], returns: unq(squash(m[3])), language: m[4].toLowerCase(),
        security: /\bSECURITY DEFINER\b/i.test(attrs) ? 'DEFINER' : 'INVOKER',
        volatility: /\b(IMMUTABLE|STABLE|VOLATILE)\b/i.exec(attrs)?.[1]?.toUpperCase() ?? 'VOLATILE',
        searchPath: /SET "?search_path"? TO ([^\n]*?)\s*$/im.exec(attrs.replace(/\s+/g, ' ').replace(/ ?$/, ''))?.[1]?.replace(/["']/g, '') ?? null,
        owner: null, executeGrants: [], revokedFromPublic: false,
        references: references(body), bodyLines: body.split('\n').length,
      };
    } else if ((m = /^(GRANT|REVOKE) ([\s\S]+?) ON (TABLE|SEQUENCE|FUNCTION|SCHEMA) ([\s\S]+?) (TO|FROM) ([\s\S]+)$/i.exec(statement))) {
      const verb = m[1].toUpperCase(); const privs = m[2].split(',').map((p) => squash(p).toUpperCase()).sort();
      const kind = m[3].toUpperCase(); const object = unq(squash(m[4]));
      const roles = m[6].split(',').map((r) => unq(squash(r)));
      const record = { kind, object, roles, privileges: privs };
      (verb === 'GRANT' ? inv.grants : inv.revokes).push(record);
      grantsByObject.set(`${kind} ${object}|${verb}`, [...(grantsByObject.get(`${kind} ${object}|${verb}`) ?? []), record]);
    } else if (/^ALTER DEFAULT PRIVILEGES/i.test(statement)) {
      const d = /^ALTER DEFAULT PRIVILEGES FOR ROLE "([^"]+)" IN SCHEMA "([^"]+)" GRANT ([\s\S]+?) ON (\w+) TO "([^"]+)"$/i.exec(statement);
      inv.defaultPrivileges.push(d ? { forRole: d[1], schema: d[2], on: d[4].toUpperCase(), grantee: d[5], privileges: d[3].split(',').map((p) => p.trim().toUpperCase()) } : { raw: unq(squash(statement)) });
    }
  }

  for (const o of inv.owners) if (o.kind === 'FUNCTION') { const f = Object.values(inv.functions).find((fn) => o.object.startsWith(`public.${fn.name}(`)); if (f) f.owner = o.owner; }
  for (const f of Object.values(inv.functions)) {
    const object = f.signature.replace(/^public\./, 'public.');
    for (const g of inv.grants.filter((x) => x.kind === 'FUNCTION' && x.object.replace(/\s+/g, '').startsWith(`public.${f.name}(`))) f.executeGrants.push(...g.roles);
    f.revokedFromPublic = inv.revokes.some((r) => r.kind === 'FUNCTION' && r.roles.includes('PUBLIC') && r.object.replace(/\s+/g, '').startsWith(`public.${f.name}(`));
    void object;
  }
  inv.findings = analyse(inv);
  return inv;
}

function classify(def) {
  if (/^PRIMARY KEY/i.test(def)) return { type: 'PRIMARY KEY', columns: columnsOf(/\(([^)]*)\)/.exec(def)[1]), definition: def };
  if (/^UNIQUE/i.test(def)) return { type: 'UNIQUE', columns: columnsOf(/\(([^)]*)\)/.exec(def)[1]), definition: def };
  if (/^CHECK/i.test(def)) return { type: 'CHECK', expression: def.replace(/^CHECK\s*/i, ''), definition: def };
  const fk = /^FOREIGN KEY \(([^)]*)\) REFERENCES (?:public\.)?(?:(\w+)\.)?(\w+)\s*\(([^)]*)\)(?: ON DELETE ([A-Z ]+?))?(?: ON UPDATE ([A-Z ]+?))?$/i.exec(def);
  if (fk) {
    const m2 = /REFERENCES ((?:\w+\.)?\w+)\s*\(/i.exec(def)[1];
    return { type: 'FOREIGN KEY', columns: columnsOf(fk[1]), references: m2.includes('.') ? m2 : `public.${m2}`, referencedColumns: columnsOf(fk[4]), onDelete: fk[5] ?? 'NO ACTION', onUpdate: fk[6] ?? 'NO ACTION', definition: def };
  }
  return { type: 'OTHER', definition: def };
}

function references(body) {
  const out = new Set();
  for (const m of body.matchAll(/\b(auth|storage|vault|cron|realtime|net|extensions|graphql|pgsodium)\.([a-z_]+)/gi)) out.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
  for (const m of body.matchAll(/\bpublic\.([a-z_]+)/gi)) out.add(`public.${m[1].toLowerCase()}`);
  for (const m of body.matchAll(/nextval\('([^']+)'/gi)) out.add(`sequence:${m[1]}`);
  for (const m of body.matchAll(/\bpg_event_trigger_ddl_commands\b|\bpg_catalog\.\w+/g)) out.add(m[0]);
  return [...out].sort();
}

function analyse(inv) {
  const f = {};
  const constraintCols = inv.constraints.filter((c) => c.type === 'PRIMARY KEY' || c.type === 'UNIQUE').map((c) => ({ table: c.table, columns: c.columns, via: c.name }));
  const idxCols = [...inv.indexes.filter((i) => !i.predicate && i.method === 'btree').map((i) => ({ table: i.table, columns: i.columns, via: i.name })), ...constraintCols];
  f.foreignKeysWithoutLeadingIndex = inv.constraints.filter((c) => c.type === 'FOREIGN KEY' && c.references.startsWith('public.') || c.type === 'FOREIGN KEY')
    .filter((c) => !idxCols.some((i) => i.table === c.table && c.columns.every((col, n) => i.columns[n] === col)))
    .map((c) => `${c.table}.${c.columns.join(',')} -> ${c.references}`);
  f.redundantIndexes = [];
  for (const i of inv.indexes) {
    if (i.predicate || i.functional) continue;
    const cover = idxCols.find((o) => o.via !== i.name && o.table === i.table && i.columns.every((col, n) => o.columns[n] === col));
    if (cover) f.redundantIndexes.push({ index: i.name, table: i.table, columns: i.columns, coveredBy: cover.via, exact: cover.columns.length === i.columns.length });
  }
  const groups = new Map();
  for (const p of inv.policies) {
    const key = `${p.table}|${p.command}|${p.permissive}|${[...p.roles].sort().join(',')}|${p.using}|${p.withCheck}`;
    groups.set(key, [...(groups.get(key) ?? []), p.name]);
  }
  f.duplicatePolicies = [...groups.entries()].filter(([, names]) => names.length > 1).map(([key, names]) => ({ table: key.split('|')[0], command: key.split('|')[1], policies: names }));
  f.tablesWithoutPolicyForCommand = {};
  for (const [t, info] of Object.entries(inv.tables)) {
    const cmds = new Set(inv.policies.filter((p) => p.table === t && p.permissive).flatMap((p) => (p.command === 'ALL' ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] : [p.command])));
    f.tablesWithoutPolicyForCommand[t] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].filter((c) => !cmds.has(c));
    void info;
  }
  f.policiesNotCheckingIsActive = inv.policies.filter((p) => /is_(admin|owner)\(\)/.test(`${p.using} ${p.withCheck}`) && !/is_active/.test(`${p.using} ${p.withCheck}`)).map((p) => `${p.table}: ${p.name}`);
  f.roleChangeProtection = { trigger: inv.triggers.find((t) => t.function === 'public.prevent_role_escalation()')?.name ?? null };
  f.sensitivePrivileges = [];
  for (const g of inv.grants.filter((x) => x.kind === 'TABLE')) {
    const risky = g.privileges.filter((p) => ['TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN'].includes(p) || p === 'ALL');
    for (const role of g.roles.filter((r) => ['anon', 'authenticated'].includes(r))) if (risky.length) f.sensitivePrivileges.push({ table: g.object.replace(/^public\./, ''), role, privileges: g.privileges });
  }
  f.functionsWithNoApiRoleExecute = Object.values(inv.functions).filter((fn) => fn.revokedFromPublic && !fn.executeGrants.some((r) => ['anon', 'authenticated', 'service_role'].includes(r))).map((fn) => fn.signature);
  f.functionsExecutableByPublic = Object.values(inv.functions).filter((fn) => !fn.revokedFromPublic).map((fn) => fn.signature);
  f.definerFunctionsWithoutPgTempLast = Object.values(inv.functions).filter((fn) => fn.security === 'DEFINER' && fn.searchPath !== '' && fn.searchPath !== 'pg_catalog' && !/pg_temp$/.test(fn.searchPath ?? '')).map((fn) => `${fn.signature} search_path=${fn.searchPath}`);
  return f;
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const input = process.argv[2] ?? `${root}supabase/staging/source/production_public_schema.sql`;
  const output = process.argv[3] ?? `${root}supabase/staging/reports/production_schema_inventory.json`;
  const bytes = readFileSync(input);
  const inv = buildInventory(bytes.toString('utf8'), { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, file: 'supabase/staging/source/production_public_schema.sql' });
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(inv, null, 2)}\n`);
  console.log(`wrote ${output}: ${Object.keys(inv.tables).length} tables, ${Object.keys(inv.functions).length} functions, ${inv.policies.length} policies, ${inv.triggers.length} triggers, ${inv.indexes.length} indexes, ${inv.constraints.length} constraints`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
