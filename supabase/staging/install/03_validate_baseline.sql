-- D'FABULOUS STAGE 4 / PHASE 1 / 03: baseline validation (READ-ONLY)
-- STATUS: PREPARED, NOT EXECUTED. Run after 01 and 02 on dfabulous-staging. It changes nothing: one READ ONLY transaction containing a single SELECT.
-- Output: one row per check (check_id, name, status PASS|FAIL|INFO, detail); the LAST row, check_id 'ZZ', is the verdict. Any FAIL means stop.
-- Proves (against the unchanged production export): objects, columns, function bodies, policies, triggers, indexes, constraints, RLS, ownership, and the
-- least-privilege matrix of 02. It cannot prove runtime behaviour on a real Supabase project; run the application tests described in the runbook.
-- The generated block below is produced by scripts/build-stage4-baseline.mjs from the production export; do not edit it by hand.

BEGIN READ ONLY;

WITH
-- BEGIN GENERATED (scripts/build-stage4-baseline.mjs): expected hashes derived from the production export
expected_function_bodies(name, body_md5) AS (VALUES
  ('block_event_date', '2dd9392c075df37bbb4d6017b7a0091e'),
  ('generate_booking_reference', 'c59c95e8621134365faf906168e62733'),
  ('get_event_availability', '76ca2d3aed4353fb16d8fc3b70f002a2'),
  ('handle_new_user', '80604e62cca862cff22a095d27d953fe'),
  ('is_admin', 'd923fd6652f8c8145bbd481256589f6c'),
  ('is_owner', 'e240407e6ac4157d23f8a38ede9cb63a'),
  ('prevent_booking_on_blocked_date', '2317fb54083017d9ef790f14ac7c390e'),
  ('prevent_role_escalation', '8e24e89f1b87893b83a3a560c6ad382e'),
  ('purge_archived_bookings', 'a764f2509edd22731bc808b71e495f6f'),
  ('rls_auto_enable', '99be20677b456ea8d3be47bdd44fb369'),
  ('unblock_event_date', '2b0f3b511765a3852ff6ce6620dbe2af'),
  ('update_updated_at_column', 'ce195772454f63b8c9d7882cca558d46')
),
expected_column_signatures(table_name, signature_md5) AS (VALUES
  ('audit_logs', '16824934b8740cdc78b696518bb09be1'),
  ('blocked_dates', '3747f3c060a39cb475be34a403ccd114'),
  ('bookings', '619d719de91d1d49c08e652a6fa8b73a'),
  ('gallery', '896ab19e7e5cf5932a92bd3d891ad50a'),
  ('messages', '3f7944ebcdbba9532b8f4d960c302873'),
  ('payments', 'e566a96d61818744ed3592c44bbef70f'),
  ('permissions', 'f7a2a4e46fe77f0b2770c6ef63a8bc84'),
  ('profiles', '54f89e3fdad151565b33b5dd943e6cfd'),
  ('services', 'f5ce7d8af29559bd57d23a7cf0a806ed'),
  ('site_settings', '1c499a7e9940a175b13176f58aadae78'),
  ('testimonials', 'a5f7791b3508b89a00521e150a2cf8a9'),
  ('user_permissions', '1bc9e2726223977dc332109888bb27e3')
),
expected_object_names(kind, item_count, names_md5) AS (VALUES
  ('policies', 35, 'fd9a74c6f4e48b312a1a50ef727cf277'),
  ('triggers', 10, '321634b5de7f12bacf622b3166ed7488'),
  ('indexes', 42, '598f17927fa0948b659e5d5d349d5af0'),
  ('constraints', 35, 'cccc0715a0e065b6b3b70924e5ef2bb0')
),
-- END GENERATED
expected_privileges(tbl, grantee, privs) AS (VALUES
  ('audit_logs',       'authenticated', 'SELECT'),
  ('bookings',         'authenticated', 'SELECT, UPDATE, DELETE'),
  ('payments',         'authenticated', 'SELECT, INSERT'),
  ('permissions',      'authenticated', 'SELECT'),
  ('profiles',         'authenticated', 'SELECT'),
  ('services',         'authenticated', 'SELECT'),
  ('user_permissions', 'authenticated', 'SELECT'),
  ('services',         'anon',          'SELECT'),
  ('audit_logs',       'service_role',  'SELECT, INSERT'),
  ('blocked_dates',    'service_role',  'SELECT, INSERT, DELETE'),
  ('bookings',         'service_role',  'SELECT, INSERT, UPDATE'),
  ('gallery',          'service_role',  'SELECT'),
  ('messages',         'service_role',  'SELECT, INSERT, UPDATE'),
  ('payments',         'service_role',  'SELECT'),
  ('profiles',         'service_role',  'SELECT, INSERT, UPDATE, DELETE'),
  ('services',         'service_role',  'SELECT'),
  ('site_settings',    'service_role',  'SELECT, INSERT, UPDATE'),
  ('testimonials',     'service_role',  'SELECT'),
  ('user_permissions', 'service_role',  'SELECT, INSERT, UPDATE, DELETE')
),
expected_expanded AS (
  SELECT tbl, grantee, trim(p) AS priv FROM expected_privileges, unnest(string_to_array(privs, ',')) AS p
),
known_tables AS (SELECT table_name AS tbl FROM expected_column_signatures),
actual_privileges AS (
  SELECT t.tbl, g.grantee, p.priv, has_table_privilege(g.grantee, format('public.%I', t.tbl), p.priv) AS has
  FROM known_tables t
  CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS g(grantee)
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) AS p(priv)
),
privilege_diff AS (
  SELECT a.tbl, a.grantee, a.priv, a.has FROM actual_privileges a
  LEFT JOIN expected_expanded e ON e.tbl = a.tbl AND e.grantee = a.grantee AND e.priv = a.priv
  WHERE a.has <> (e.priv IS NOT NULL)
),
actual_names AS (
  SELECT 'policies' AS kind, count(*) AS n, md5(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || permissive, E'\n' ORDER BY tablename || '|' || policyname || '|' || cmd || '|' || permissive COLLATE "C")) AS h
    FROM pg_policies WHERE schemaname = 'public'
  UNION ALL
  SELECT 'triggers', count(*), md5(string_agg(c.relname || '|' || t.tgname, E'\n' ORDER BY c.relname || '|' || t.tgname COLLATE "C"))
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal AND c.relname IN (SELECT tbl FROM known_tables)
  UNION ALL
  SELECT 'indexes', count(*), md5(string_agg(tablename || '|' || indexname, E'\n' ORDER BY tablename || '|' || indexname COLLATE "C"))
    FROM pg_indexes WHERE schemaname = 'public' AND tablename IN (SELECT tbl FROM known_tables)
  UNION ALL
  SELECT 'constraints', count(*), md5(string_agg(c.relname || '|' || k.conname || '|' || k.contype::text, E'\n' ORDER BY c.relname || '|' || k.conname || '|' || k.contype::text COLLATE "C"))
    FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND k.contype IN ('p', 'f', 'u', 'c') AND c.relname IN (SELECT tbl FROM known_tables)
),
actual_columns AS (
  SELECT c.relname AS table_name,
         md5(string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || CASE WHEN a.attnotnull THEN 'notnull' ELSE 'null' END, ',' ORDER BY a.attnum)) AS signature_md5
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
  GROUP BY c.relname
),
fn AS (
  SELECT p.oid, p.proname, p.prosecdef, p.proconfig, p.prosrc, pg_get_userbyid(p.proowner) AS owner_name, p.prokind
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
),
checks(check_id, name, ok, detail) AS (
  SELECT 'V01', 'Phase 1 install marker present for the staging project',
         EXISTS (SELECT 1 FROM dfabulous_stage4.install_marker WHERE project_ref = 'qwoxxroszmwobnzqgndr' AND phase = 'phase1-baseline'),
         'marker rows: ' || (SELECT count(*) FROM dfabulous_stage4.install_marker)
  UNION ALL
  SELECT 'V02', 'exactly the 12 production tables exist in public (plus optional rate-limit table)',
         (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN (SELECT tbl FROM known_tables)) = 12
         AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND c.relname NOT IN (SELECT tbl FROM known_tables) AND c.relname <> 'api_rate_limits'),
         coalesce((SELECT string_agg(c.relname, ', ') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND c.relname NOT IN (SELECT tbl FROM known_tables)), 'no extra relations')
  UNION ALL
  SELECT 'V03', 'RLS enabled on all 12 tables, FORCE on none',
         (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname IN (SELECT tbl FROM known_tables) AND c.relrowsecurity AND NOT c.relforcerowsecurity) = 12,
         'tables with RLS and no FORCE: ' || (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname IN (SELECT tbl FROM known_tables) AND c.relrowsecurity AND NOT c.relforcerowsecurity)
  UNION ALL
  SELECT 'V04', 'column names, types and nullability equal the production export (per table)',
         NOT EXISTS (SELECT 1 FROM expected_column_signatures e LEFT JOIN actual_columns a USING (table_name) WHERE a.signature_md5 IS DISTINCT FROM e.signature_md5),
         coalesce((SELECT string_agg(e.table_name, ', ') FROM expected_column_signatures e LEFT JOIN actual_columns a USING (table_name) WHERE a.signature_md5 IS DISTINCT FROM e.signature_md5), 'all 12 tables match')
  UNION ALL
  SELECT 'V05', 'policy, trigger, index and constraint inventories equal the production export (names, commands, counts)',
         NOT EXISTS (SELECT 1 FROM expected_object_names e LEFT JOIN actual_names a USING (kind) WHERE a.h IS DISTINCT FROM e.names_md5 OR a.n IS DISTINCT FROM e.item_count),
         coalesce((SELECT string_agg(e.kind, ', ') FROM expected_object_names e LEFT JOIN actual_names a USING (kind) WHERE a.h IS DISTINCT FROM e.names_md5 OR a.n IS DISTINCT FROM e.item_count), 'policies, triggers, indexes, constraints match')
  UNION ALL
  SELECT 'V06', 'function bodies equal the production export (rls_auto_enable may be the platform copy)',
         NOT EXISTS (SELECT 1 FROM expected_function_bodies e LEFT JOIN fn ON fn.proname = e.name WHERE e.name <> 'rls_auto_enable' AND md5(fn.prosrc) IS DISTINCT FROM e.body_md5),
         coalesce((SELECT string_agg(e.name, ', ') FROM expected_function_bodies e LEFT JOIN fn ON fn.proname = e.name WHERE e.name <> 'rls_auto_enable' AND md5(fn.prosrc) IS DISTINCT FROM e.body_md5), 'all bodies match')
  UNION ALL
  SELECT 'V07', 'rls_auto_enable() exists (production body or the platform copy)',
         EXISTS (SELECT 1 FROM fn WHERE proname = 'rls_auto_enable'),
         CASE WHEN (SELECT md5(prosrc) FROM fn WHERE proname = 'rls_auto_enable') = (SELECT body_md5 FROM expected_function_bodies WHERE name = 'rls_auto_enable') THEN 'production body' ELSE 'platform copy or missing (compare manually)' END
  UNION ALL
  SELECT 'V08', 'SECURITY DEFINER functions all pin search_path; INVOKER set is exactly the two trigger helpers',
         NOT EXISTS (SELECT 1 FROM fn WHERE prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%'))
         AND (SELECT string_agg(proname, ',' ORDER BY proname) FROM fn WHERE NOT prosecdef AND proname IN (SELECT name FROM expected_function_bodies)) = 'generate_booking_reference,update_updated_at_column',
         'definer functions: ' || (SELECT count(*) FROM fn WHERE prosecdef)
  UNION ALL
  SELECT 'V09', 'all production triggers are enabled',
         NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgenabled <> 'O'),
         'triggers: ' || (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal)
  UNION ALL
  SELECT 'V10', 'booking_reference_seq exists with the production parameters',
         EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'booking_reference_seq' AND increment_by = 1 AND NOT cycle AND cache_size = 1),
         'present: ' || (to_regclass('public.booking_reference_seq') IS NOT NULL)
  UNION ALL
  SELECT 'V11', 'tables, sequence and production functions are owned by postgres',
         NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'S') AND pg_get_userbyid(c.relowner) <> 'postgres')
         AND NOT EXISTS (SELECT 1 FROM fn WHERE owner_name <> 'postgres' AND proname <> 'rls_auto_enable'),
         coalesce((SELECT string_agg(proname || ' owned by ' || owner_name, ', ') FROM fn WHERE owner_name <> 'postgres'), 'owners as expected')
  UNION ALL
  SELECT 'V12', 'table privileges for anon, authenticated, service_role equal the least-privilege matrix exactly (8 privilege types)',
         NOT EXISTS (SELECT 1 FROM privilege_diff),
         coalesce((SELECT string_agg(tbl || ':' || grantee || ':' || priv || CASE WHEN has THEN ' (unexpected)' ELSE ' (missing)' END, ', ') FROM privilege_diff), 'matrix matches')
  UNION ALL
  SELECT 'V13', 'PUBLIC holds no privilege on any relation or function in public',
         NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') AND a.grantee = 0)
         AND NOT EXISTS (SELECT 1 FROM fn CROSS JOIN LATERAL aclexplode(COALESCE((SELECT proacl FROM pg_proc WHERE oid = fn.oid), acldefault('f', (SELECT proowner FROM pg_proc WHERE oid = fn.oid)))) a WHERE a.grantee = 0),
         'checked relations and functions'
  UNION ALL
  SELECT 'V14', 'anon: SELECT on services only; no other relation privilege; no sequence privilege',
         (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a WHERE n.nspname = 'public' AND pg_get_userbyid(a.grantee) = 'anon' AND NOT (c.relname = 'services' AND a.privilege_type = 'SELECT')) = 0,
         'anon grants: ' || (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r'::"char", c.relowner))) a WHERE n.nspname = 'public' AND pg_get_userbyid(a.grantee) = 'anon')
  UNION ALL
  SELECT 'V15', 'function EXECUTE: is_admin/is_owner -> authenticated, purge_archived_bookings -> service_role, nothing else for anon/authenticated; service_role only on the production functions',
         NOT EXISTS (
           SELECT 1 FROM fn CROSS JOIN LATERAL (VALUES ('anon'), ('authenticated'), ('service_role')) AS g(grantee)
           WHERE has_function_privilege(g.grantee, fn.oid, 'EXECUTE') <> ((fn.proname IN ('is_admin', 'is_owner') AND g.grantee = 'authenticated') OR (fn.proname = 'purge_archived_bookings' AND g.grantee = 'service_role'))
             AND fn.owner_name = 'postgres' AND (g.grantee <> 'service_role' OR fn.proname IN (SELECT name FROM expected_function_bodies))),
         coalesce((SELECT string_agg(fn.proname || ':' || g.grantee, ', ') FROM fn CROSS JOIN LATERAL (VALUES ('anon'), ('authenticated'), ('service_role')) AS g(grantee)
           WHERE has_function_privilege(g.grantee, fn.oid, 'EXECUTE') <> ((fn.proname IN ('is_admin', 'is_owner') AND g.grantee = 'authenticated') OR (fn.proname = 'purge_archived_bookings' AND g.grantee = 'service_role'))
             AND fn.owner_name = 'postgres' AND (g.grantee <> 'service_role' OR fn.proname IN (SELECT name FROM expected_function_bodies))), 'execute matrix matches')
  UNION ALL
  SELECT 'V16', 'sequence privileges: service_role USAGE only; anon and authenticated none',
         has_sequence_privilege('service_role', 'public.booking_reference_seq', 'USAGE') AND NOT has_sequence_privilege('service_role', 'public.booking_reference_seq', 'UPDATE')
         AND NOT has_sequence_privilege('anon', 'public.booking_reference_seq', 'USAGE') AND NOT has_sequence_privilege('anon', 'public.booking_reference_seq', 'SELECT')
         AND NOT has_sequence_privilege('authenticated', 'public.booking_reference_seq', 'USAGE') AND NOT has_sequence_privilege('authenticated', 'public.booking_reference_seq', 'SELECT'),
         'sequence checked'
  UNION ALL
  SELECT 'V17', 'schema public: USAGE for the three API roles, CREATE for none',
         has_schema_privilege('anon', 'public', 'USAGE') AND has_schema_privilege('authenticated', 'public', 'USAGE') AND has_schema_privilege('service_role', 'public', 'USAGE')
         AND NOT has_schema_privilege('anon', 'public', 'CREATE') AND NOT has_schema_privilege('authenticated', 'public', 'CREATE') AND NOT has_schema_privilege('service_role', 'public', 'CREATE'),
         'schema checked'
  UNION ALL
  SELECT 'V18', 'no column-level privileges for PUBLIC or API roles on any public relation',
         NOT EXISTS (SELECT 1 FROM pg_attribute t JOIN pg_class c ON c.oid = t.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN LATERAL aclexplode(t.attacl) a WHERE n.nspname = 'public' AND t.attacl IS NOT NULL AND NOT t.attisdropped AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'))),
         'column ACLs checked'
  UNION ALL
  SELECT 'V19', 'default privileges of postgres (schema public and global) grant no API role or PUBLIC anything on tables, sequences, functions',
         NOT EXISTS (SELECT 1 FROM pg_default_acl d JOIN pg_roles rl ON rl.oid = d.defaclrole LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) a
                     WHERE rl.rolname = 'postgres' AND (n.nspname = 'public' OR d.defaclnamespace = 0) AND d.defaclobjtype IN ('r', 'S', 'f') AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'))),
         'postgres default ACL entries: ' || (SELECT count(*) FROM pg_default_acl d JOIN pg_roles rl ON rl.oid = d.defaclrole WHERE rl.rolname = 'postgres')
  UNION ALL
  SELECT 'V20', 'default privileges of supabase_admin grant no API role anything (report; the postgres login may not be allowed to change them)',
         NOT EXISTS (SELECT 1 FROM pg_default_acl d JOIN pg_roles rl ON rl.oid = d.defaclrole LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) a
                     WHERE rl.rolname = 'supabase_admin' AND (n.nspname = 'public' OR d.defaclnamespace = 0) AND d.defaclobjtype IN ('r', 'S', 'f') AND pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role')),
         'objects created by supabase_admin in public inherit these; none exist in this schema'
  UNION ALL
  SELECT 'V21', 'pg_cron is not installed and no cron schema job references the purge function',
         NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'),
         'pg_cron extension present: ' || EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  UNION ALL
  SELECT 'V22', 'no customer or business data was installed (row counts of the 12 tables, informational)',
         true,
         (SELECT string_agg(format('%s=%s', relname, coalesce(reltuples::bigint, 0)), ', ' ORDER BY relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN (SELECT tbl FROM known_tables))
)
SELECT check_id, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, detail FROM checks
UNION ALL
SELECT 'ZZ', 'VERDICT: baseline matches the production export and the least-privilege matrix',
       CASE WHEN NOT EXISTS (SELECT 1 FROM checks WHERE NOT ok) THEN 'PASS' ELSE 'FAIL' END,
       (SELECT count(*) FROM checks WHERE NOT ok) || ' failing check(s)'
ORDER BY check_id;

ROLLBACK;
