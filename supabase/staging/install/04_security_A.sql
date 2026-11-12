-- D'FABULOUS STAGE 4 / PHASE 2 / 04: Proposal A, direct identity, permission, audit and ledger writes (STAGING ONLY)
-- STATUS: PREPARED, NOT EXECUTED. Requires Phase 1 (01 + 02) on dfabulous-staging (qwoxxroszmwobnzqgndr). Independent of proposals B and C.
-- Rollback: rollback/02_rollback_security_A.sql (restores the captured policies and privileges exactly).
--
-- ADAPTED TO THE REAL PRODUCTION SCHEMA (the earlier proposal looked up names production does not have):
--   production policy on user_permissions : "user_permissions_manage_active_owner_admin" FOR ALL   (not "..._manage_owner_admin")
--   production profile write policies     : "Users update profile" (own row OR any admin) and "Admins can update profiles"   (not "Users update own profile")
--   production audit_logs                 : SELECT policy only; no write policy
--   production privileges                 : authenticated holds ALL on profiles/user_permissions and TRUNCATE/TRIGGER/REFERENCES/MAINTAIN elsewhere
-- WHAT IT DOES
--   1. profiles       : drops the two UPDATE policies (self-reactivation, admin edits of any profile incl. the Owner's); keeps every SELECT policy.
--   2. user_permissions: replaces the FOR ALL policy by SELECT-only policies (active owner/admin read; own rows readable by the user, which the API needs for
--                        staff/viewer accounts); no browser role can write. Administrators therefore cannot change their own permissions through the database;
--                        the trusted backend (service_role) is the only write path and enforces the hierarchy in lib/userPolicy.ts.
--   3. RESTRICTIVE deny policies (INSERT/UPDATE/DELETE for anon and authenticated) on profiles, user_permissions, permissions, audit_logs, and
--      DELETE on payments. Why restrictive as well as dropping/revoking: restrictive policies are ANDed with every permissive policy, so a
--      permissive write policy added later (or a re-granted privilege) cannot reopen these tables. Tested in tests/stage4-hardened.test.mjs.
--      service_role bypasses RLS and is not affected.
--   4. PAYMENTS (final decision C): authorised, ACTIVE administrators may edit payment records directly; nobody else may; nothing may delete them.
--        - RLS   : the production permissive policy "Admins can update payments" is kept; a RESTRICTIVE policy stage4_require_active_admin_update is ANDed
--                  with it so that only an active admin/owner passes (an inactive one is refused even before proposal C, and a later permissive policy cannot widen it).
--        - Grants: authenticated gets column-level UPDATE on exactly 7 columns (amount, currency, payment_type, status, payment_method, metadata, paid_at);
--                  no table-level UPDATE/DELETE. Identifiers (id, booking_id, user_id, provider, gateway_reference, gateway_transaction_id, customer_email,
--                  created_at) have no UPDATE grant.
--        - Guard : BEFORE UPDATE trigger stage4_payments_guard() (SECURITY INVOKER, empty search_path) refuses any change to those identifiers for EVERY role
--                  (defence in depth against a future grant; user_id may only become NULL, which is what the profile-deletion foreign key does), requires an
--                  admin when the caller is anon/authenticated, REQUIRES A NON-EMPTY metadata.adjustment_reason (1-500 chars, string) on every effective edit by
--                  those roles (SQLSTATE 23514), moves that reason out of the stored row into the audit event (a payer who may read their own payment row never
--                  sees it), and maintains updated_at (no updated_at trigger in production).
--        - Audit : AFTER UPDATE trigger stage4_payments_audit() (SECURITY DEFINER, empty search_path, no EXECUTE for any API role) appends one audit_logs row
--                  'payment.updated' (context administrator_edit, with adjustment_reason) with actor, payment/booking ids, changed field names and before/after
--                  values. The foreign-key SET NULL caused by a profile deletion is recorded instead as 'payment.user_unlinked' (context profile_deletion,
--                  deleted_user_id, NO actor). Fail-closed: if the audit insert fails, the payment update fails. audit_logs stays readable by the active Owner only.
--   5. Privileges: no PUBLIC/anon access to the 4 identity tables; authenticated keeps SELECT only (payments: SELECT, INSERT + the column UPDATE above);
--      TRUNCATE, TRIGGER, REFERENCES and MAINTAIN are removed everywhere in scope; service_role loses UPDATE/DELETE/TRUNCATE/... on audit_logs
--      (append-only), and everything on permissions (reference data written by migrations).
-- Not touched: bookings, messages, blocked_dates, site_settings, services, gallery, testimonials, is_admin()/is_owner(), prevent_role_escalation().
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

DO $stage4_a_pre$
DECLARE
  v_ref constant text := 'qwoxxroszmwobnzqgndr';
  v_name text;
BEGIN
  IF coalesce(current_setting('dfabulous.confirm_project', true), '') <> v_ref THEN RAISE EXCEPTION 'STAGE4 GUARD: not armed (see the header of this script).'; END IF;
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: run as the postgres login (current user: %).', current_user; END IF;
  IF to_regclass('dfabulous_stage4.install_marker') IS NULL OR NOT EXISTS (SELECT 1 FROM dfabulous_stage4.install_marker WHERE project_ref = v_ref AND phase = 'phase1-baseline') THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: Phase 1 install marker missing; run 01 first (production never has one).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dfabulous_stage4.snapshot_status WHERE scope = 'normalisation') THEN
    RAISE EXCEPTION 'STAGE4 PRECONDITION: 02_privilege_normalisation.sql has not been run; Phase 2 assumes the least-privilege state.';
  END IF;
  FOREACH v_name IN ARRAY ARRAY['profiles', 'user_permissions', 'permissions', 'audit_logs', 'payments'] LOOP
    IF to_regclass('public.' || v_name) IS NULL THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: public.% missing', v_name; END IF;
  END LOOP;
  IF to_regprocedure('public.is_admin()') IS NULL OR to_regprocedure('public.is_owner()') IS NULL THEN RAISE EXCEPTION 'STAGE4 PRECONDITION: is_admin()/is_owner() missing'; END IF;
