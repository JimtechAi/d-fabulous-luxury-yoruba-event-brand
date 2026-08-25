-- D'FABULOUS ADMIN RLS PRIVILEGES
-- Follow-up migration for the existing profiles.role authorization model.
-- Run this in the Supabase SQL editor or through the project's migration workflow.

-- SECURITY DEFINER helpers read profiles without recursively invoking profiles RLS.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'owner')
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
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'owner'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;

-- Profiles: users can read their own row; admins can read profiles through the helper.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.profiles TO authenticated;
DROP POLICY IF EXISTS "Users view profile" ON public.profiles;
CREATE POLICY "Users view profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.is_admin());

-- Bookings: public forms may insert, but only authorized admins can read/update.
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON TABLE public.bookings TO anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.bookings TO authenticated;
DROP POLICY IF EXISTS "Allow public guest insert on bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins read bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins modify bookings" ON public.bookings;
DROP POLICY IF EXISTS "Owners delete bookings" ON public.bookings;
CREATE POLICY "Allow public guest insert on bookings"
ON public.bookings
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
CREATE POLICY "Admins read bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (public.is_admin());
CREATE POLICY "Admins modify bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Messages/enquiries: preserve public submissions and restrict records to admins.
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON TABLE public.messages TO anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.messages TO authenticated;
DROP POLICY IF EXISTS "Allow public guest insert on messages" ON public.messages;
DROP POLICY IF EXISTS "Admins read messages" ON public.messages;
DROP POLICY IF EXISTS "Admins update messages" ON public.messages;
CREATE POLICY "Allow public guest insert on messages"
ON public.messages
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
CREATE POLICY "Admins read messages"
ON public.messages
FOR SELECT
TO authenticated
USING (public.is_admin());
CREATE POLICY "Admins update messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Services remain publicly readable for the existing public website.
-- Admin write access is restricted to authorized admins.
ALTER TABLE IF EXISTS public.services ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF to_regclass('public.services') IS NOT NULL THEN
    GRANT SELECT ON TABLE public.services TO anon, authenticated;
    GRANT INSERT, UPDATE ON TABLE public.services TO authenticated;
  END IF;
END
$$;
DROP POLICY IF EXISTS "Public read services" ON public.services;
DROP POLICY IF EXISTS "Admin write services" ON public.services;
CREATE POLICY "Public read services"
ON public.services
FOR SELECT
USING (true);
CREATE POLICY "Admin write services"
ON public.services
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- No DELETE grants or policies are created for bookings/messages.
