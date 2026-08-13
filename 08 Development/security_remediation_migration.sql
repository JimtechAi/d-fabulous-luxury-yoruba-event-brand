-- ====================================================================
-- D’FABULOUS LUXURY YORUBA EVENTS
-- DATABASE SECURITY REMEDIATION MIGRATION
-- ====================================================================
-- Purpose: Harden is_admin(), prevent role escalation, restrict RLS policies
--          on private tables (bookings, messages), enable public reads on
--          content tables (services, gallery, testimonials, site_settings),
--          and safeguard owner account (fabulousevents@hotmail.com).
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. HARDENED & NON-RECURSIVE IS_ADMIN() & IS_OWNER() FUNCTIONS
-- --------------------------------------------------------------------
-- Uses SECURITY DEFINER with explicit search_path to prevent hijacking.
-- Reads directly from public.profiles without triggering RLS recursion.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();
  
  RETURN v_role IN ('admin', 'owner');
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();
  
  RETURN v_role = 'owner';
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated, anon;

-- --------------------------------------------------------------------
-- 2. PROFILE ROLE SECURITY & PRIVILEGE ESCALATION PREVENTION
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles read" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Owners manage profiles" ON public.profiles;

-- Policy: Users can view their own profile, Admins can view all profiles
CREATE POLICY "Users view profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.is_admin());

-- Policy: Users can update their own profile
CREATE POLICY "Users update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid() OR public.is_owner())
WITH CHECK (id = auth.uid() OR public.is_owner());

-- Trigger to prevent non-owners from changing 'role' column on profiles
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Detect if role column is being modified
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Only active owners can change role values
    IF NOT public.is_owner() THEN
      RAISE EXCEPTION 'Security Policy Exception: Privilege escalation denied. Only owner account can modify user roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- Ensure fabulousevents@hotmail.com maintains 'owner' role in profiles
UPDATE public.profiles
SET role = 'owner'
WHERE email = 'fabulousevents@hotmail.com' AND role IS DISTINCT FROM 'owner';

-- --------------------------------------------------------------------
-- 3. BOOKINGS TABLE SECURITY
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.bookings ENABLE ROW LEVEL SECURITY;

-- Grant INSERT privilege on bookings table to anon and authenticated roles
GRANT INSERT ON public.bookings TO anon, authenticated;

-- Drop conflicting or previous public insert policy names
DROP POLICY IF EXISTS "Public create booking" ON public.bookings;
DROP POLICY IF EXISTS "Allow public guest insert on bookings" ON public.bookings;

-- Public submission allowed for new booking inquiries
CREATE POLICY "Allow public guest insert on bookings"
ON public.bookings
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only authenticated admins/owners can view booking records
CREATE POLICY "Admins read bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (public.is_admin());

-- Only authenticated admins/owners can update bookings (e.g. status)
CREATE POLICY "Admins modify bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Only account owner can delete booking records
CREATE POLICY "Owners delete bookings"
ON public.bookings
FOR DELETE
TO authenticated
USING (public.is_owner());

-- --------------------------------------------------------------------
-- 4. MESSAGES / ENQUIRIES TABLE SECURITY
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.messages ENABLE ROW LEVEL SECURITY;

-- Grant INSERT privilege on messages table to anon and authenticated roles
GRANT INSERT ON public.messages TO anon, authenticated;

-- Drop conflicting or previous public insert policy names
DROP POLICY IF EXISTS "Public insert message" ON public.messages;
DROP POLICY IF EXISTS "Allow public guest insert on messages" ON public.messages;

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

-- --------------------------------------------------------------------
-- 5. PUBLIC CONTENT TABLES (SERVICES, GALLERY, TESTIMONIALS, SETTINGS)
-- --------------------------------------------------------------------
ALTER TABLE IF EXISTS public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.site_settings ENABLE ROW LEVEL SECURITY;

-- Drop stale policies
DROP POLICY IF EXISTS "Public read services" ON public.services;
DROP POLICY IF EXISTS "Admin write services" ON public.services;
DROP POLICY IF EXISTS "Public read gallery" ON public.gallery;
DROP POLICY IF EXISTS "Admin write gallery" ON public.gallery;
DROP POLICY IF EXISTS "Public read testimonials" ON public.testimonials;
DROP POLICY IF EXISTS "Admin write testimonials" ON public.testimonials;
DROP POLICY IF EXISTS "Public read site_settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admin write site_settings" ON public.site_settings;

-- Public can read published content
CREATE POLICY "Public read services" ON public.services FOR SELECT USING (true);
CREATE POLICY "Public read gallery" ON public.gallery FOR SELECT USING (true);
CREATE POLICY "Public read testimonials" ON public.testimonials FOR SELECT USING (true);
CREATE POLICY "Public read site_settings" ON public.site_settings FOR SELECT USING (true);

-- Admins and owners can manage (INSERT, UPDATE, DELETE) content
CREATE POLICY "Admin write services" ON public.services FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admin write gallery" ON public.gallery FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admin write testimonials" ON public.testimonials FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admin write site_settings" ON public.site_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ====================================================================
-- END OF SECURITY REMEDIATION MIGRATION
-- ====================================================================
