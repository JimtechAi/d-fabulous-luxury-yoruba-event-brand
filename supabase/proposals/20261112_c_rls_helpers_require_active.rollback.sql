-- D'FABULOUS STAGE 2 / ROLLBACK for proposal C (20261112_c_rls_helpers_require_active.sql)
-- STATUS: PROPOSAL ONLY. Staging first.
-- EXACT rollback: re-executes the original pg_get_functiondef() text of is_admin()/is_owner() and restores their original EXECUTE grants,
-- both captured by proposal C in public.security_remediation_snapshots. Whichever variant was live (NULL-returning or EXISTS-based) comes back
-- byte for byte. Aborts without changes if no snapshot exists. Roll C back BEFORE B.
-- Caution: if the original is_owner() returned NULL (security_remediation variant) and proposal B has been rolled back already, role changes by
-- the API depend on that NULL again; that is the original behaviour.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = public, pg_temp;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.security_remediation_snapshots WHERE proposal = 'C' AND kind = 'function') <> 2 THEN
    RAISE EXCEPTION 'No complete snapshot for proposal C in public.security_remediation_snapshots: refusing to guess the original helpers.';
  END IF;
END
$$;

DO $$
DECLARE
  r record;
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY['public.is_admin()', 'public.is_owner()'] LOOP
    SELECT definition INTO r FROM public.security_remediation_snapshots WHERE proposal = 'C' AND kind = 'function' AND object_name = v_sig;
    EXECUTE r.definition;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_sig);
    FOR r IN
      SELECT split_part(object_name, ' ', 2) AS grantee, split_part(object_name, ' ', 3) AS privilege
      FROM public.security_remediation_snapshots
      WHERE proposal = 'C' AND kind = 'function_grant' AND left(object_name, length(v_sig) + 1) = v_sig || ' '
    LOOP
      EXECUTE format('GRANT %s ON FUNCTION %s TO %s', r.privilege, v_sig,
                     CASE WHEN r.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee) END);
    END LOOP;
  END LOOP;
END
$$;

COMMIT;
