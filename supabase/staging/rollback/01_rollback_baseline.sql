-- D'FABULOUS STAGE 4 / PHASE 1 / ROLLBACK 01: remove the production-equivalent baseline from STAGING
-- STATUS: PREPARED, NOT EXECUTED. DESTRUCTIVE: drops the 12 tables, the sequence and the production functions created by 01_production_schema.sql, then
-- restores schema/default privileges to the state captured BEFORE 01 ran, then removes the dfabulous_stage4 schema (marker and snapshots).
-- Order for a full Phase 1 rollback: (Phase 2 rollbacks first, if any were applied), then 01a_rollback_privilege_normalisation.sql (optional here),
-- then this script. Staging only: the install marker must exist (production never has one).
-- Safety interlocks (all required):
--   1. armed guard:        SELECT set_config('dfabulous.confirm_project', 'qwoxxroszmwobnzqgndr', false);
--   2. destruction guard:  SELECT set_config('dfabulous.confirm_drop', 'DROP STAGING BASELINE OBJECTS', false);
--   3. no Phase 2 proposal (A, B, C) may still be applied;
--   4. every table must be empty, unless:  SELECT set_config('dfabulous.allow_drop_data', 'yes-delete-staging-test-data', false);
-- Objects not created by the baseline (for example api_rate_limits and its functions, a platform-owned rls_auto_enable) are NOT touched.

BEGIN;
SET LOCAL lock_timeout = '10s';

DO $stage4_early$
BEGIN
  IF to_regclass('dfabulous_stage4.install_marker') IS NULL THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: no Phase 1 install marker (dfabulous_stage4.install_marker); refusing to drop anything. Production never has this marker.';
  END IF;
END
$stage4_early$;

DO $stage4_rb1_pre$
DECLARE
  v_ref constant text := 'qwoxxroszmwobnzqgndr';
  v_name text;
  v_rows bigint;
BEGIN
  IF coalesce(current_setting('dfabulous.confirm_project', true), '') <> v_ref THEN RAISE EXCEPTION 'STAGE4 GUARD: not armed (see the header of this script).'; END IF;
  IF coalesce(current_setting('dfabulous.confirm_drop', true), '') <> 'DROP STAGING BASELINE OBJECTS' THEN RAISE EXCEPTION 'STAGE4 GUARD: destruction not confirmed (see the header of this script).'; END IF;
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: run as the postgres login (current user: %).', current_user; END IF;
  IF to_regclass('dfabulous_stage4.install_marker') IS NULL OR NOT EXISTS (SELECT 1 FROM dfabulous_stage4.install_marker WHERE project_ref = v_ref AND phase = 'phase1-baseline') THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: no Phase 1 install marker for %; refusing to drop anything (production never has one).', v_ref;
  END IF;
  IF EXISTS (SELECT 1 FROM dfabulous_stage4.phase2_state) THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: Phase 2 proposals still applied (%). Roll them back first (04 -> 03 -> 02).', (SELECT string_agg(proposal, ', ' ORDER BY proposal) FROM dfabulous_stage4.phase2_state);
  END IF;
  IF coalesce(current_setting('dfabulous.allow_drop_data', true), '') <> 'yes-delete-staging-test-data' THEN
    FOREACH v_name IN ARRAY ARRAY['audit_logs', 'blocked_dates', 'bookings', 'gallery', 'messages', 'payments', 'permissions', 'profiles', 'services', 'site_settings', 'testimonials', 'user_permissions'] LOOP
      IF to_regclass('public.' || v_name) IS NOT NULL THEN
        EXECUTE format('SELECT count(*) FROM (SELECT 1 FROM public.%I LIMIT 1) s', v_name) INTO v_rows;
        IF v_rows > 0 THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: public.% contains rows; set dfabulous.allow_drop_data to confirm deleting staging test data.', v_name; END IF;
      END IF;
    END LOOP;
  END IF;
END
$stage4_rb1_pre$;

-- 1. objects created by the baseline (tables first: CASCADE removes their triggers, policies, indexes and foreign keys)
DROP TABLE IF EXISTS public.user_permissions, public.permissions, public.payments, public.bookings, public.audit_logs, public.blocked_dates, public.gallery,
  public.messages, public.profiles, public.services, public.site_settings, public.testimonials CASCADE;
DROP SEQUENCE IF EXISTS public.booking_reference_seq;

