-- D'FABULOUS SECURITY REMEDIATION PHASE 1
-- Target: public.payments
--
-- PROPOSAL ONLY. Review before running in the Supabase SQL editor.
--
-- Context: no repository migration has ever enabled row level security or defined a
-- policy for public.payments. The anon key ships inside the public browser bundle, so
-- until this runs the payment ledger may be readable by anyone who holds it.
--
-- Guarantees:
--   * Idempotent. Safe to run repeatedly; policies are dropped by name before creation.
--   * Non-destructive. No CREATE TABLE, DROP TABLE, ALTER COLUMN, INSERT, UPDATE or DELETE.
--   * No payment record is read, altered or removed.
--   * Authorization derives only from public.is_admin() / public.is_owner().
--   * No service-role or secret key is involved at any point.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. PRE-FLIGHT AUDIT (informational; changes nothing)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rls boolean;
  v_policies integer;
  v_anon_grants integer;
BEGIN
  IF to_regclass('public.payments') IS NULL THEN
    RAISE EXCEPTION 'public.payments does not exist. Aborting: this migration never creates the table.';
  END IF;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.payments'::regclass;
  SELECT count(*) INTO v_policies FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payments';
  SELECT count(*) INTO v_anon_grants FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'payments' AND grantee = 'anon';

  RAISE NOTICE 'BEFORE: rls_enabled=%, policy_count=%, anon_grant_count=%', v_rls, v_policies, v_anon_grants;
END;
$$;

-- Required by every policy below. Abort rather than silently create an open table.
DO $$
BEGIN
  IF to_regproc('public.is_admin()') IS NULL OR to_regproc('public.is_owner()') IS NULL THEN
    RAISE EXCEPTION 'public.is_admin()/public.is_owner() are missing. Apply the admin RLS privileges migration first.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. ENABLE ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
-- With RLS on and no matching policy, the default is deny. Every access path below
-- must therefore be granted explicitly.
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. TABLE PRIVILEGES
-- ---------------------------------------------------------------------------
-- Defence in depth: the anon role is stripped of every privilege, so an accidental
-- or future permissive policy still cannot expose the ledger to the public key.
REVOKE ALL ON TABLE public.payments FROM PUBLIC;
REVOKE ALL ON TABLE public.payments FROM anon;

-- Grants are role-wide, not per-user. They set the ceiling; the policies below decide
-- which authenticated users actually pass. UPDATE/DELETE are granted only so the
-- owner-only policies can function, and no application code path uses them.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payments TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. REMOVE ANY PRE-EXISTING POLICIES (idempotency, no duplicates)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins read payments"   ON public.payments;
DROP POLICY IF EXISTS "Admins insert payments" ON public.payments;
DROP POLICY IF EXISTS "Owners update payments" ON public.payments;
DROP POLICY IF EXISTS "Owners delete payments" ON public.payments;
-- Common permissive defaults created by dashboard/scaffold tooling.
DROP POLICY IF EXISTS "Public read payments"                       ON public.payments;
DROP POLICY IF EXISTS "Enable read access for all users"           ON public.payments;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.payments;
DROP POLICY IF EXISTS "Users view own payments"                    ON public.payments;

-- ---------------------------------------------------------------------------
-- 4. POLICIES
-- ---------------------------------------------------------------------------

-- SELECT: admins and owners only. Serves all three client reads and both server reads.
CREATE POLICY "Admins read payments"
ON public.payments
FOR SELECT
TO authenticated
USING (public.is_admin());

-- INSERT: admins and owners only, and the row must be attributed to the acting user.
-- user_id is not a source of authorization (is_admin() is); the check simply prevents
-- an admin from writing a payment under another account's identity.
CREATE POLICY "Admins insert payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() AND user_id = auth.uid());

-- UPDATE: owner only. Amending amount, status, gateway_reference or
-- gateway_transaction_id rewrites the accounting trail, so it is the narrowest role.
-- No application code performs an update.
CREATE POLICY "Owners update payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (public.is_owner())
WITH CHECK (public.is_owner());

-- DELETE: owner only, for the same reason.
CREATE POLICY "Owners delete payments"
ON public.payments
FOR DELETE
TO authenticated
USING (public.is_owner());

-- ---------------------------------------------------------------------------
-- 5. IMMUTABILITY GUARD FOR FINANCIAL FIELDS
-- ---------------------------------------------------------------------------
-- Policies gate who may issue an UPDATE; this trigger constrains what an UPDATE may
-- change. It fires only on UPDATE, so the existing insert-only payment flow is
-- untouched. Corrections are recorded as new rows (for example payment_type='refund'),
-- which is what the application already does.
CREATE OR REPLACE FUNCTION public.enforce_payment_ledger_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_owner() THEN
    IF NEW.amount                 IS DISTINCT FROM OLD.amount
    OR NEW.currency               IS DISTINCT FROM OLD.currency
    OR NEW.status                 IS DISTINCT FROM OLD.status
    OR NEW.payment_type           IS DISTINCT FROM OLD.payment_type
    OR NEW.gateway_reference      IS DISTINCT FROM OLD.gateway_reference
    OR NEW.gateway_transaction_id IS DISTINCT FROM OLD.gateway_transaction_id
    OR NEW.booking_id             IS DISTINCT FROM OLD.booking_id
    OR NEW.paid_at                IS DISTINCT FROM OLD.paid_at
    THEN
      RAISE EXCEPTION 'Security Policy Exception: payment ledger fields are immutable. Record a correcting entry instead.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_payment_ledger_immutability() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_payment_ledger_immutability ON public.payments;
CREATE TRIGGER trg_enforce_payment_ledger_immutability
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_payment_ledger_immutability();

COMMIT;

-- ---------------------------------------------------------------------------
-- 6. POST-FLIGHT VERIFICATION (read-only; run after COMMIT)
-- ---------------------------------------------------------------------------

-- Expect rls_enabled = true.
SELECT relname, relrowsecurity AS rls_enabled
FROM pg_class
WHERE oid = 'public.payments'::regclass;

-- Expect exactly four policies: SELECT/INSERT gated by is_admin(), UPDATE/DELETE by is_owner().
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'payments'
ORDER BY policyname;

-- Expect zero rows for anon.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'payments' AND grantee = 'anon';

-- Expect the immutability trigger to be present.
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.payments'::regclass AND NOT tgisinternal;

-- Expect the row count to be unchanged from before the migration.
SELECT count(*) AS payment_row_count FROM public.payments;
