-- D'FABULOUS BOOKING REFERENCES
-- Adds database-owned, sequential DF-#### references without changing existing booking IDs.
-- Execute in the hosted Supabase SQL Editor as an authorized database administrator.

ALTER TABLE IF EXISTS public.bookings
  ADD COLUMN IF NOT EXISTS booking_reference text;

CREATE SEQUENCE IF NOT EXISTS public.booking_reference_seq;

CREATE OR REPLACE FUNCTION public.assign_booking_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.booking_reference IS NULL OR btrim(NEW.booking_reference) = '' THEN
    NEW.booking_reference := 'DF-' || lpad(nextval('public.booking_reference_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_booking_reference ON public.bookings;
CREATE TRIGGER trg_assign_booking_reference
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_booking_reference();

WITH numbered_bookings AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC NULLS LAST, id ASC) AS reference_number
  FROM public.bookings
  WHERE booking_reference IS NULL OR btrim(booking_reference) = ''
)
UPDATE public.bookings AS bookings
SET booking_reference = 'DF-' || lpad(numbered_bookings.reference_number::text, 4, '0')
FROM numbered_bookings
WHERE bookings.id = numbered_bookings.id;

DO $$
DECLARE
  maximum_reference integer;
BEGIN
  SELECT COALESCE(MAX((substring(booking_reference FROM 4))::integer), 0)
  INTO maximum_reference
  FROM public.bookings
  WHERE booking_reference ~ '^DF-[0-9]+$';

  IF maximum_reference = 0 THEN
    PERFORM setval('public.booking_reference_seq', 1, false);
  ELSE
    PERFORM setval('public.booking_reference_seq', maximum_reference, true);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_booking_reference_key
  ON public.bookings (booking_reference)
  WHERE booking_reference IS NOT NULL;

-- The trigger may run for public submissions through the server's service role.
-- Grant only sequence usage/read access; this does not grant table write access.
GRANT USAGE, SELECT ON SEQUENCE public.booking_reference_seq TO anon, authenticated, service_role;
