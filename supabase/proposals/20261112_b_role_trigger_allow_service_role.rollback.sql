-- D'FABULOUS STAGE 2 / ROLLBACK for proposal B (20261112_b_role_trigger_allow_service_role.sql)
-- STATUS: PROPOSAL ONLY. Staging first.
-- EXACT rollback: re-executes the original pg_get_functiondef() text and restores the original EXECUTE grants captured by
-- proposal B in public.security_remediation_snapshots. Aborts without changes if no snapshot exists.
-- If proposal C is also applied, roll C back FIRST (C depends on B).

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = public, pg_temp;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.security_remediation_snapshots WHERE proposal = 'B' AND kind = 'function' AND object_name = 'public.prevent_role_escalation()') THEN
    RAISE EXCEPTION 'No snapshot for proposal B in public.security_remediation_snapshots: refusing to guess the original function.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.security_remediation_snapshots WHERE proposal = 'C' AND kind = 'function')
     AND position('is_active' IN pg_get_functiondef('public.is_owner()'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'Proposal C is still applied: roll back C before B.';
  END IF;
END
$$;

DO $$
DECLARE
  r record;
  v_sig text := 'public.prevent_role_escalation()';
BEGIN
  SELECT definition INTO r FROM public.security_remediation_snapshots WHERE proposal = 'B' AND kind = 'function' AND object_name = v_sig;
  EXECUTE r.definition;

  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_sig);
  FOR r IN
    SELECT split_part(object_name, ' ', 2) AS grantee, split_part(object_name, ' ', 3) AS privilege
    FROM public.security_remediation_snapshots
    WHERE proposal = 'B' AND kind = 'function_grant' AND left(object_name, length(v_sig) + 1) = v_sig || ' '
  LOOP
    EXECUTE format('GRANT %s ON FUNCTION %s TO %s', r.privilege, v_sig,
                   CASE WHEN r.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee) END);
  END LOOP;
END
$$;

COMMIT;
