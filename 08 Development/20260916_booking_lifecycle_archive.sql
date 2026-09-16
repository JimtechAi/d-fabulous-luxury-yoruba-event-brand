-- D'FABULOUS BOOKING LIFECYCLE ARCHIVE FIELDS
-- Proposal only: review and execute separately in production.
-- This migration does not alter payment relationships, existing triggers, or RLS policies.

BEGIN;

ALTER TABLE IF EXISTS public.bookings
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS bookings_archived_at_idx
  ON public.bookings (archived_at)
  WHERE archived_at IS NOT NULL;

COMMIT;
