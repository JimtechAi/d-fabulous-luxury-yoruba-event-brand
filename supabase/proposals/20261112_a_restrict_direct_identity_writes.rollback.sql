-- D'FABULOUS STAGE 2 / ROLLBACK for proposal A (20261112_a_restrict_direct_identity_writes.sql)
-- STATUS: PROPOSAL ONLY. Staging first.
--
-- EXACT rollback: it does not assume what the original definitions were. It restores, for profiles, permissions,
-- user_permissions and audit_logs, the row-level-security flags, the complete policy set and the table grants for
-- PUBLIC/anon/authenticated/service_role that proposal A captured in public.security_remediation_snapshots BEFORE
-- it changed anything. If no snapshot exists it aborts without changing anything.
-- Note: every policy currently on those four tables is dropped and replaced by the captured set, so policies added
-- after proposal A was applied are discarded too. Column-level grants are not captured (the repository defines none).
-- The snapshot rows are kept (re-applying A after a rollback never overwrites them).

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = public, pg_temp;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.security_remediation_snapshots WHERE proposal = 'A' AND kind = 'rls') <> 4 THEN
    RAISE EXCEPTION 'No complete snapshot for proposal A in public.security_remediation_snapshots: refusing to guess the original state.';
  END IF;
END
$$;

DO $$
DECLARE
  t text;
  r record;
  v_fq text;
  v_flags text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'permissions', 'user_permissions', 'audit_logs'] LOOP
    v_fq := format('public.%I', t);

    -- Policies: drop what exists now, recreate what existed before.
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON %s', r.policyname, v_fq);
    END LOOP;
    FOR r IN
      SELECT definition FROM public.security_remediation_snapshots
      WHERE proposal = 'A' AND kind = 'policy' AND left(object_name, length(v_fq) + 1) = v_fq || ' '
      ORDER BY object_name
    LOOP
      EXECUTE r.definition;
    END LOOP;

    -- Grants: clear the four roles, then restore the captured ones.
    EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC, anon, authenticated, service_role', v_fq);
    FOR r IN
      SELECT split_part(object_name, ' ', 2) AS grantee, split_part(object_name, ' ', 3) AS privilege
      FROM public.security_remediation_snapshots
      WHERE proposal = 'A' AND kind = 'grant' AND left(object_name, length(v_fq) + 1) = v_fq || ' '
    LOOP
      EXECUTE format('GRANT %s ON TABLE %s TO %s', r.privilege, v_fq,
                     CASE WHEN r.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee) END);
    END LOOP;

    -- RLS flags.
    SELECT definition INTO v_flags FROM public.security_remediation_snapshots WHERE proposal = 'A' AND kind = 'rls' AND object_name = v_fq;
    EXECUTE format('ALTER TABLE %s %s ROW LEVEL SECURITY', v_fq, CASE WHEN split_part(v_flags, ',', 1) = 'true' THEN 'ENABLE' ELSE 'DISABLE' END);
    EXECUTE format('ALTER TABLE %s %s ROW LEVEL SECURITY', v_fq, CASE WHEN split_part(v_flags, ',', 2) = 'true' THEN 'FORCE' ELSE 'NO FORCE' END);
  END LOOP;
END
$$;

COMMIT;
