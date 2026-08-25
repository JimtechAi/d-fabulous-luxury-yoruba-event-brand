-- D'FABULOUS DATE AVAILABILITY
-- Creates owner-managed blocked dates and atomic public booking availability checks.
-- Execute in the hosted Supabase SQL Editor as an authorized database administrator.

CREATE TABLE IF NOT EXISTS public.blocked_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocked_date date NOT NULL UNIQUE,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blocked_dates_blocked_date_idx ON public.blocked_dates (blocked_date);
ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.blocked_dates FROM PUBLIC;
REVOKE ALL ON TABLE public.blocked_dates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.blocked_dates TO authenticated;

DROP POLICY IF EXISTS "Admins read blocked dates" ON public.blocked_dates;
DROP POLICY IF EXISTS "Admins insert blocked dates" ON public.blocked_dates;
DROP POLICY IF EXISTS "Admins update blocked dates" ON public.blocked_dates;
DROP POLICY IF EXISTS "Admins delete blocked dates" ON public.blocked_dates;

CREATE POLICY "Admins read blocked dates" ON public.blocked_dates FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins insert blocked dates" ON public.blocked_dates FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND created_by = auth.uid());
CREATE POLICY "Admins update blocked dates" ON public.blocked_dates FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete blocked dates" ON public.blocked_dates FOR DELETE TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.get_unavailable_dates()
RETURNS TABLE (unavailable_date date)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.event_date
  FROM public.bookings b
  WHERE b.status IN ('pending', 'confirmed')
  UNION
  SELECT d.blocked_date
  FROM public.blocked_dates d;
$$;

CREATE OR REPLACE FUNCTION public.create_booking_if_available(
  p_full_name text,
  p_email text,
  p_phone text,
  p_event_date date,
  p_event_location text,
  p_services_requested text[],
  p_estimated_guest_count integer,
  p_celebration_details text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_event_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Please select a valid future date.' USING ERRCODE = '22007';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_date::text, 0));

  IF EXISTS (SELECT 1 FROM public.blocked_dates WHERE blocked_date = p_event_date)
     OR EXISTS (SELECT 1 FROM public.bookings WHERE event_date = p_event_date AND status IN ('pending', 'confirmed')) THEN
    RAISE EXCEPTION 'This date is no longer available. Please select another date.' USING ERRCODE = '23P01';
  END IF;

  INSERT INTO public.bookings (full_name, email, phone, event_date, event_location, services_requested, estimated_guest_count, celebration_details, status)
  VALUES (p_full_name, p_email, p_phone, p_event_date, p_event_location, p_services_requested, p_estimated_guest_count, p_celebration_details, 'pending')
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unavailable_dates() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_if_available(text, text, text, date, text, text[], integer, text) TO anon, authenticated;