DO $stage4_rb1_fn$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, format('public.%I(%s)', p.proname, oidvectortypes(p.proargtypes)) AS sig, pg_get_userbyid(p.proowner) AS owner_name
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('block_event_date', 'generate_booking_reference', 'get_event_availability', 'handle_new_user', 'is_admin', 'is_owner',
      'prevent_booking_on_blocked_date', 'prevent_role_escalation', 'purge_archived_bookings', 'rls_auto_enable', 'unblock_event_date', 'update_updated_at_column')
  LOOP
    IF r.owner_name <> 'postgres' THEN RAISE NOTICE 'stage4: % is owned by %, not created by the baseline, kept', r.sig, r.owner_name; CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtfoid = r.oid) THEN RAISE NOTICE 'stage4: % is used by an event trigger, kept', r.sig; CONTINUE; END IF;
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END
$stage4_rb1_fn$;

-- 2. restore schema ACL and default privileges to the state captured before 01
DO $stage4_rb1_acl$
DECLARE
  r record;
  v_scope text;
  v_type text;
BEGIN
  REVOKE ALL ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role, postgres;
  FOR r IN SELECT grantee, privilege, grantable FROM dfabulous_stage4.privilege_snapshot WHERE scope = 'baseline' AND kind = 'schema' AND grantee <> '*' LOOP
    EXECUTE format('GRANT %s ON SCHEMA public TO %s%s', r.privilege, CASE WHEN r.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee) END, CASE WHEN r.grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  FOR r IN
    SELECT DISTINCT rl.rolname AS role_name, n.nspname AS schema_name, d.defaclobjtype AS objtype, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee_name
    FROM pg_default_acl d JOIN pg_roles rl ON rl.oid = d.defaclrole LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE rl.rolname IN ('postgres', 'supabase_admin') AND (n.nspname = 'public' OR d.defaclnamespace = 0) AND d.defaclobjtype IN ('r', 'S', 'f')
      AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'))
  LOOP
    v_scope := CASE WHEN r.schema_name IS NULL THEN '' ELSE ' IN SCHEMA public' END;
    v_type := CASE r.objtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' ELSE 'FUNCTIONS' END;
    BEGIN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL ON %s FROM %s', r.role_name, v_scope, v_type, CASE WHEN r.grantee_name = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee_name) END);
    EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'stage4: not permitted to change default privileges of %, left as is', r.role_name; END;
  END LOOP;
  FOR r IN SELECT split_part(object_name, '|', 1) AS role_name, split_part(object_name, '|', 2) AS schema_name, split_part(object_name, '|', 3) AS objtype, grantee, privilege, grantable
           FROM dfabulous_stage4.privilege_snapshot WHERE scope = 'baseline' AND kind = 'default_acl' AND grantee <> '*' LOOP
    v_scope := CASE WHEN r.schema_name = '*' THEN '' ELSE ' IN SCHEMA public' END;
    v_type := CASE r.objtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' ELSE 'FUNCTIONS' END;
    BEGIN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I%s GRANT %s ON %s TO %s%s', r.role_name, v_scope, r.privilege, v_type, CASE WHEN r.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee) END, CASE WHEN r.grantable THEN ' WITH GRANT OPTION' ELSE '' END);
    EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'stage4: not permitted to change default privileges of %, left as is', r.role_name; END;
  END LOOP;
  -- the implicit PUBLIC EXECUTE default for functions created by postgres (removed by 02) returns unless the pre-state had an explicit global entry
  IF NOT EXISTS (SELECT 1 FROM dfabulous_stage4.privilege_snapshot WHERE scope = 'baseline' AND kind = 'default_acl' AND object_name = 'postgres|*|f' AND grantee <> '*') THEN
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
  END IF;
END
$stage4_rb1_acl$;

-- 3. remove the marker and every snapshot (this ends the Phase 1 state; the baseline guard allows a fresh install again)
DROP SCHEMA dfabulous_stage4 CASCADE;

DO $stage4_rb1_post$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname IN
       ('audit_logs', 'blocked_dates', 'bookings', 'gallery', 'messages', 'payments', 'permissions', 'profiles', 'services', 'site_settings', 'testimonials', 'user_permissions', 'booking_reference_seq')) THEN
    RAISE EXCEPTION 'STAGE4 ROLLBACK POSTCONDITION: baseline relations remain';
  END IF;
  IF to_regnamespace('dfabulous_stage4') IS NOT NULL THEN RAISE EXCEPTION 'STAGE4 ROLLBACK POSTCONDITION: dfabulous_stage4 remains'; END IF;
END
$stage4_rb1_post$;

COMMIT;