END
$stage4_a_pre$;

CREATE TABLE IF NOT EXISTS dfabulous_stage4.proposal_snapshot (
  proposal    text NOT NULL,
  kind        text NOT NULL,   -- policy | acl_table | acl_grant
  object_name text NOT NULL,
  definition  text NOT NULL,
  PRIMARY KEY (proposal, kind, object_name)
);
REVOKE ALL ON TABLE dfabulous_stage4.proposal_snapshot FROM PUBLIC, anon, authenticated, service_role;

-- Capture the pre-state ONCE (policies and privileges of the five tables in scope)
DO $stage4_a_snapshot$
BEGIN
  IF EXISTS (SELECT 1 FROM dfabulous_stage4.snapshot_status WHERE scope = 'A') THEN
    RAISE NOTICE 'stage4: proposal A pre-state already captured; keeping the original.';
    RETURN;
  END IF;
  INSERT INTO dfabulous_stage4.proposal_snapshot (proposal, kind, object_name, definition)
  SELECT 'A', 'policy', c.relname || '|' || p.polname,
    format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s', p.polname, n.nspname, c.relname,
      CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END,
      (SELECT string_agg(CASE WHEN o = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(o)) END, ', ') FROM unnest(p.polroles) o),
      CASE WHEN p.polqual IS NOT NULL THEN ' USING (' || pg_get_expr(p.polqual, p.polrelid) || ')' ELSE '' END,
      CASE WHEN p.polwithcheck IS NOT NULL THEN ' WITH CHECK (' || pg_get_expr(p.polwithcheck, p.polrelid) || ')' ELSE '' END)
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('profiles', 'user_permissions', 'permissions', 'audit_logs', 'payments');

  INSERT INTO dfabulous_stage4.proposal_snapshot (proposal, kind, object_name, definition)
  SELECT 'A', 'acl_table', c.relname, 'marker' FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('profiles', 'user_permissions', 'permissions', 'audit_logs', 'payments')
  UNION ALL
  SELECT 'A', 'acl_grant', c.relname || '|' || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || '|' || a.privilege_type,
    CASE WHEN a.is_grantable THEN 'GRANT OPTION' ELSE 'GRANT' END
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r'::"char", c.relowner))) a
  WHERE n.nspname = 'public' AND c.relname IN ('profiles', 'user_permissions', 'permissions', 'audit_logs', 'payments')
    AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'));
  INSERT INTO dfabulous_stage4.snapshot_status (scope) VALUES ('A');
