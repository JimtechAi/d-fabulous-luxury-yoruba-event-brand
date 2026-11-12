-- D'FABULOUS STAGE 4 / PHASE 1 / 02: privilege normalisation (STAGING ONLY)
-- STATUS: PREPARED, NOT EXECUTED. Run after 01_production_schema.sql, as the `postgres` login on dfabulous-staging (qwoxxroszmwobnzqgndr) only.
--
-- WHY: the production export only ADDS grants; on a fresh Supabase project the default privileges hand anon/authenticated/service_role ALL on every new table,
-- sequence and function (and PUBLIC EXECUTE on functions). That would make staging MORE open than production, and production itself is broader than the
-- application needs. This script sets a LEAST-PRIVILEGE state derived from how the application really uses each role (evidence in
-- supabase/staging/reports/STAGE4_SECURITY_TEST_MATRIX.md, "privilege matrix"). It is NOT a reproduction of production's privileges (deliberately).
--
-- WHAT IT DOES (each area reviewed independently, never "revoke tables and hope"):
--   schema    : API roles keep USAGE; CREATE is removed from PUBLIC/anon/authenticated/service_role.
--   relations : every table/sequence in public loses all privileges (including column-level privileges and grant options) for PUBLIC, anon, authenticated;
--               the 12 known tables and the sequence are then granted exactly the matrix below; service_role is reset to the matrix on known objects only.
--   functions : every function in public loses EXECUTE for PUBLIC, anon, authenticated; only is_admin()/is_owner() -> authenticated and
--               purge_archived_bookings() -> service_role are granted. SECURITY DEFINER functions are therefore not callable by anon or by API roles that
--               have no need for them (block_event_date, unblock_event_date, get_event_availability, handle_new_user, prevent_*).
--   defaults  : default privileges of the roles postgres and supabase_admin (schema public AND global) no longer grant API roles anything, and new
--               functions created by postgres are no longer executable by PUBLIC. Future objects therefore need explicit, reviewed GRANTs.
-- RLS stays enabled everywhere; this script does not touch policies, triggers, definitions or data.
-- Roles accounted for: anon, authenticated, service_role (changed), postgres (owner, unchanged), supabase_admin (inspected; its default privileges are
--   changed only if the postgres login is allowed to, otherwise a NOTICE is raised and 03_validate_baseline.sql reports it).
-- Idempotent: the pre-state is captured ONCE into dfabulous_stage4.privilege_snapshot; re-running never overwrites it.
-- Rollback: rollback/01a_rollback_privilege_normalisation.sql restores the captured state exactly.
-- Arm the guard first (same session):  SELECT set_config('dfabulous.confirm_project', 'qwoxxroszmwobnzqgndr', false);

BEGIN;
SET LOCAL lock_timeout = '10s';

DO $stage4_early$
BEGIN
  IF to_regclass('dfabulous_stage4.install_marker') IS NULL THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: no Phase 1 install marker (dfabulous_stage4.install_marker); run 01_production_schema.sql first. Production never has this marker, so this script cannot run there.';
  END IF;
END
$stage4_early$;

-- ------------------------------------------------------------------------------------------------------------------------------
-- 0. Preconditions (fail closed; production has no install marker, so this script cannot run there)
-- ------------------------------------------------------------------------------------------------------------------------------
DO $stage4_pre$
DECLARE
  v_ref constant text := 'qwoxxroszmwobnzqgndr';
  v_name text;
