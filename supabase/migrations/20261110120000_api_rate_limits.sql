-- D'FABULOUS DURABLE API RATE LIMITING
-- STATUS: PROPOSAL ONLY. DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL.
--
-- Purpose: replace the Express in-memory rate limiter with a durable,
-- multi-instance-safe PostgreSQL counter for the dfabulous-api Edge Function.
--
-- Design notes:
--   * Purely additive: creates one new table and one new function.
--     No existing table, policy, trigger, or function is modified.
--   * The counter update is a single atomic INSERT ... ON CONFLICT DO UPDATE
--     statement, so concurrent requests from multiple Edge Function instances
--     cannot race past the limit.
--   * RLS is enabled with NO policies: anon and authenticated roles have no
--     access path to the table at all. All privileges are revoked; only
--     service_role (which the Edge Function uses server-side) can execute the
--     RPC, and the RPC is SECURITY DEFINER with a pinned search_path.
--   * Bucket keys are "<scope>:<client-ip>" built by the Edge Function from
--     trusted platform headers only (cf-connecting-ip / x-real-ip / the last
--     x-forwarded-for entry appended by the trusted proxy), so callers cannot
--     spoof their rate-limit identity.
--   * Expired rows are pruned opportunistically (~2% of calls) to keep the
--     table small without requiring a scheduled job.

BEGIN;

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.api_rate_limits IS
  'Durable rate-limit buckets for the dfabulous-api Edge Function. Accessed only through public.consume_rate_limit().';

-- Lock the table down completely: RLS on, no policies, no direct grants.
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.api_rate_limits FROM anon;
REVOKE ALL ON TABLE public.api_rate_limits FROM authenticated;

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
  -- current one in a single statement.
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

  -- Opportunistic cleanup of stale buckets (bounded, ~2% of calls).
  IF pg_catalog.random() < 0.02 THEN
    DELETE FROM public.api_rate_limits
    WHERE updated_at < pg_catalog.now() - interval '1 day';
  END IF;

  RETURN v_allowed;
END;
$$;

-- Only the server-side service role may consume rate-limit tokens.
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

COMMIT;

-- Verification queries (read-only, run after applying):
--   SELECT public.consume_rate_limit('verify:test', 2, 60);  -- as service_role: true
--   SELECT public.consume_rate_limit('verify:test', 2, 60);  -- true
--   SELECT public.consume_rate_limit('verify:test', 2, 60);  -- false (limit reached)
--   DELETE FROM public.api_rate_limits WHERE bucket_key = 'verify:test';  -- cleanup
-- As anon/authenticated, both the table and the function must be inaccessible:
--   SELECT * FROM public.api_rate_limits;                    -- permission denied
--   SELECT public.consume_rate_limit('x', 1, 60);            -- permission denied
