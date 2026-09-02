-- D'FABULOUS BOOKING PHONE NULLABILITY
-- The public booking form treats phone as optional, so the database must accept
-- a booking without a phone number.
-- Execute in the hosted Supabase SQL Editor as an authorized database administrator.

ALTER TABLE IF EXISTS public.bookings
  ALTER COLUMN phone DROP NOT NULL;