END
$stage4_a_snapshot$;

-- 1-3. Policies
DO $stage4_a_policies$
DECLARE
  t text;
  c text;
BEGIN
  -- profiles: no browser UPDATE policy remains (self-reactivation and admin edits of any profile stop); SELECT policies are kept
  DROP POLICY IF EXISTS "Users update profile" ON public.profiles;
  DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
  DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;       -- name used by the repository migration; absent in production

  -- user_permissions: FOR ALL -> SELECT only (same predicate as production for owner/admin) plus own rows
  DROP POLICY IF EXISTS "user_permissions_manage_active_owner_admin" ON public.user_permissions;
  DROP POLICY IF EXISTS "user_permissions_manage_owner_admin" ON public.user_permissions;   -- repository name; absent in production
  DROP POLICY IF EXISTS "user_permissions_read_active_owner_admin" ON public.user_permissions;
  CREATE POLICY "user_permissions_read_active_owner_admin" ON public.user_permissions FOR SELECT TO authenticated
    USING ((public.is_owner() OR public.is_admin()) AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_active = true));
  DROP POLICY IF EXISTS "user_permissions_read_own" ON public.user_permissions;
  CREATE POLICY "user_permissions_read_own" ON public.user_permissions FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_active = true));

  -- audit_logs: repository policy name that would let administrators forge entries; absent in production
  DROP POLICY IF EXISTS "audit_logs_insert_owner_admin" ON public.audit_logs;

  -- RESTRICTIVE denies for browser roles
  FOREACH t IN ARRAY ARRAY['profiles', 'user_permissions', 'permissions', 'audit_logs'] LOOP
    FOREACH c IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'stage4_deny_' || c, t);
    END LOOP;
    EXECUTE format('CREATE POLICY stage4_deny_insert ON public.%I AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY stage4_deny_update ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY stage4_deny_delete ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false)', t);
  END LOOP;
  -- payments: never deletable from a browser; updatable only by an ACTIVE administrator/owner (ANDed with the production policy "Admins can update payments")
  DROP POLICY IF EXISTS stage4_deny_update ON public.payments;                 -- removes the deny of an earlier package revision, if present
  DROP POLICY IF EXISTS stage4_deny_delete ON public.payments;
  DROP POLICY IF EXISTS stage4_require_active_admin_update ON public.payments;
  CREATE POLICY stage4_deny_delete ON public.payments AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);
  CREATE POLICY stage4_require_active_admin_update ON public.payments AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (public.is_admin() AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_active = true))
    WITH CHECK (public.is_admin() AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_active = true));
END
$stage4_a_policies$;