BEGIN
  IF coalesce(current_setting('dfabulous.confirm_project', true), '') <> v_ref THEN
    RAISE EXCEPTION 'STAGE4 GUARD: not armed (see the header of this script).';
  END IF;
  IF to_regclass('dfabulous_stage4.install_marker') IS NULL
     OR NOT EXISTS (SELECT 1 FROM dfabulous_stage4.install_marker WHERE project_ref = v_ref AND phase = 'phase1-baseline') THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: the Phase 1 install marker for % is missing. Run 01_production_schema.sql first. (Production never has this marker.)', v_ref;
  END IF;
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: run as the postgres login (current user: %).', current_user;
  END IF;
  FOREACH v_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_name) THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: role % missing', v_name; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    RAISE NOTICE 'stage4: role supabase_admin not found; nothing to inspect for it.';
  END IF;
  FOREACH v_name IN ARRAY ARRAY['audit_logs', 'blocked_dates', 'bookings', 'gallery', 'messages', 'payments', 'permissions', 'profiles', 'services', 'site_settings', 'testimonials', 'user_permissions'] LOOP
    IF to_regclass('public.' || v_name) IS NULL THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: public.% missing', v_name; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || v_name)) THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: RLS is not enabled on public.%', v_name; END IF;
  END LOOP;
  IF to_regclass('public.booking_reference_seq') IS NULL
     OR to_regprocedure('public.is_admin()') IS NULL OR to_regprocedure('public.is_owner()') IS NULL OR to_regprocedure('public.purge_archived_bookings()') IS NULL THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: baseline objects missing (sequence or helper/purge functions).';
  END IF;
END
$stage4_pre$;

