-- D'FABULOUS STAGE 4 / PHASE 1 / ROLLBACK 01a: undo 02_privilege_normalisation.sql (STAGING ONLY)
-- STATUS: PREPARED, NOT EXECUTED. Restores the privilege state captured by 02 in dfabulous_stage4.privilege_snapshot (schema, relations, column
-- privileges, functions, default privileges of postgres/supabase_admin). It restores PRIVILEGES ONLY: objects, data and policies are untouched.
-- Objects created after the snapshot are not in the snapshot and are left as they are (a NOTICE is not raised for them).
-- Refuses to run unless the Phase 1 marker and the snapshot exist (production has neither).
-- WARNING: the restored state is the state right after 01_production_schema.sql, i.e. MORE OPEN than production. Use it only to retry or to diagnose.
-- Arm the guard first (same session):  SELECT set_config('dfabulous.confirm_project', 'qwoxxroszmwobnzqgndr', false);

BEGIN;
SET LOCAL lock_timeout = '10s';

DO $stage4_early$
BEGIN
  IF to_regclass('dfabulous_stage4.install_marker') IS NULL THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: no Phase 1 install marker (dfabulous_stage4.install_marker); nothing to roll back here. Production never has this marker.';
  END IF;
END
$stage4_early$;

DO $stage4_rb_pre$
DECLARE v_ref constant text := 'qwoxxroszmwobnzqgndr';
BEGIN
  IF coalesce(current_setting('dfabulous.confirm_project', true), '') <> v_ref THEN RAISE EXCEPTION 'STAGE4 GUARD: not armed (see the header of this script).'; END IF;
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: run as the postgres login (current user: %).', current_user; END IF;
  IF to_regclass('dfabulous_stage4.install_marker') IS NULL OR NOT EXISTS (SELECT 1 FROM dfabulous_stage4.install_marker WHERE project_ref = v_ref) THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: no Phase 1 install marker for %; nothing to roll back here (production never has one).', v_ref;
  END IF;
  IF to_regclass('dfabulous_stage4.snapshot_status') IS NULL OR NOT EXISTS (SELECT 1 FROM dfabulous_stage4.snapshot_status WHERE scope = 'normalisation') THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: no pre-normalisation snapshot; 02_privilege_normalisation.sql was never run, so there is nothing to restore.';
  END IF;
  IF to_regclass('dfabulous_stage4.phase2_state') IS NOT NULL AND EXISTS (SELECT 1 FROM dfabulous_stage4.phase2_state) THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: Phase 2 proposals are still applied (%); roll them back first (C, B, A) so that this script does not reopen privileges underneath them.',
      (SELECT string_agg(proposal, ',' ORDER BY proposal) FROM dfabulous_stage4.phase2_state);
  END IF;
END
$stage4_rb_pre$;

DO $stage4_rb$
DECLARE
  r record;
  v_scope text;
  v_type text;
  v_api constant text[] := ARRAY['anon', 'authenticated', 'service_role'];