-- 4. Payments guard and audit (see header)
CREATE OR REPLACE FUNCTION public.stage4_payments_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $stage4_guard_fn$
DECLARE
  v_reason text;
  v_typed text;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.gateway_reference IS DISTINCT FROM OLD.gateway_reference
     OR NEW.gateway_transaction_id IS DISTINCT FROM OLD.gateway_transaction_id
     OR NEW.customer_email IS DISTINCT FROM OLD.customer_email
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (NEW.user_id IS DISTINCT FROM OLD.user_id AND NEW.user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'payment identifiers, booking link, provider, gateway references and customer email cannot be modified' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('dfabulous.payment_reason', '', true);
  IF current_user IN ('anon', 'authenticated') THEN
    IF public.is_admin() IS NOT TRUE THEN
      RAISE EXCEPTION 'only an administrator can modify a payment' USING ERRCODE = '42501';
    END IF;
    -- The reason travels in metadata.adjustment_reason, is validated here, handed to the audit trigger through a transaction-local setting and REMOVED from the
    -- stored row: it lives only in audit_logs (active Owner), never in a payment row that a payer may be allowed to read.
    v_reason := btrim(coalesce(NEW.metadata ->> 'adjustment_reason', ''));
    v_typed := jsonb_typeof(NEW.metadata -> 'adjustment_reason');
    NEW.metadata := NEW.metadata - 'adjustment_reason';
    -- every effective administrator edit needs a non-empty reason (enforced here, not in the frontend); an unchanged save needs none
    IF (to_jsonb(OLD) - 'updated_at') IS DISTINCT FROM (to_jsonb(NEW) - 'updated_at') THEN
      IF v_typed IS DISTINCT FROM 'string' OR v_reason = '' OR length(v_reason) > 500 THEN
        RAISE EXCEPTION 'every payment edit needs an adjustment reason (1-500 characters) in metadata.adjustment_reason' USING ERRCODE = '23514';
      END IF;
      PERFORM set_config('dfabulous.payment_reason', v_reason, true);
    END IF;
  END IF;
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END
$stage4_guard_fn$;

CREATE OR REPLACE FUNCTION public.stage4_payments_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $stage4_audit_fn$
DECLARE
  v_old jsonb := to_jsonb(OLD) - 'updated_at';
  v_new jsonb := to_jsonb(NEW) - 'updated_at';
  v_keys text[];
  v_before jsonb;
  v_after jsonb;
  v_actor uuid;
  v_role text := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  v_unlink boolean;
BEGIN
  IF v_old = v_new THEN RETURN NULL; END IF;
  SELECT array_agg(k ORDER BY k) INTO v_keys FROM jsonb_object_keys(v_new) AS k WHERE v_old -> k IS DISTINCT FROM v_new -> k;
  SELECT jsonb_object_agg(k, v_old -> k), jsonb_object_agg(k, v_new -> k) INTO v_before, v_after FROM unnest(v_keys) AS k;
  -- The only update the database performs on its own is the foreign key ON DELETE SET NULL of payments.user_id. It runs as the table owner, changes nothing
  -- but user_id, and by then the referenced profile row is gone (the deleting statement is already visible). That fact, not a claim by the caller, selects
  -- the profile-deletion event; it is recorded with no actor. (trigger depth cannot be used: the foreign-key action fires this trigger at depth 1.)
  v_unlink := v_keys = ARRAY['user_id'] AND NEW.user_id IS NULL AND OLD.user_id IS NOT NULL AND v_role NOT IN ('anon', 'authenticated')
              AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.user_id);
  IF v_unlink THEN
    INSERT INTO public.audit_logs (actor_user_id, action, target_user_id, metadata)
    VALUES (NULL, 'payment.user_unlinked', NULL, jsonb_build_object(
      'payment_id', NEW.id, 'booking_id', NEW.booking_id, 'context', 'profile_deletion', 'deleted_user_id', OLD.user_id,
      'changed_fields', to_jsonb(v_keys), 'before', v_before, 'after', v_after));
    RETURN NULL;
  END IF;
  SELECT id INTO v_actor FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs (actor_user_id, action, target_user_id, metadata)
  VALUES (v_actor, 'payment.updated', NULL, jsonb_build_object(
    'payment_id', NEW.id, 'booking_id', NEW.booking_id,
    'context', CASE WHEN v_role = 'authenticated' THEN 'administrator_edit' ELSE 'database_session' END,
    'adjustment_reason', nullif(current_setting('dfabulous.payment_reason', true), ''),
    'db_role', v_role,
    'changed_fields', to_jsonb(v_keys), 'before', v_before, 'after', v_after));
  RETURN NULL;
