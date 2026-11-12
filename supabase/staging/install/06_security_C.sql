-- D'FABULOUS STAGE 4 / PHASE 2 / 06: Proposal C, active-account enforcement (STAGING ONLY)
-- STATUS: PREPARED, NOT EXECUTED. Requires Phase 1 (01 + 02) and proposal B (05) on dfabulous-staging (qwoxxroszmwobnzqgndr).
-- Rollback: rollback/04_rollback_security_C.sql (restores the captured production definitions exactly).
--
-- THE DEFECT (production): is_admin() and is_owner() test profiles.role only. profiles.is_active EXISTS (boolean NOT NULL DEFAULT true) but 26 of the 30 policies
-- that call these helpers do not check it, so a SUSPENDED administrator or owner keeps database-level administrative access.
-- THE FIX: both helpers additionally require `is_active IS TRUE` (fail closed). One change closes all 26 policies at once; the 4 policies that already check
-- is_active keep doing so (harmless duplication). Policies are NOT edited.
-- ACCOUNT POLICY ASSUMED (needs owner approval): an inactive Owner loses owner AND administrator capabilities at the database, exactly as the API already
-- treats an inactive account (403). Own-profile access is unaffected: "Users can view their own profile" and the (id = auth.uid()) branch of
-- "Users view profile" do not call the helpers, so a suspended user can still read their own row and be told they are suspended.
-- SECURITY: both helpers stay SECURITY DEFINER (they must read profiles regardless of the caller's RLS), owned by postgres, EXECUTE for authenticated only
-- (ACL preserved by CREATE OR REPLACE). search_path is tightened from `public, pg_temp` to '' with every reference schema-qualified. Strict boolean results:
-- no NULL, because EXISTS never yields NULL and an unknown auth.uid() simply finds no row.
-- Volatility and language are unchanged on purpose (not part of this proposal).
-- Arm the guard first (same session):  SELECT set_config('dfabulous.confirm_project', 'qwoxxroszmwobnzqgndr', false);

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = pg_catalog, pg_temp;

DO $stage4_early$
BEGIN
  IF to_regclass('dfabulous_stage4.install_marker') IS NULL THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: no Phase 1 install marker (dfabulous_stage4.install_marker); run 01_production_schema.sql, 02 and proposal B first. Production never has this marker.';
  END IF;
END
$stage4_early$;

DO $stage4_c_pre$
DECLARE
  v_ref constant text := 'qwoxxroszmwobnzqgndr';
BEGIN
  IF coalesce(current_setting('dfabulous.confirm_project', true), '') <> v_ref THEN RAISE EXCEPTION 'STAGE4 GUARD: not armed (see the header of this script).'; END IF;
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: run as the postgres login (current user: %).', current_user; END IF;
  IF to_regclass('dfabulous_stage4.install_marker') IS NULL OR NOT EXISTS (SELECT 1 FROM dfabulous_stage4.install_marker WHERE project_ref = v_ref AND phase = 'phase1-baseline') THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: Phase 1 install marker missing; run 01 first (production never has one).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dfabulous_stage4.snapshot_status WHERE scope = 'normalisation') THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: 02_privilege_normalisation.sql has not been run.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM dfabulous_stage4.phase2_state WHERE proposal = 'B') THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: proposal B (05_security_B.sql) is not applied; without it the API would lose role changes under C.';
  END IF;
  IF to_regprocedure('public.is_admin()') IS NULL OR to_regprocedure('public.is_owner()') IS NULL THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: helpers missing.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_active' AND data_type = 'boolean') THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: public.profiles.is_active (boolean) is missing.';
  END IF;
  IF position('service_role' IN pg_get_functiondef('public.prevent_role_escalation()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: prevent_role_escalation() does not contain the proposal B logic.';
  END IF;
END
$stage4_c_pre$;

CREATE TABLE IF NOT EXISTS dfabulous_stage4.proposal_snapshot (
  proposal    text NOT NULL,
  kind        text NOT NULL,
  object_name text NOT NULL,
  definition  text NOT NULL,
  PRIMARY KEY (proposal, kind, object_name)
);
REVOKE ALL ON TABLE dfabulous_stage4.proposal_snapshot FROM PUBLIC, anon, authenticated, service_role;

DO $stage4_c_snapshot$
BEGIN
  IF EXISTS (SELECT 1 FROM dfabulous_stage4.snapshot_status WHERE scope = 'C') THEN
    RAISE NOTICE 'stage4: proposal C pre-state already captured; keeping the original.';
    RETURN;
  END IF;
  INSERT INTO dfabulous_stage4.proposal_snapshot (proposal, kind, object_name, definition)
  VALUES ('C', 'function', 'public.is_admin()', pg_get_functiondef('public.is_admin()'::regprocedure)),
         ('C', 'function', 'public.is_owner()', pg_get_functiondef('public.is_owner()'::regprocedure));
  INSERT INTO dfabulous_stage4.snapshot_status (scope) VALUES ('C');
END
$stage4_c_snapshot$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'owner')
      AND p.is_active IS TRUE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'owner'
      AND p.is_active IS TRUE
  );
END;
$$;

INSERT INTO dfabulous_stage4.phase2_state (proposal) VALUES ('C') ON CONFLICT (proposal) DO NOTHING;

DO $stage4_c_post$
DECLARE v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['public.is_admin()', 'public.is_owner()'] LOOP
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(v_name)) THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION C: % is not SECURITY DEFINER', v_name; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regprocedure(v_name) AND proconfig @> ARRAY['search_path=""']) THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION C: % search_path not pinned', v_name; END IF;
    IF position('is_active IS TRUE' IN pg_get_functiondef(to_regprocedure(v_name))) = 0 THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION C: % does not test is_active', v_name; END IF;
    IF NOT has_function_privilege('authenticated', to_regprocedure(v_name), 'EXECUTE') OR has_function_privilege('anon', to_regprocedure(v_name), 'EXECUTE') OR has_function_privilege('service_role', to_regprocedure(v_name), 'EXECUTE') THEN
      RAISE EXCEPTION 'STAGE4 POSTCONDITION C: % EXECUTE grants changed', v_name;
    END IF;
  END LOOP;
END
$stage4_c_post$;

COMMIT;