-- ------------------------------------------------------------------------------------------------------------------------------
-- 1. Capture the pre-state ONCE (rollback source)
-- ------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dfabulous_stage4.privilege_snapshot (
  scope       text    NOT NULL,
  kind        text    NOT NULL,   -- relation | column | function | schema | default_acl
  object_name text    NOT NULL,   -- public.t | public.t.col | public.f(args) | public | role|schema|type
  grantee     text    NOT NULL,   -- role name, PUBLIC, or '*' (object marker)
  privilege   text    NOT NULL,   -- privilege, or '*' (object marker)
  grantable   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (scope, kind, object_name, grantee, privilege)
);
CREATE TABLE IF NOT EXISTS dfabulous_stage4.snapshot_status (
  scope       text PRIMARY KEY,
  captured_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE dfabulous_stage4.privilege_snapshot, dfabulous_stage4.snapshot_status FROM PUBLIC, anon, authenticated, service_role;

DO $stage4_snapshot$
BEGIN
  IF EXISTS (SELECT 1 FROM dfabulous_stage4.snapshot_status WHERE scope = 'normalisation') THEN
    RAISE NOTICE 'stage4: pre-normalisation snapshot already captured; keeping the original.';
    RETURN;
  END IF;

  INSERT INTO dfabulous_stage4.privilege_snapshot (scope, kind, object_name, grantee, privilege, grantable)
  SELECT 'normalisation', 'relation', format('%I.%I', n.nspname, c.relname), '*', '*', false
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  UNION ALL
  SELECT 'normalisation', 'relation', format('%I.%I', n.nspname, c.relname), CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type, a.is_grantable
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'));

  INSERT INTO dfabulous_stage4.privilege_snapshot (scope, kind, object_name, grantee, privilege, grantable)
  SELECT 'normalisation', 'column', format('%I.%I.%I', n.nspname, c.relname, t.attname), CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type, a.is_grantable
  FROM pg_attribute t JOIN pg_class c ON c.oid = t.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(t.attacl) a
  WHERE n.nspname = 'public' AND t.attacl IS NOT NULL AND NOT t.attisdropped
    AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'));

  INSERT INTO dfabulous_stage4.privilege_snapshot (scope, kind, object_name, grantee, privilege, grantable)
  SELECT 'normalisation', 'function', format('%I.%I(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)), '*', '*', false
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  UNION ALL
  SELECT 'normalisation', 'function', format('%I.%I(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)), CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type, a.is_grantable
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'));

  INSERT INTO dfabulous_stage4.privilege_snapshot (scope, kind, object_name, grantee, privilege, grantable)
  SELECT 'normalisation', 'schema', 'public', '*', '*', false
  UNION ALL
  SELECT 'normalisation', 'schema', 'public', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type, a.is_grantable
  FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
  WHERE n.nspname = 'public' AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'));

  -- default privileges of postgres and supabase_admin, schema public and global (namespace 0). Marker rows record which entries existed.
  INSERT INTO dfabulous_stage4.privilege_snapshot (scope, kind, object_name, grantee, privilege, grantable)
  SELECT 'normalisation', 'default_acl', format('%s|%s|%s', rl.rolname, coalesce(n.nspname, '*'), d.defaclobjtype), '*', '*', false
  FROM pg_default_acl d JOIN pg_roles rl ON rl.oid = d.defaclrole LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
  WHERE rl.rolname IN ('postgres', 'supabase_admin') AND (n.nspname = 'public' OR d.defaclnamespace = 0) AND d.defaclobjtype IN ('r', 'S', 'f')
  UNION ALL
  SELECT 'normalisation', 'default_acl', format('%s|%s|%s', rl.rolname, coalesce(n.nspname, '*'), d.defaclobjtype), CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type, a.is_grantable
  FROM pg_default_acl d JOIN pg_roles rl ON rl.oid = d.defaclrole LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE rl.rolname IN ('postgres', 'supabase_admin') AND (n.nspname = 'public' OR d.defaclnamespace = 0) AND d.defaclobjtype IN ('r', 'S', 'f')
    AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'));

  INSERT INTO dfabulous_stage4.snapshot_status (scope) VALUES ('normalisation');
END
$stage4_snapshot$;

-- ------------------------------------------------------------------------------------------------------------------------------
-- 2. Apply (schema, relations, sequence, functions)
-- ------------------------------------------------------------------------------------------------------------------------------
DO $stage4_apply$
DECLARE
  r record;
  v_known_tables constant text[] := ARRAY['audit_logs', 'blocked_dates', 'bookings', 'gallery', 'messages', 'payments', 'permissions', 'profiles', 'services', 'site_settings', 'testimonials', 'user_permissions'];
  v_known_functions constant text[] := ARRAY['block_event_date', 'generate_booking_reference', 'get_event_availability', 'handle_new_user', 'is_admin', 'is_owner', 'prevent_booking_on_blocked_date', 'prevent_role_escalation', 'purge_archived_bookings', 'rls_auto_enable', 'unblock_event_date', 'update_updated_at_column'];
BEGIN
  -- schema: USAGE for the API roles, nobody but the owner may create objects
  REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- relations: sweep PUBLIC/anon/authenticated on EVERYTHING in public (table-level revoke also removes column-level privileges and grant options)
  FOR r IN
    SELECT c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
  LOOP
    IF r.owner_name <> current_user THEN RAISE NOTICE 'stage4: public.% is owned by %, skipped (report only)', r.relname, r.owner_name; CONTINUE; END IF;
    IF r.relkind = 'S' THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM PUBLIC, anon, authenticated', r.relname);
    ELSE
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', r.relname);
    END IF;
    IF r.relname = ANY (v_known_tables) THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM service_role', r.relname); END IF;
    IF r.relname = 'booking_reference_seq' THEN EXECUTE 'REVOKE ALL ON SEQUENCE public.booking_reference_seq FROM service_role'; END IF;
  END LOOP;

  -- PRIVILEGE MATRIX (table, role, privileges). Identical in 03_validate_baseline.sql and 07_validate_hardened.sql (a test enforces it).
  FOR r IN
    SELECT * FROM (VALUES
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
    ) AS m(tbl, grantee, privs)
  LOOP
    EXECUTE format('GRANT %s ON TABLE public.%I TO %I', r.privs, r.tbl, r.grantee);
  END LOOP;
  GRANT USAGE ON SEQUENCE public.booking_reference_seq TO service_role;

  -- functions: sweep EXECUTE on EVERY function in public, then grant the three required ones
  FOR r IN
    SELECT p.proname, pg_get_userbyid(p.proowner) AS owner_name, format('%I.%I(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)) AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    IF r.owner_name <> current_user THEN RAISE NOTICE 'stage4: function % is owned by %, skipped (report only)', r.sig, r.owner_name; CONTINUE; END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    IF r.proname = ANY (v_known_functions) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', r.sig); END IF;
  END LOOP;
  GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.purge_archived_bookings() TO service_role;
END
$stage4_apply$;

-- ------------------------------------------------------------------------------------------------------------------------------
-- 3. Default privileges (postgres and supabase_admin; schema public and global entries)
-- ------------------------------------------------------------------------------------------------------------------------------
DO $stage4_defaults$
DECLARE
  r record;
  v_scope text;
  v_type text;
  v_sql text;
BEGIN
  FOR r IN
    SELECT DISTINCT rl.rolname AS role_name, n.nspname AS schema_name, d.defaclobjtype AS objtype, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee_name
    FROM pg_default_acl d JOIN pg_roles rl ON rl.oid = d.defaclrole LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE rl.rolname IN ('postgres', 'supabase_admin') AND (n.nspname = 'public' OR d.defaclnamespace = 0) AND d.defaclobjtype IN ('r', 'S', 'f')
      AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'))
  LOOP
    v_scope := CASE WHEN r.schema_name IS NULL THEN '' ELSE ' IN SCHEMA public' END;
    v_type := CASE r.objtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' ELSE 'FUNCTIONS' END;
    v_sql := format('ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL ON %s FROM %s', r.role_name, v_scope, v_type, CASE WHEN r.grantee_name = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee_name) END);
    BEGIN
      EXECUTE v_sql;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'stage4: not permitted for the % login, left unchanged (reported by 03_validate_baseline.sql): %', current_user, v_sql;
    END;
  END LOOP;
  -- new functions created by postgres must not be executable by PUBLIC (this is a global default, not schema-specific)
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
END
$stage4_defaults$;

-- ------------------------------------------------------------------------------------------------------------------------------
-- 4. Post-conditions (any failure aborts and rolls back the whole script)
-- ------------------------------------------------------------------------------------------------------------------------------
DO $stage4_post$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(format('%s:%s:%s', c.relname, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type), ', ') INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') AND pg_get_userbyid(c.relowner) = current_user
    AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated'))
    AND NOT (c.relname = 'services' AND pg_get_userbyid(a.grantee) IN ('anon', 'authenticated') AND a.privilege_type = 'SELECT')
    AND NOT (pg_get_userbyid(a.grantee) = 'authenticated' AND (c.relname, a.privilege_type) IN (('audit_logs', 'SELECT'), ('bookings', 'SELECT'), ('bookings', 'UPDATE'), ('bookings', 'DELETE'), ('payments', 'SELECT'), ('payments', 'INSERT'), ('permissions', 'SELECT'), ('profiles', 'SELECT'), ('user_permissions', 'SELECT')));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION: unexpected relation privileges remain: %', v_bad; END IF;

  SELECT string_agg(format('%s:%s', p.proname, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END), ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) = current_user
    AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated')
         OR (pg_get_userbyid(a.grantee) = 'service_role' AND p.proname IN ('block_event_date', 'generate_booking_reference', 'get_event_availability', 'handle_new_user', 'is_admin', 'is_owner', 'prevent_booking_on_blocked_date', 'prevent_role_escalation', 'purge_archived_bookings', 'rls_auto_enable', 'unblock_event_date', 'update_updated_at_column')))
    AND (p.proname, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) NOT IN (('is_admin', 'authenticated'), ('is_owner', 'authenticated'), ('purge_archived_bookings', 'service_role'));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION: unexpected function EXECUTE remains: %', v_bad; END IF;

  IF has_schema_privilege('anon', 'public', 'CREATE') OR has_schema_privilege('authenticated', 'public', 'CREATE') OR has_schema_privilege('service_role', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'STAGE4 POSTCONDITION: an API role can still CREATE in schema public';
  END IF;
  IF NOT (has_schema_privilege('anon', 'public', 'USAGE') AND has_schema_privilege('authenticated', 'public', 'USAGE') AND has_schema_privilege('service_role', 'public', 'USAGE')) THEN
    RAISE EXCEPTION 'STAGE4 POSTCONDITION: an API role lost USAGE on schema public';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d JOIN pg_roles rl ON rl.oid = d.defaclrole LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE rl.rolname = 'postgres' AND (n.nspname = 'public' OR d.defaclnamespace = 0) AND d.defaclobjtype IN ('r', 'S', 'f')
      AND pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role')
  ) THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION: postgres default privileges still grant API roles'; END IF;
END
$stage4_post$;

COMMIT;
