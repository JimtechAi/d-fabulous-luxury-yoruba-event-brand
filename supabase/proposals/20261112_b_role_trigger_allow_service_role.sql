-- D'FABULOUS STAGE 2 / PROPOSAL B: let the trusted server-side API change roles, explicitly
-- STATUS: PROPOSAL ONLY. Lives in supabase/proposals/ (NOT supabase/migrations/). Staging first; never production without approval.
-- Rollback: 20261112_b_role_trigger_allow_service_role.rollback.sql (restores the captured original function and its grants).
--
-- Reconciled against the repository: public.prevent_role_escalation() and trigger trg_prevent_role_escalation exist only in
-- security_remediation_migration.sql (EXECUTE revoked from PUBLIC/anon/authenticated by 20260902_final_security_hardening.sql).
-- That trigger function allows a role change only when public.is_owner() is true. The repository contains TWO is_owner() bodies:
--   (a) security_remediation_migration.sql  : returns NULL when auth.uid() is NULL  -> `IF NOT is_owner()` is not true -> the
--       server-side API (service_role) is let through only by an accident of three-valued logic;
--   (b) 20260814_admin_rls_privileges.sql   : returns false when auth.uid() is NULL -> the same trigger BLOCKS every API role
--       change, including the Owner's.
-- Which is live depends on the (unrecorded) order the migrations were applied in. This proposal makes the intended behaviour explicit
-- and identical under both: browser roles (authenticated/anon) may change a role only if they are the Owner; the service_role (used
-- only by the server, which enforces the Owner-only hierarchy in lib/userPolicy.ts first) may change roles.
--
-- Scope: only the body of the existing function changes. The trigger, its timing (BEFORE UPDATE), and the function's grants are
-- NOT touched (CREATE OR REPLACE preserves them). Nothing is created if the function/trigger do not exist (the proposal aborts).
-- Behaviour change to be aware of: a DBA using the SQL editor (role postgres) is no longer let through under variant (a); they
-- must disable the trigger deliberately or use the Owner/API path.
--   * SECURITY INVOKER so current_user is the role that issued the UPDATE (inside SECURITY DEFINER it would always be the owner).
--   * search_path is pinned to empty and everything is schema-qualified.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  v_fn oid := to_regprocedure('public.prevent_role_escalation()');
BEGIN
  IF v_fn IS NULL OR to_regprocedure('public.is_owner()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.profiles'::regclass AND t.tgfoid = v_fn AND NOT t.tgisinternal) THEN
    RAISE EXCEPTION 'Preflight failed: public.prevent_role_escalation(), public.is_owner() and the trigger on public.profiles must already exist (security_remediation_migration.sql). This proposal never creates them.';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.security_remediation_snapshots (
  proposal    text        NOT NULL,
  kind        text        NOT NULL,
  object_name text        NOT NULL,
  definition  text        NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal, kind, object_name)
);
ALTER TABLE public.security_remediation_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.security_remediation_snapshots FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS pg_temp.capture_function(text, text);
CREATE FUNCTION pg_temp.capture_function(p_proposal text, p_signature text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_oid oid := p_signature::regprocedure::oid;
  r record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.security_remediation_snapshots WHERE proposal = p_proposal AND kind = 'function' AND object_name = p_signature) THEN
    RETURN;  -- capture once: a re-run must never record this proposal's own change as the original
  END IF;
  INSERT INTO public.security_remediation_snapshots (proposal, kind, object_name, definition)
  VALUES (p_proposal, 'function', p_signature, pg_get_functiondef(v_oid));
  FOR r IN
    SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = v_oid
  LOOP
    IF r.grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role') THEN
      INSERT INTO public.security_remediation_snapshots (proposal, kind, object_name, definition)
      VALUES (p_proposal, 'function_grant', p_signature || ' ' || r.grantee || ' ' || r.privilege_type, 'GRANT')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END
$$;

SELECT pg_temp.capture_function('B', 'public.prevent_role_escalation()');
DROP FUNCTION pg_temp.capture_function(text, text);

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- The trusted server-side role (RLS-bypassing; its key never reaches the browser) may change roles.
    IF current_user = 'service_role' THEN
      RETURN NEW;
    END IF;

    -- Browser roles: only an authenticated Owner may change roles.
    IF public.is_owner() IS NOT TRUE THEN
      RAISE EXCEPTION 'Security Policy Exception: Privilege escalation denied. Only owner account can modify user roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
