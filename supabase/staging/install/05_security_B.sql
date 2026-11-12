-- D'FABULOUS STAGE 4 / PHASE 2 / 05: Proposal B, role-change trigger (STAGING ONLY)
-- STATUS: PREPARED, NOT EXECUTED. Requires Phase 1 (01 + 02) on dfabulous-staging (qwoxxroszmwobnzqgndr). Independent of A and C; C requires B.
-- Rollback: rollback/03_rollback_security_B.sql (restores the captured production function body exactly).
--
-- THE DEFECT (production): prevent_role_escalation() is SECURITY DEFINER and allows a role change only if public.is_owner(); is_owner() is the EXISTS variant
-- that returns false when auth.uid() is NULL, so EVERY role change by the trusted backend (service_role, no JWT subject) is rejected, including legitimate ones.
--
-- THE DESIGN (who may change profiles.role):
--   * service_role  : allowed. It is the approved backend path (server.ts / Edge Function), which enforces the Owner-only hierarchy in lib/userPolicy.ts
--                     first. TRUST BOUNDARY: any holder of the service key can assign any role; keep the key server-side only.
--   * authenticated : allowed ONLY if the caller is an ACTIVE OWNER (is_owner() IS TRUE, strict) acting on SOMEONE ELSE'S row. Nobody changes their own role
--                     through the database (no self-promotion, no accidental owner demotion). Once proposal A is applied authenticated cannot UPDATE profiles at
--                     all; this branch is defence in depth for the case A is not (or no longer) in force.
--   * everyone else (anon, postgres, supabase_admin, unknown roles, NULL identities): denied, fail closed. NULL is never treated as Owner:
--                     the test is `IS TRUE`, so a NULL or false result denies.
--   Break glass for a DBA: ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_role_escalation; ...change...; ENABLE TRIGGER (same as production today).
--
-- WHY SECURITY INVOKER (a reasoned change from production's SECURITY DEFINER):
--   * Inside a SECURITY DEFINER function current_user is always the function OWNER (postgres), so the caller's role cannot be seen; a definer version would
--     have to identify service_role from the JWT claims (auth.role(), request.jwt.claim.*). Those are session settings: any session that can run SQL as
--     authenticated can set them with set_config(), so a claim-based bypass is spoofable in a direct-SQL context.
--   * With SECURITY INVOKER, current_user is the role that issued the UPDATE and cannot be changed by set_config() or by any JWT claim. The only way to
--     change it is SET ROLE, which PostgreSQL permits only if the SESSION user is a member of the target role. Under PostgREST the session user is the
--     `authenticator` login, which IS a member of anon, authenticated and service_role, and API requests cannot execute SET ROLE. So this holds against API
--     callers, and against any login that is not `authenticator`; it does NOT hold against someone who can run arbitrary SQL as `authenticator` (that
--     login and the database password must stay secret). A claim-based check would additionally fall to a plain set_config() call. Under PostgREST the
--     request role is switched with SET LOCAL ROLE, which this relies on (CANNOT be proven offline; staging test required).
--   * The function reads no table itself. Its only dependency, public.is_owner(), stays SECURITY DEFINER and is executable by authenticated (kept by 02).
--   * Trigger functions need no EXECUTE privilege at fire time, so the function stays unexecutable by API roles.
--   * search_path is pinned to '' and every reference is schema-qualified; pg_catalog is always searched implicitly.
--   * Caveat: an UPDATE issued from inside another SECURITY DEFINER function runs as that function's owner (postgres) and is denied. No such function exists.
-- Only the function body and attributes change; the trigger (BEFORE UPDATE, row-level) and the function's ACL are untouched (CREATE OR REPLACE keeps both).
-- Arm the guard first (same session):  SELECT set_config('dfabulous.confirm_project', 'qwoxxroszmwobnzqgndr', false);

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = pg_catalog, pg_temp;

DO $stage4_early$
BEGIN
  IF to_regclass('dfabulous_stage4.install_marker') IS NULL THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: no Phase 1 install marker (dfabulous_stage4.install_marker); run 01_production_schema.sql and 02_privilege_normalisation.sql first. Production never has this marker.';
  END IF;
END
$stage4_early$;

DO $stage4_b_pre$
DECLARE
  v_ref constant text := 'qwoxxroszmwobnzqgndr';
  v_fn oid := to_regprocedure('public.prevent_role_escalation()');
BEGIN
  IF coalesce(current_setting('dfabulous.confirm_project', true), '') <> v_ref THEN RAISE EXCEPTION 'STAGE4 GUARD: not armed (see the header of this script).'; END IF;
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: run as the postgres login (current user: %).', current_user; END IF;
  IF to_regclass('dfabulous_stage4.install_marker') IS NULL OR NOT EXISTS (SELECT 1 FROM dfabulous_stage4.install_marker WHERE project_ref = v_ref AND phase = 'phase1-baseline') THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: Phase 1 install marker missing; run 01 first (production never has one).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dfabulous_stage4.snapshot_status WHERE scope = 'normalisation') THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: 02_privilege_normalisation.sql has not been run.';
  END IF;
  IF v_fn IS NULL OR to_regprocedure('public.is_owner()') IS NULL THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: prevent_role_escalation() or is_owner() missing.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.profiles'::regclass AND t.tgfoid = v_fn AND NOT t.tgisinternal AND t.tgenabled = 'O'
                 AND (t.tgtype & 1) = 1 AND (t.tgtype & 2) = 2 AND (t.tgtype & 16) = 16) THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: the BEFORE UPDATE row trigger on public.profiles that calls prevent_role_escalation() is missing or disabled.';
  END IF;
