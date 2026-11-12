-- D'FABULOUS STAGE 2 / PROPOSAL A: block direct writes to identity, permission and audit tables
-- STATUS: PROPOSAL ONLY. Lives in supabase/proposals/ (NOT supabase/migrations/) so `supabase db push` never applies it.
-- Run on a STAGING project first. Never run against production without explicit written approval.
-- Rollback: 20261112_a_restrict_direct_identity_writes.rollback.sql (restores the state captured below, exactly).
--
-- Reconciled against the repository (see docs/STAGE2_SECURITY_REMEDIATION_REVIEW.md). Everything this file touches
-- exists in the repository SQL; nothing is invented:
--   tables   : public.profiles (no CREATE TABLE in the repo; referenced by FKs and policies), public.permissions,
--              public.user_permissions, public.audit_logs (20260902_admin_permissions_migration.sql)
--   policies : "user_permissions_manage_owner_admin", "audit_logs_insert_owner_admin" (20260902_admin_permissions_migration.sql),
--              "Users update own profile" (security_remediation_migration.sql)
--   roles    : anon, authenticated, service_role (all referenced by the repository SQL)
--
-- What it does (defence in depth; the restriction is enforced by RLS AND by privileges):
--   1. user_permissions: the FOR ALL policy is replaced by a SELECT-only policy that reuses the LIVE predicate and roles
--      of the policy it replaces (read semantics are preserved exactly; if the policy does not exist nothing is created).
--   2. audit_logs INSERT policy and the profiles "own row" UPDATE policy are dropped (the API writes with service_role).
--   3. RESTRICTIVE deny policies for INSERT/UPDATE/DELETE on profiles, user_permissions and audit_logs for anon and
--      authenticated. Restrictive policies are ANDed with every permissive policy, so they also neutralise any write policy
--      that exists in the live database but not in the repository.
--   4. INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER are revoked from authenticated (and everything from anon/PUBLIC)
--      on the four tables. SELECT privileges, SELECT policies and every service_role grant are left exactly as they are.
-- Not touched: bookings, payments, messages, services, site_settings, blocked_dates (the API relies on RLS there),
-- the is_admin()/is_owner() helpers, the prevent_role_escalation() trigger.
-- Pre-state capture: the original policies, RLS flags and table grants are stored in public.security_remediation_snapshots
-- (service-role-inaccessible, RLS on, no policies). A re-run never overwrites an existing snapshot.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'permissions', 'user_permissions', 'audit_logs'] LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE EXCEPTION 'Preflight failed: public.% does not exist', t;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = t) THEN
      RAISE EXCEPTION 'Preflight failed: role % does not exist', t;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['profiles', 'user_permissions', 'audit_logs'] LOOP
    IF NOT has_table_privilege('service_role', format('public.%I', t), 'INSERT, UPDATE, DELETE') THEN
      RAISE NOTICE 'service_role lacks write privileges on public.% : the API cannot write it today, proposal A does not change that.', t;
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Pre-state snapshot (shared by all proposals; created once, never overwritten)
-- ---------------------------------------------------------------------------------------------------------------
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
COMMENT ON TABLE public.security_remediation_snapshots IS
  'Pre-change catalogue state for the D''Fabulous staging security proposals. Owner-only; used by the rollback scripts.';

DROP FUNCTION IF EXISTS pg_temp.capture_table(text, text);
CREATE FUNCTION pg_temp.capture_table(p_proposal text, p_table text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_fq  text := format('public.%I', p_table);
  v_oid oid  := format('public.%I', p_table)::regclass::oid;
  r record;
BEGIN
  -- Capture once per proposal and table: a re-run must never record A's own changes as the "original" state.
  IF EXISTS (SELECT 1 FROM public.security_remediation_snapshots WHERE proposal = p_proposal AND kind = 'rls' AND object_name = v_fq) THEN
    RETURN;
  END IF;

  INSERT INTO public.security_remediation_snapshots (proposal, kind, object_name, definition)
  SELECT p_proposal, 'rls', v_fq, c.relrowsecurity::text || ',' || c.relforcerowsecurity::text
  FROM pg_class c WHERE c.oid = v_oid
  ON CONFLICT DO NOTHING;

  FOR r IN SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table LOOP
    INSERT INTO public.security_remediation_snapshots (proposal, kind, object_name, definition)
    VALUES (p_proposal, 'policy', v_fq || ' ' || r.policyname,
            format('CREATE POLICY %I ON %s AS %s FOR %s TO %s%s%s', r.policyname, v_fq, r.permissive, r.cmd,
                   array_to_string(r.roles, ', '),
                   COALESCE(' USING (' || r.qual || ')', ''),
                   COALESCE(' WITH CHECK (' || r.with_check || ')', '')))
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOR r IN
    SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type
    FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
    WHERE c.oid = v_oid
  LOOP
    IF r.grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role') THEN
      INSERT INTO public.security_remediation_snapshots (proposal, kind, object_name, definition)
      VALUES (p_proposal, 'grant', v_fq || ' ' || r.grantee || ' ' || r.privilege_type, 'GRANT')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END
$$;

SELECT pg_temp.capture_table('A', t) FROM unnest(ARRAY['profiles', 'permissions', 'user_permissions', 'audit_logs']) AS t;
DROP FUNCTION pg_temp.capture_table(text, text);

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Policies
-- ---------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
  v_qual  text;
  v_roles text;
  t       text;
BEGIN
  -- 1a. FOR ALL -> SELECT-only, reusing the live predicate and roles (nothing is invented).
  SELECT qual, array_to_string(roles, ', ') INTO v_qual, v_roles
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'user_permissions' AND policyname = 'user_permissions_manage_owner_admin';
  IF FOUND THEN
    DROP POLICY "user_permissions_manage_owner_admin" ON public.user_permissions;
    DROP POLICY IF EXISTS "user_permissions_read_owner_admin" ON public.user_permissions;
    EXECUTE format('CREATE POLICY "user_permissions_read_owner_admin" ON public.user_permissions FOR SELECT TO %s USING (%s)', v_roles, v_qual);
  END IF;

  -- 1b. Other permissive write policies (the API writes with service_role).
  DROP POLICY IF EXISTS "audit_logs_insert_owner_admin" ON public.audit_logs;
  DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

  -- 1c. Restrictive deny policies.
  FOREACH t IN ARRAY ARRAY['profiles', 'user_permissions', 'audit_logs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS deny_direct_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS deny_direct_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS deny_direct_delete ON public.%I', t);
    EXECUTE format('CREATE POLICY deny_direct_insert ON public.%I AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY deny_direct_update ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY deny_direct_delete ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false)', t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Privileges (revokes only: no privilege is added to any role)
-- ---------------------------------------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.profiles, public.permissions, public.user_permissions, public.audit_logs FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.profiles, public.permissions, public.user_permissions, public.audit_logs FROM authenticated;

COMMIT;

-- Verification: run 20261112_99_verify_readonly.sql (read-only).
