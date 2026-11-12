-- D'FABULOUS: READ-ONLY SCHEMA EXTRACT FOR COMPARISON  (supabase/staging/20261112_schema_compare_readonly.sql)
-- Run the SAME script, read-only, in (1) the dfabulous-staging SQL editor after the baseline is installed and (2) production
-- (owner only, in a read-only session). Export each result set and diff them. It only reads system catalogs: no table data
-- is selected, nothing is created, altered or granted. It lists structure, never row contents.
-- Nothing here reads auth.users, bookings, payments, messages or any other customer data.

BEGIN READ ONLY;

-- 1. Columns of the application tables (this is what replaces the "derived" base schema if they differ).
SELECT 'column' AS kind, c.relname AS object, a.attnum AS ord, a.attname AS name,
       format_type(a.atttypid, a.atttypmod) AS detail,
       CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'NULL' END || COALESCE(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '') AS extra
FROM pg_class c
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
ORDER BY c.relname, a.attnum;

-- 2. Constraints and indexes (primary/unique/foreign/check/exclusion, including bookings_active_event_date_unique and any 23P01 exclusion).
SELECT 'constraint' AS kind, conrelid::regclass::text AS object, conname AS name, pg_get_constraintdef(oid) AS detail
FROM pg_constraint WHERE connamespace = 'public'::regnamespace
UNION ALL
SELECT 'index', tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
ORDER BY 1, 2, 3;

-- 3. Row level security state and policies.
SELECT 'rls' AS kind, c.relname AS object, c.relrowsecurity::text AS detail, c.relforcerowsecurity::text AS extra
FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') ORDER BY c.relname;

SELECT 'policy' AS kind, tablename AS object, policyname AS name, permissive, roles::text, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;

-- 4. Table privileges for the Supabase API roles.
SELECT 'table_grant' AS kind, c.relname AS object,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS privileges
FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
  AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'))
GROUP BY c.relname, a.grantee ORDER BY c.relname, grantee;

-- 5. Functions (full definitions, including the live is_owner()/is_admin() variant) and who may execute them.
SELECT 'function' AS kind, p.oid::regprocedure::text AS object, pg_get_functiondef(p.oid) AS detail,
       (SELECT string_agg(g, ',' ORDER BY g) FROM (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS g
          FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a) grantees) AS executors
FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' ORDER BY 2;

-- 6. Triggers on public tables (including any sign-up trigger on auth.users that creates profiles).
SELECT 'trigger' AS kind, tgrelid::regclass::text AS object, tgname AS name, tgenabled::text AS enabled, pg_get_triggerdef(oid) AS detail
FROM pg_trigger WHERE NOT tgisinternal AND (tgrelid::regclass::text LIKE 'public.%' OR tgrelid = 'auth.users'::regclass) ORDER BY 2, 3;

-- 7. Extensions.
SELECT 'extension' AS kind, extname AS object, extversion AS detail FROM pg_extension ORDER BY extname;

ROLLBACK;
