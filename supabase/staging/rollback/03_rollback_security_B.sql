-- D'FABULOUS STAGE 4 / PHASE 2 / ROLLBACK 03: undo 05_security_B.sql (STAGING ONLY)
-- STATUS: PREPARED, NOT EXECUTED. Restores the production prevent_role_escalation() exactly as captured (SECURITY DEFINER, EXISTS-variant dependency).
-- WARNING: that restores the production defect (backend role changes rejected). Refuses to run while proposal C is applied (C depends on B).
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

DO $stage4_b_rb$
DECLARE
  v_ref constant text := 'qwoxxroszmwobnzqgndr';
  v_def text;
BEGIN
  IF coalesce(current_setting('dfabulous.confirm_project', true), '') <> v_ref THEN RAISE EXCEPTION 'STAGE4 GUARD: not armed (see the header of this script).'; END IF;
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: run as the postgres login (current user: %).', current_user; END IF;
  IF to_regclass('dfabulous_stage4.phase2_state') IS NULL OR NOT EXISTS (SELECT 1 FROM dfabulous_stage4.phase2_state WHERE proposal = 'B') THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: proposal B is not recorded as applied; nothing to roll back.';
  END IF;
  IF EXISTS (SELECT 1 FROM dfabulous_stage4.phase2_state WHERE proposal = 'C') THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: proposal C is applied and depends on B; roll back C (04) first.'; END IF;
  SELECT definition INTO v_def FROM dfabulous_stage4.proposal_snapshot WHERE proposal = 'B' AND kind = 'function' AND object_name = 'public.prevent_role_escalation()';
  IF v_def IS NULL THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: no proposal B snapshot.'; END IF;
  EXECUTE v_def;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.prevent_role_escalation()')) THEN RAISE EXCEPTION 'STAGE4 ROLLBACK POSTCONDITION B: function is not restored to SECURITY DEFINER'; END IF;
  DELETE FROM dfabulous_stage4.phase2_state WHERE proposal = 'B';
END
$stage4_b_rb$;

COMMIT;
