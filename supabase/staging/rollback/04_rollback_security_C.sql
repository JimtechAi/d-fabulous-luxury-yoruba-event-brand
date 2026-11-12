-- D'FABULOUS STAGE 4 / PHASE 2 / ROLLBACK 04: undo 06_security_C.sql (STAGING ONLY)
-- STATUS: PREPARED, NOT EXECUTED. Restores the production is_admin() and is_owner() exactly as captured (role-only checks, search_path public, pg_temp).
-- WARNING: this reopens the suspended-administrator gap (26 policies). Refuses to run unless proposal C is recorded as applied.
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

DO $stage4_c_rb$
DECLARE
  v_ref constant text := 'qwoxxroszmwobnzqgndr';
  r record;
BEGIN
  IF coalesce(current_setting('dfabulous.confirm_project', true), '') <> v_ref THEN RAISE EXCEPTION 'STAGE4 GUARD: not armed (see the header of this script).'; END IF;
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: run as the postgres login (current user: %).', current_user; END IF;
  IF to_regclass('dfabulous_stage4.phase2_state') IS NULL OR NOT EXISTS (SELECT 1 FROM dfabulous_stage4.phase2_state WHERE proposal = 'C') THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: proposal C is not recorded as applied; nothing to roll back.';
  END IF;
  IF (SELECT count(*) FROM dfabulous_stage4.proposal_snapshot WHERE proposal = 'C' AND kind = 'function') <> 2 THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: proposal C snapshot incomplete.'; END IF;
  FOR r IN SELECT object_name, definition FROM dfabulous_stage4.proposal_snapshot WHERE proposal = 'C' AND kind = 'function' ORDER BY object_name LOOP
    EXECUTE r.definition;
    IF position('is_active' IN pg_get_functiondef(to_regprocedure(r.object_name))) > 0 THEN RAISE EXCEPTION 'STAGE4 ROLLBACK POSTCONDITION C: % still tests is_active', r.object_name; END IF;
  END LOOP;
  DELETE FROM dfabulous_stage4.phase2_state WHERE proposal = 'C';
END
$stage4_c_rb$;

COMMIT;
