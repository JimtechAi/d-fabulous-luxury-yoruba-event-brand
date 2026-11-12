-- D'FABULOUS STAGE 4 / PHASE 2 / ROLLBACK 02: undo 04_security_A.sql (STAGING ONLY)
-- STATUS: PREPARED, NOT EXECUTED. Restores the policies and table privileges of profiles, user_permissions, permissions, audit_logs and payments to the
-- state captured by 04 in dfabulous_stage4.proposal_snapshot (the Phase 1 state). Removes the policies, the payments guard/audit triggers and functions created by 04.
-- Refuses to run unless proposal A is recorded as applied and its snapshot exists.
-- Arm the guard first (same session):  SELECT set_config('dfabulous.confirm_project', 'qwoxxroszmwobnzqgndr', false);

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = pg_catalog, pg_temp;

DO $stage4_early$
BEGIN
  IF to_regclass('dfabulous_stage4.phase2_state') IS NULL THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: no Phase 1 install marker / Phase 2 state; nothing to roll back here.';
  END IF;
END
$stage4_early$;

DO $stage4_a_rb$
DECLARE
  v_ref constant text := 'qwoxxroszmwobnzqgndr';
  r record;
  v_missing text;
BEGIN
  IF coalesce(current_setting('dfabulous.confirm_project', true), '') <> v_ref THEN RAISE EXCEPTION 'STAGE4 GUARD: not armed (see the header of this script).'; END IF;
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: run as the postgres login (current user: %).', current_user; END IF;
  IF to_regclass('dfabulous_stage4.phase2_state') IS NULL OR NOT EXISTS (SELECT 1 FROM dfabulous_stage4.phase2_state WHERE proposal = 'A') THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: proposal A is not recorded as applied; nothing to roll back.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dfabulous_stage4.snapshot_status WHERE scope = 'A') THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: no proposal A snapshot.'; END IF;

  -- objects created by A on payments (the audit rows they wrote stay in audit_logs: rollback never deletes audit history)
  DROP TRIGGER IF EXISTS trg_stage4_payments_audit ON public.payments;
  DROP TRIGGER IF EXISTS trg_stage4_payments_guard ON public.payments;
  DROP FUNCTION IF EXISTS public.stage4_payments_audit();
  DROP FUNCTION IF EXISTS public.stage4_payments_guard();

  -- policies created by A
  FOR r IN SELECT c.relname, p.polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
           WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('profiles', 'user_permissions', 'permissions', 'audit_logs', 'payments')
             AND NOT EXISTS (SELECT 1 FROM dfabulous_stage4.proposal_snapshot s WHERE s.proposal = 'A' AND s.kind = 'policy' AND s.object_name = c.relname || '|' || p.polname)
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.polname, r.relname);
  END LOOP;
  -- policies of the pre-state that are missing now
  FOR r IN SELECT split_part(object_name, '|', 1) AS rel, split_part(object_name, '|', 2) AS pol, definition FROM dfabulous_stage4.proposal_snapshot WHERE proposal = 'A' AND kind = 'policy' LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relnamespace = 'public'::regnamespace AND c.relname = r.rel AND p.polname = r.pol) THEN
      EXECUTE r.definition;
    END IF;
  END LOOP;

  -- privileges: reset the five tables for PUBLIC and the API roles (REVOKE ALL ON TABLE also removes column-level grants such as the payments UPDATE columns), then re-grant what was recorded
  FOR r IN SELECT object_name FROM dfabulous_stage4.proposal_snapshot WHERE proposal = 'A' AND kind = 'acl_table' LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', r.object_name);
  END LOOP;
  FOR r IN SELECT split_part(object_name, '|', 1) AS rel, split_part(object_name, '|', 2) AS grantee, split_part(object_name, '|', 3) AS priv, definition
           FROM dfabulous_stage4.proposal_snapshot WHERE proposal = 'A' AND kind = 'acl_grant' LOOP
    EXECUTE format('GRANT %s ON TABLE public.%I TO %s%s', r.priv, r.rel, CASE WHEN r.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee) END, CASE WHEN r.definition = 'GRANT OPTION' THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  -- post-condition: same policy set as the snapshot
  SELECT string_agg(x, ', ') INTO v_missing FROM (
    (SELECT object_name AS x FROM dfabulous_stage4.proposal_snapshot WHERE proposal = 'A' AND kind = 'policy'
     EXCEPT SELECT c.relname || '|' || p.polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relnamespace = 'public'::regnamespace)
    UNION ALL
    (SELECT c.relname || '|' || p.polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('profiles', 'user_permissions', 'permissions', 'audit_logs', 'payments')
     EXCEPT SELECT object_name FROM dfabulous_stage4.proposal_snapshot WHERE proposal = 'A' AND kind = 'policy')
  ) d;
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'STAGE4 ROLLBACK POSTCONDITION A: policy set differs from the snapshot: %', v_missing; END IF;

  DELETE FROM dfabulous_stage4.phase2_state WHERE proposal = 'A';
END
$stage4_a_rb$;

COMMIT;