END
$stage4_b_pre$;

CREATE TABLE IF NOT EXISTS dfabulous_stage4.proposal_snapshot (
  proposal    text NOT NULL,
  kind        text NOT NULL,
  object_name text NOT NULL,
  definition  text NOT NULL,
  PRIMARY KEY (proposal, kind, object_name)
);
REVOKE ALL ON TABLE dfabulous_stage4.proposal_snapshot FROM PUBLIC, anon, authenticated, service_role;

DO $stage4_b_snapshot$
BEGIN
  IF EXISTS (SELECT 1 FROM dfabulous_stage4.snapshot_status WHERE scope = 'B') THEN
    RAISE NOTICE 'stage4: proposal B pre-state already captured; keeping the original.';
    RETURN;
  END IF;
  INSERT INTO dfabulous_stage4.proposal_snapshot (proposal, kind, object_name, definition)
  VALUES ('B', 'function', 'public.prevent_role_escalation()', pg_get_functiondef('public.prevent_role_escalation()'::regprocedure));
  INSERT INTO dfabulous_stage4.snapshot_status (scope) VALUES ('B');
END
$stage4_b_snapshot$;

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- Approved backend path (the service key never reaches a browser). Hierarchy rules are enforced by the API before it gets here.
  IF current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- An authenticated ACTIVE owner may change ANOTHER account's role. is_owner() IS TRUE: NULL and false both deny.
  IF current_user = 'authenticated'
     AND auth.uid() IS NOT NULL
     AND OLD.id IS DISTINCT FROM auth.uid()
     AND public.is_owner() IS TRUE THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Security Policy Exception: role changes are restricted to the owner (another account) or the trusted backend.'
    USING ERRCODE = '42501';
END;
$$;

INSERT INTO dfabulous_stage4.phase2_state (proposal) VALUES ('B') ON CONFLICT (proposal) DO NOTHING;

DO $stage4_b_post$
DECLARE v_fn oid := to_regprocedure('public.prevent_role_escalation()');
BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION B: the function is still SECURITY DEFINER'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_fn AND proconfig @> ARRAY['search_path=""']) THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION B: search_path is not pinned to the empty path'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.profiles'::regclass AND t.tgfoid = v_fn AND t.tgenabled = 'O') THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION B: trigger missing or disabled'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') OR has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'STAGE4 POSTCONDITION B: an API role can EXECUTE the trigger function';
  END IF;
END
$stage4_b_post$;

COMMIT;
