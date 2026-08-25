-- D'FABULOUS PUBLIC DATA ACCESS HARDENING
-- Run after the existing admin and payments RLS migrations.
--
-- Public booking and contact submissions are now handled exclusively by server.ts,
-- using SUPABASE_SERVICE_ROLE_KEY. The browser's anon key must not be able to read
-- or write private customer, financial, profile, or settings data.

BEGIN;

DO $$
BEGIN
  IF to_regproc('public.is_admin()') IS NULL OR to_regproc('public.is_owner()') IS NULL THEN
    RAISE EXCEPTION 'public.is_admin() and public.is_owner() must exist before this migration is run.';
  END IF;
END;
$$;

-- The service-role client is used only by the server and bypasses RLS. Remove all
-- public-key table privileges as defence in depth, in addition to the policies below.
REVOKE ALL ON TABLE public.bookings FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.messages FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.payments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.site_settings FROM PUBLIC, anon;

-- Anonymous visitors can no longer bypass the server's validation and rate limits.
DROP POLICY IF EXISTS "Public create booking" ON public.bookings;
DROP POLICY IF EXISTS "Allow public guest insert on bookings" ON public.bookings;
DROP POLICY IF EXISTS "Public insert message" ON public.messages;
DROP POLICY IF EXISTS "Allow public guest insert on messages" ON public.messages;

-- Keep all private tables under RLS and grant only dashboard operations to the
-- authenticated role; policies remain the per-user authorization boundary.
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON TABLE public.bookings TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payments TO authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.site_settings TO authenticated;

-- Public content is served through the server API, which uses the server-only
-- service_role key. Keep these reads off the browser anon role.
GRANT SELECT ON TABLE public.gallery, public.testimonials, public.site_settings TO service_role;

-- Remove the earlier public settings policy if it was applied. Settings often include
-- operational contact details and must not be exposed through the public key.
DROP POLICY IF EXISTS "Public read site_settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins read site_settings" ON public.site_settings;
CREATE POLICY "Admins read site_settings"
ON public.site_settings
FOR SELECT
TO authenticated
USING (public.is_admin());

-- Helper functions are authorization internals, not public API endpoints.
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;

COMMIT;

-- Verification: each query should return no rows.
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('PUBLIC', 'anon')
  AND table_name IN ('bookings', 'messages', 'payments', 'profiles', 'site_settings');

SELECT policyname, tablename, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('bookings', 'messages', 'payments', 'profiles', 'site_settings')
ORDER BY tablename, policyname;