-- D'FABULOUS FINAL SECURITY HARDENING
-- Disable the legacy direct booking RPC. The current application creates public
-- booking enquiries only through the validated, rate-limited server API.
-- Execute in the hosted Supabase SQL editor as an authorized database administrator.

BEGIN;

-- The functions are retained for historical compatibility, but no browser or current
-- server path requires them. Removing execution prevents callers from bypassing the
-- server's validation, honeypot and rate-limit controls. Conditional checks keep this
-- migration safe if a function was never created in a particular environment.
DO $$
BEGIN
  IF to_regprocedure('public.create_booking_if_available(text,text,text,date,text,text[],integer,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.create_booking_if_available(
      text, text, text, date, text, text[], integer, text
    ) FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regprocedure('public.get_unavailable_dates()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.get_unavailable_dates() FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;

-- Trigger-only SECURITY DEFINER functions are not application RPCs. Remove their
-- direct execution privilege while retaining trigger invocation.
DO $$
BEGIN
  IF to_regprocedure('public.enforce_payment_ledger_immutability()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.enforce_payment_ledger_immutability() FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.prevent_role_escalation()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.prevent_role_escalation() FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.assign_booking_reference()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.assign_booking_reference() FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;

-- Server-side admin APIs use service_role after independently validating the
-- caller's Supabase session, profile, active state, and permissions.
-- These grants do not grant browser anon/authenticated access.
GRANT SELECT, INSERT, UPDATE ON TABLE public.bookings TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.messages TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.payments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.blocked_dates TO service_role;

-- The public content APIs use the server-only service role. Restore only the
-- explicitly required read grants; private tables remain outside this grant.
DO $$
BEGIN
  IF to_regclass('public.gallery') IS NOT NULL THEN
    GRANT SELECT ON TABLE public.gallery TO service_role;
  END IF;
  IF to_regclass('public.testimonials') IS NOT NULL THEN
    GRANT SELECT ON TABLE public.testimonials TO service_role;
  END IF;
END;
$$;

COMMIT;

-- Verification: this should return no rows for PUBLIC, anon or authenticated.
SELECT grantee, routine_name, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('create_booking_if_available', 'get_unavailable_dates')
  AND grantee IN ('PUBLIC', 'anon', 'authenticated');