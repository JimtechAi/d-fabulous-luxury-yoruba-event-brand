-- D'FABULOUS API RATE-LIMIT CLEANUP HARDENING
-- STATUS: PROPOSAL ONLY. DO NOT EXECUTE AGAINST PRODUCTION WITHOUT EXPLICIT APPROVAL.
--
-- Follow-up to 20261110120000_api_rate_limits.sql. That migration is intentionally left unmodified
-- (it may already be applied in some environments); this migration supersedes its cleanup logic.
--
-- Problems corrected:
--   1. consume_rate_limit() ran an UNBOUNDED "DELETE ... WHERE updated_at < now() - 1 day" on ~2% of
--      calls. A large backlog could delete an unlimited number of rows inside a request-path
--      transaction and hold row locks that block concurrent rate-limit upserts.
--   2. No index supported the cleanup predicate (sequential scan on every cleanup).
--   3. Concurrent cleanups could overlap and contend with each other.
--
-- Design:
--   * Index on window_start. window_start only changes when a window resets, so the hot-path counter
--     increments (which change request_count/updated_at) keep eligible for HOT updates, unlike an
--     index on updated_at.
--   * A row is expired for cleanup purposes when window_start is older than 25 hours. The largest
--     window consume_rate_limit() accepts is 24 hours, and a hit on any bucket whose window_start is
--     older than its window resets that window, so such a row can never still be counting.
--   * cleanup_expired_rate_limits(): bounded batches (default 1000 rows, max 5000), a bounded number
--     of batches per call (default 5, max 20), FOR UPDATE SKIP LOCKED so rows currently being
--     upserted are skipped instead of waited on, a non-blocking advisory lock so only one cleanup
--     runs at a time, and a statement timeout.
--   * consume_rate_limit() keeps the exact atomic single-statement INSERT ... ON CONFLICT DO UPDATE.
--     Its opportunistic cleanup is now ~1% of calls, capped at a single batch of 100 rows.
--   * Optional hourly pg_cron job, created ONLY if the pg_cron extension is already installed.
--     This migration never installs extensions.
--   * Privileges: RLS stays enabled with no policies. Both functions are SECURITY DEFINER with a
--     pinned search_path and executable by service_role only (explicit REVOKE from PUBLIC, anon,
--     authenticated, which also removes Supabase default-privilege grants on new functions).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.api_rate_limits') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: public.api_rate_limits does not exist. Apply 20261110120000_api_rate_limits.sql first.';
  END IF;
END
$$;

-- Keep the table locked down exactly as before (idempotent re-assertion, no policies added).
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.api_rate_limits FROM anon;
REVOKE ALL ON TABLE public.api_rate_limits FROM authenticated;

CREATE INDEX IF NOT EXISTS api_rate_limits_window_start_idx
  ON public.api_rate_limits (window_start);

CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits(
  p_batch_size integer DEFAULT 1000,
  p_max_batches integer DEFAULT 5
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '10s'
AS $$
DECLARE
  v_batch_deleted integer;
  v_total_deleted integer := 0;
  v_batch integer := 0;
BEGIN
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 5000
     OR p_max_batches IS NULL OR p_max_batches < 1 OR p_max_batches > 20 THEN
    RAISE EXCEPTION 'Invalid cleanup parameters.' USING ERRCODE = '22023';
  END IF;

  -- Only one cleanup at a time; a concurrent caller simply does nothing.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('dfabulous:api_rate_limits_cleanup')) THEN
    RETURN 0;
  END IF;

  LOOP
    v_batch := v_batch + 1;

    -- SKIP LOCKED: never wait on, or block, a row that a concurrent consume_rate_limit() is using.
    -- Row locks are re-validated against the latest row version, so a bucket whose window was just
    -- reset by a concurrent request no longer matches the predicate and is left alone.
    WITH expired AS (
      SELECT bucket_key
      FROM public.api_rate_limits
      WHERE window_start < pg_catalog.now() - interval '25 hours'
      ORDER BY window_start
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM public.api_rate_limits rl
    USING expired
    WHERE rl.bucket_key = expired.bucket_key;

    GET DIAGNOSTICS v_batch_deleted = ROW_COUNT;
    v_total_deleted := v_total_deleted + v_batch_deleted;

    EXIT WHEN v_batch_deleted < p_batch_size OR v_batch >= p_max_batches;
  END LOOP;

  RETURN v_total_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF p_bucket_key IS NULL OR btrim(p_bucket_key) = '' OR length(p_bucket_key) > 200
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100000
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters.' USING ERRCODE = '22023';
  END IF;

  -- Atomic fixed-window counter: either start a new window or increment the
  -- current one in a single statement (unchanged from the original migration).
  INSERT INTO public.api_rate_limits AS rl (bucket_key, window_start, request_count, updated_at)
  VALUES (p_bucket_key, pg_catalog.now(), 1, pg_catalog.now())
  ON CONFLICT (bucket_key) DO UPDATE
  SET
    window_start = CASE
      WHEN rl.window_start <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
        THEN pg_catalog.now()
      ELSE rl.window_start
    END,
    request_count = CASE
      WHEN rl.window_start <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
        THEN 1
      ELSE rl.request_count + 1
    END,
    updated_at = pg_catalog.now()
  RETURNING rl.request_count <= p_limit INTO v_allowed;

  -- Bounded, non-blocking opportunistic cleanup: ~1% of calls, one batch of at most 100 rows.
  IF pg_catalog.random() < 0.01 THEN
    PERFORM public.cleanup_expired_rate_limits(100, 1);
  END IF;

  RETURN v_allowed;
END;
$$;

-- Only the server-side service role may execute either function.
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_expired_rate_limits(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_rate_limits(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_expired_rate_limits(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limits(integer, integer) TO service_role;

-- Scheduled cleanup, only when pg_cron is already available. No extension is installed here.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'dfabulous-api-rate-limit-cleanup';
    PERFORM cron.schedule(
      'dfabulous-api-rate-limit-cleanup',
      '17 * * * *',
      'SELECT public.cleanup_expired_rate_limits(1000, 5);'
    );
  ELSE
    RAISE NOTICE 'pg_cron is not installed: scheduled rate-limit cleanup skipped. Opportunistic bounded cleanup remains active.';
  END IF;
END
$$;

COMMENT ON FUNCTION public.cleanup_expired_rate_limits(integer, integer) IS
  'Bounded, lock-skipping cleanup of expired api_rate_limits rows. service_role only.';

COMMIT;

-- Verification queries (read-only unless noted; run after applying, in a non-production project first):
--   -- As service_role:
--   SELECT public.consume_rate_limit('verify:test', 2, 60);        -- true
--   SELECT public.consume_rate_limit('verify:test', 2, 60);        -- true
--   SELECT public.consume_rate_limit('verify:test', 2, 60);        -- false (limit reached)
--   SELECT public.cleanup_expired_rate_limits(10, 1);              -- 0 for fresh rows
--   DELETE FROM public.api_rate_limits WHERE bucket_key = 'verify:test';
--   -- Index used for cleanup:
--   EXPLAIN SELECT bucket_key FROM public.api_rate_limits
--     WHERE window_start < now() - interval '25 hours' ORDER BY window_start LIMIT 1000;
--   -- As anon / authenticated, all of these must fail with "permission denied":
--   SELECT * FROM public.api_rate_limits;
--   SELECT public.consume_rate_limit('x', 1, 60);
--   SELECT public.cleanup_expired_rate_limits();
