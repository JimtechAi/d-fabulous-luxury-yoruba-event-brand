-- D'FABULOUS STAGE 2 / PROPOSAL C (OPTIONAL): make the RLS helpers honour suspended accounts
-- STATUS: PROPOSAL ONLY. Lives in supabase/proposals/ (NOT supabase/migrations/). Staging first; never production without approval.
-- Rollback: 20261112_c_rls_helpers_require_active.rollback.sql (restores the captured original definitions and grants).
-- REQUIRES proposal B first (checked below).
--
-- Reconciled against the repository: public.is_admin() / public.is_owner() are defined in 20260814_admin_rls_privileges.sql
-- (EXISTS-based, returns false) and again in security_remediation_migration.sql (plpgsql SELECT INTO, returns NULL when
-- there is no auth.uid() and wraps everything in an EXCEPTION handler that returns false). Grants: EXECUTE for authenticated only
-- (20260819_public_data_access_hardening.sql). Both bodies test profiles.role only. profiles.is_active is read and written by the
-- application (server.ts / Edge routes) but NO repository SQL defines the column; this proposal therefore refuses to run if it is absent.
--
-- Problem: a suspended account (profiles.is_active = false) is still `admin`/`owner` to every policy that calls the helpers
-- (bookings, messages, payments, services, site_settings, blocked_dates, profiles), because only the API checks is_active.
-- Fix: both helpers additionally require `is_active IS DISTINCT FROM false`, the same interpretation the API uses (NULL = active, only an
-- explicit false suspends), so no currently-working account is locked out. Bodies stay SECURITY DEFINER with the same pinned search_path,
-- CREATE OR REPLACE preserves the existing EXECUTE grants.
-- Side effects you must expect:
--   * is_owner()/is_admin() return strict booleans (never NULL). Under the old security_remediation bodies the NULL result made two guards
--     fail open for callers without auth.uid() (service_role / SQL editor): prevent_role_escalation() (hence the dependency on B) and
--     enforce_payment_ledger_immutability() (20260818). The payment guard will now ALSO apply to them. The application never updates
--     payment rows (it only inserts and selects them), so nothing breaks; a DBA correcting a payment would have to disable the trigger.
--   * Suspending an administrator now also removes their direct database access, but not their Auth session (see the report).

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  v_trigger_fn oid := to_regprocedure('public.prevent_role_escalation()');
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL OR to_regprocedure('public.is_owner()') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: public.is_admin() and public.is_owner() must exist.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_active'
  ) THEN
    RAISE EXCEPTION 'Preflight failed: public.profiles.is_active does not exist (it is not defined by any repository migration).';
  END IF;
  IF v_trigger_fn IS NOT NULL AND position('service_role' IN pg_get_functiondef(v_trigger_fn)) = 0 THEN
    RAISE EXCEPTION 'Preflight failed: apply proposal B (role trigger allows service_role) before proposal C, otherwise the API would lose role changes.';
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

SELECT pg_temp.capture_function('C', sig) FROM unnest(ARRAY['public.is_admin()', 'public.is_owner()']) AS sig;
DROP FUNCTION pg_temp.capture_function(text, text);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'owner')
      AND is_active IS DISTINCT FROM false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'owner'
      AND is_active IS DISTINCT FROM false
  );
END;
$$;

COMMIT;

-- Pre-check before applying (read-only): suspended owners/administrators lose direct access, which is the intent:
--   SELECT email, role FROM public.profiles WHERE role IN ('owner','admin') AND is_active = false;
