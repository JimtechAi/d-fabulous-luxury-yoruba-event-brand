// Regenerates supabase/staging/expected/baseline_after_install.pgdump.sql: a pg_dump (schema-only, public) of the IN-MEMORY database that
// results from installing supabase/staging/install/01..14. It is the "expected" side of the comparison with the verified production export.
// Needs @electric-sql/pglite-tools, which is deliberately NOT a project dependency. Install it outside the repository:
//   npm install --prefix %TEMP%\pgtools @electric-sql/pglite@0.5.16 @electric-sql/pglite-tools
//   set NODE_PATH=%TEMP%\pgtools\node_modules   (PowerShell: $env:NODE_PATH = "$env:TEMP\pgtools\node_modules")
//   node scripts/dump-expected-baseline.mjs
// Connects to no Supabase project; runs only the repository's own SQL in memory. Step 15 (pg_cron) is excluded.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let PGlite; let pgDump;
try {
  ({ PGlite } = require('@electric-sql/pglite'));
  ({ pgDump } = await import(require.resolve('@electric-sql/pglite-tools/pg_dump')));
} catch {
  console.error('Missing @electric-sql/pglite-tools. See the header of this script for the out-of-repository install.');
  process.exit(1);
}

const dir = new URL('../supabase/staging/install/', import.meta.url);
const out = new URL('../supabase/staging/expected/baseline_after_install.pgdump.sql', import.meta.url);
const db = new PGlite();
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
`);
for (const name of readdirSync(dir).filter((n) => n.endsWith('.sql') && !n.startsWith('15')).sort()) {
  await db.exec(readFileSync(new URL(name, dir), 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS \w+;/g, ''));
}
const file = await pgDump({ pg: db, args: ['--schema-only', '--quote-all-identifiers', '--schema=public'] });
writeFileSync(out, await file.text());
console.log('wrote', out.pathname);