BEGIN
  -- schema
  REVOKE ALL ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
  FOR r IN SELECT grantee, privilege, grantable FROM dfabulous_stage4.privilege_snapshot WHERE scope = 'normalisation' AND kind = 'schema' AND grantee <> '*' LOOP
    EXECUTE format('GRANT %s ON SCHEMA public TO %s%s', r.privilege, CASE WHEN r.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee) END, CASE WHEN r.grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  -- relations (tables and sequences): reset, then re-grant the recorded privileges
  FOR r IN SELECT object_name FROM dfabulous_stage4.privilege_snapshot WHERE scope = 'normalisation' AND kind = 'relation' AND grantee = '*' LOOP
    CONTINUE WHEN to_regclass(r.object_name) IS NULL;
    CONTINUE WHEN (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = to_regclass(r.object_name)) <> current_user;
    EXECUTE format('REVOKE ALL ON %s %s FROM PUBLIC, anon, authenticated, service_role',
      CASE WHEN (SELECT relkind FROM pg_class WHERE oid = to_regclass(r.object_name)) = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, r.object_name);
  END LOOP;
  FOR r IN SELECT object_name, grantee, privilege, grantable FROM dfabulous_stage4.privilege_snapshot WHERE scope = 'normalisation' AND kind = 'relation' AND grantee <> '*' ORDER BY object_name LOOP
    CONTINUE WHEN to_regclass(r.object_name) IS NULL;
    CONTINUE WHEN (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = to_regclass(r.object_name)) <> current_user;
    EXECUTE format('GRANT %s ON %s %s TO %s%s', r.privilege,
      CASE WHEN (SELECT relkind FROM pg_class WHERE oid = to_regclass(r.object_name)) = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, r.object_name,
      CASE WHEN r.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee) END, CASE WHEN r.grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  -- column-level privileges (none in production; restored if the pre-state had any)
  FOR r IN SELECT split_part(object_name, '.', 1) || '.' || split_part(object_name, '.', 2) AS rel, split_part(object_name, '.', 3) AS col, grantee, privilege, grantable
           FROM dfabulous_stage4.privilege_snapshot WHERE scope = 'normalisation' AND kind = 'column' LOOP
    CONTINUE WHEN to_regclass(r.rel) IS NULL;
    EXECUTE format('GRANT %s (%I) ON TABLE %s TO %s%s', r.privilege, r.col, r.rel, CASE WHEN r.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee) END, CASE WHEN r.grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  -- functions
  FOR r IN SELECT object_name FROM dfabulous_stage4.privilege_snapshot WHERE scope = 'normalisation' AND kind = 'function' AND grantee = '*' LOOP
    CONTINUE WHEN to_regprocedure(r.object_name) IS NULL;
    CONTINUE WHEN (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = to_regprocedure(r.object_name)) <> current_user;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', r.object_name);
  END LOOP;
  FOR r IN SELECT object_name, grantee, privilege, grantable FROM dfabulous_stage4.privilege_snapshot WHERE scope = 'normalisation' AND kind = 'function' AND grantee <> '*' ORDER BY object_name LOOP
    CONTINUE WHEN to_regprocedure(r.object_name) IS NULL;
    CONTINUE WHEN (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = to_regprocedure(r.object_name)) <> current_user;
    EXECUTE format('GRANT %s ON FUNCTION %s TO %s%s', r.privilege, r.object_name, CASE WHEN r.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee) END, CASE WHEN r.grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  -- default privileges: A) remove the API/PUBLIC entries that exist now, B) re-grant the recorded ones, C) restore the implicit PUBLIC EXECUTE default
  FOR r IN
    SELECT DISTINCT rl.rolname AS role_name, n.nspname AS schema_name, d.defaclobjtype AS objtype, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee_name
    FROM pg_default_acl d JOIN pg_roles rl ON rl.oid = d.defaclrole LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE rl.rolname IN ('postgres', 'supabase_admin') AND (n.nspname = 'public' OR d.defaclnamespace = 0) AND d.defaclobjtype IN ('r', 'S', 'f')
      AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) = ANY (v_api))
  LOOP
    v_scope := CASE WHEN r.schema_name IS NULL THEN '' ELSE ' IN SCHEMA public' END;
    v_type := CASE r.objtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' ELSE 'FUNCTIONS' END;
    BEGIN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL ON %s FROM %s', r.role_name, v_scope, v_type, CASE WHEN r.grantee_name = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee_name) END);
    EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'stage4: not permitted to change default privileges of %, left as is', r.role_name; END;
  END LOOP;
  FOR r IN SELECT split_part(object_name, '|', 1) AS role_name, split_part(object_name, '|', 2) AS schema_name, split_part(object_name, '|', 3) AS objtype, grantee, privilege, grantable
           FROM dfabulous_stage4.privilege_snapshot WHERE scope = 'normalisation' AND kind = 'default_acl' AND grantee <> '*' LOOP
    v_scope := CASE WHEN r.schema_name = '*' THEN '' ELSE ' IN SCHEMA public' END;
    v_type := CASE r.objtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' ELSE 'FUNCTIONS' END;
    BEGIN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I%s GRANT %s ON %s TO %s%s', r.role_name, v_scope, r.privilege, v_type, CASE WHEN r.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee) END, CASE WHEN r.grantable THEN ' WITH GRANT OPTION' ELSE '' END);
    EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'stage4: not permitted to change default privileges of %, left as is', r.role_name; END;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM dfabulous_stage4.privilege_snapshot WHERE scope = 'normalisation' AND kind = 'default_acl' AND object_name = 'postgres|*|f' AND grantee <> '*') THEN
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
  END IF;
