-- D'FABULOUS ARCHIVED BOOKING PURGE
-- REVIEW ONLY. DO NOT EXECUTE without production approval.
--
-- This migration:
--   * does not modify payments.booking_id or any existing payment FK;
--   * never deletes a booking that has a public.payments row;
--   * processes only status='archived' bookings;
--   * uses calendar-month retention with interval '6 months';
--   * writes booking.auto_purged audit records;
--   * schedules the job with Supabase pg_cron instead of Express setInterval().
--
-- It requires the previously approved completed_at/archived_at columns and the
-- existing public.audit_logs table. It intentionally does not create or modify
-- RLS policies on existing tables.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.bookings') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: public.bookings does not exist';
  END IF;

  IF to_regclass('public.payments') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: public.payments does not exist';
  END IF;

  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: public.audit_logs does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookings' AND column_name='status'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookings' AND column_name='archived_at'
  ) THEN
    RAISE EXCEPTION 'Preflight failed: bookings.status and bookings.archived_at are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payments' AND column_name='booking_id'
  ) THEN
    RAISE EXCEPTION 'Preflight failed: payments.booking_id does not exist';
  END IF;
END
$$;

-- Supabase-managed PostgreSQL scheduler. This is a database extension change
-- and must be reviewed before execution in the target project.
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.purge_archived_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  booking_record record;
  purged_count integer := 0;
  purged_at timestamptz;
BEGIN
  FOR booking_record IN
    SELECT id, booking_reference, event_date, archived_at
    FROM public.bookings
    WHERE status = 'archived'
      AND archived_at IS NOT NULL
      AND archived_at <= pg_catalog.now() - interval '6 months'
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Payment preservation is an explicit guard. Because the production FK
      -- is ON DELETE CASCADE, this check must remain immediately before DELETE.
      IF EXISTS (
        SELECT 1
        FROM public.payments
        WHERE booking_id = booking_record.id
      ) THEN
        CONTINUE;
      END IF;

      purged_at := pg_catalog.now();

      DELETE FROM public.bookings
      WHERE id = booking_record.id
        AND status = 'archived'
        AND archived_at IS NOT NULL
        AND archived_at <= pg_catalog.now() - interval '6 months'
        AND NOT EXISTS (
          SELECT 1
          FROM public.payments
          WHERE booking_id = booking_record.id
        );

      IF FOUND THEN
        INSERT INTO public.audit_logs (
          actor_user_id,
          action,
          target_user_id,
          metadata,
          created_at
        ) VALUES (
          NULL,
          'booking.auto_purged',
          NULL,
          pg_catalog.jsonb_build_object(
            'booking_reference', booking_record.booking_reference,
            'event_date', booking_record.event_date,
            'archived_at', booking_record.archived_at,
            'purged_at', purged_at
          ),
          purged_at
        );

        purged_count := purged_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- The block is a per-booking subtransaction: one failure rolls back
      -- only that booking's work and does not stop the remaining candidates.
      RAISE WARNING 'Archived booking purge failed for %: %', booking_record.id, SQLERRM;
    END;
  END LOOP;

  RETURN purged_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_archived_bookings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_archived_bookings() TO service_role;

-- Replace only this named job if it already exists. The schedule is daily at
-- 02:17 UTC and is safe to run repeatedly because only remaining archived rows
-- can match the candidate query.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'dfabulous-archived-booking-purge';

SELECT cron.schedule(
  'dfabulous-archived-booking-purge',
  '17 2 * * *',
  $cron$SELECT public.purge_archived_bookings();$cron$
);

COMMIT;