END
$stage4_audit_fn$;

REVOKE ALL ON FUNCTION public.stage4_payments_guard(), public.stage4_payments_audit() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE TRIGGER trg_stage4_payments_guard BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.stage4_payments_guard();
CREATE OR REPLACE TRIGGER trg_stage4_payments_audit AFTER UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.stage4_payments_audit();

-- 4. Privileges (revoke only; nothing is added except re-asserting SELECT where the application reads)
REVOKE ALL ON TABLE public.profiles, public.permissions, public.user_permissions, public.audit_logs, public.payments FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.profiles, public.permissions, public.user_permissions, public.audit_logs FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.payments FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.audit_logs FROM service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.profiles, public.user_permissions, public.payments FROM service_role;
REVOKE ALL ON TABLE public.permissions FROM service_role;
-- the only privilege this script adds: column-level UPDATE on the editable payment columns (identifiers are deliberately absent)
GRANT UPDATE (amount, currency, payment_type, status, payment_method, metadata, paid_at) ON TABLE public.payments TO authenticated;

INSERT INTO dfabulous_stage4.phase2_state (proposal) VALUES ('A') ON CONFLICT (proposal) DO NOTHING;

-- Post-conditions
DO $stage4_a_post$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(c.relname || ':' || p.polname, ', ') INTO v_bad
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('profiles', 'user_permissions', 'permissions', 'audit_logs') AND p.polpermissive AND p.polcmd IN ('a', 'w', 'd', '*')
    AND (0 = ANY (p.polroles) OR EXISTS (SELECT 1 FROM unnest(p.polroles) o WHERE pg_get_userbyid(o) IN ('anon', 'authenticated')));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'STAGE4 POSTCONDITION A: a permissive write policy remains for a browser role: %', v_bad; END IF;
  IF (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relnamespace = 'public'::regnamespace AND NOT p.polpermissive AND p.polname LIKE 'stage4_deny_%')   <> 13 THEN
     RAISE EXCEPTION 'STAGE4 POSTCONDITION A: expected 13 restrictive deny policies';
  END IF;
   IF NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = 'public.payments'::regclass AND p.polname = 'stage4_require_active_admin_update' AND NOT p.polpermissive)
      OR (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = 'public.payments'::regclass AND t.tgname IN ('trg_stage4_payments_guard', 'trg_stage4_payments_audit') AND t.tgenabled = 'O') <> 2 THEN
     RAISE EXCEPTION 'STAGE4 POSTCONDITION A: payments policy or triggers missing';
   END IF;
   IF EXISTS (SELECT 1 FROM unnest(ARRAY['id', 'booking_id', 'user_id', 'provider', 'gateway_reference', 'gateway_transaction_id', 'customer_email', 'created_at', 'updated_at']) c
              WHERE has_column_privilege('authenticated', 'public.payments', c, 'UPDATE'))
      OR NOT has_column_privilege('authenticated', 'public.payments', 'status', 'UPDATE') THEN
     RAISE EXCEPTION 'STAGE4 POSTCONDITION A: payment column privileges are not as designed';
   END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['profiles', 'permissions', 'user_permissions', 'audit_logs']) t
             CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) p
             WHERE has_table_privilege('authenticated', 'public.' || t, p) OR has_table_privilege('anon', 'public.' || t, p)) THEN
    RAISE EXCEPTION 'STAGE4 POSTCONDITION A: a browser role still holds a write or maintenance privilege on an identity table';
  END IF;
  IF has_table_privilege('authenticated', 'public.payments', 'UPDATE') OR has_table_privilege('authenticated', 'public.payments', 'DELETE') THEN
    RAISE EXCEPTION 'STAGE4 POSTCONDITION A: authenticated can still modify payments';
  END IF;
END
$stage4_a_post$;

COMMIT;