END
$stage4_rb$;

-- post-condition: relations, functions and schema match the snapshot exactly (for the roles PUBLIC, anon, authenticated, service_role)
DO $stage4_rb_post$
DECLARE v_diff text;
BEGIN
  SELECT string_agg(x, ', ') INTO v_diff FROM (
    (SELECT format('rel %s %s %s', object_name, grantee, privilege) AS x FROM dfabulous_stage4.privilege_snapshot s
       WHERE scope = 'normalisation' AND kind = 'relation' AND grantee <> '*' AND to_regclass(object_name) IS NOT NULL
     EXCEPT
     SELECT format('rel %s.%s %s %s', n.nspname, c.relname, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type)
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
       WHERE n.nspname = 'public')
    UNION ALL
    (SELECT format('rel %s.%s %s %s', n.nspname, c.relname, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type)
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
       WHERE n.nspname = 'public' AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'))
         AND EXISTS (SELECT 1 FROM dfabulous_stage4.privilege_snapshot s WHERE s.scope = 'normalisation' AND s.kind = 'relation' AND s.object_name = format('%I.%I', n.nspname, c.relname) AND s.grantee = '*')
     EXCEPT
     SELECT format('rel %s %s %s', object_name, grantee, privilege) FROM dfabulous_stage4.privilege_snapshot WHERE scope = 'normalisation' AND kind = 'relation' AND grantee <> '*')
  ) d;
  IF v_diff IS NOT NULL THEN RAISE EXCEPTION 'STAGE4 ROLLBACK POSTCONDITION: relation privileges differ from the snapshot: %', v_diff; END IF;

  SELECT string_agg(x, ', ') INTO v_diff FROM (
    (SELECT format('fn %s %s %s', object_name, grantee, privilege) AS x FROM dfabulous_stage4.privilege_snapshot WHERE scope = 'normalisation' AND kind = 'function' AND grantee <> '*' AND to_regprocedure(object_name) IS NOT NULL
     EXCEPT
     SELECT format('fn %I.%I(%s) %s %s', n.nspname, p.proname, oidvectortypes(p.proargtypes), CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE n.nspname = 'public')
    UNION ALL
    (SELECT format('fn %I.%I(%s) %s %s', n.nspname, p.proname, oidvectortypes(p.proargtypes), CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
       WHERE n.nspname = 'public' AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'))
         AND EXISTS (SELECT 1 FROM dfabulous_stage4.privilege_snapshot s WHERE s.scope = 'normalisation' AND s.kind = 'function' AND s.object_name = format('%I.%I(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)) AND s.grantee = '*')
     EXCEPT
     SELECT format('fn %s %s %s', object_name, grantee, privilege) FROM dfabulous_stage4.privilege_snapshot WHERE scope = 'normalisation' AND kind = 'function' AND grantee <> '*')
  ) d;
  IF v_diff IS NOT NULL THEN RAISE EXCEPTION 'STAGE4 ROLLBACK POSTCONDITION: function privileges differ from the snapshot: %', v_diff; END IF;
END
$stage4_rb_post$;

COMMIT;
