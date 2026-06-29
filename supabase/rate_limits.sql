-- =============================================================
-- Supabase migration: server-side rate limiting
-- A shared fixed-window counter that works ACROSS serverless
-- instances (in-memory limiters don't — each Lambda/edge isolate
-- has its own memory). Called only via the service-role admin
-- client from server code, so no RLS read/write policies are
-- needed for clients.
-- Apply by hand in the Supabase SQL Editor. Idempotent.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          TEXT PRIMARY KEY,        -- e.g. "enquiry:1.2.3.4", "upload:<uid>"
  count        INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lets a sweeper prune old rows cheaply (optional housekeeping).
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits (window_start);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role (which bypasses RLS) touches it.

-- -------------------------------------------------------------
-- check_rate_limit(key, max, window_seconds) -> boolean
-- Atomically increments the counter for `key` within a fixed
-- window and returns TRUE if the request is allowed (count <= max).
-- The whole thing is a single upsert, so it is safe under the
-- concurrency of many simultaneous requests hitting the same key.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_max INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now   TIMESTAMPTZ := NOW();
  v_count INTEGER;
BEGIN
  INSERT INTO public.rate_limits AS rl (key, count, window_start)
    VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE
    SET
      -- Reset the counter when the previous window has elapsed,
      -- otherwise increment within the current window.
      count = CASE
        WHEN rl.window_start < v_now - make_interval(secs => p_window_seconds)
          THEN 1
        ELSE rl.count + 1
      END,
      window_start = CASE
        WHEN rl.window_start < v_now - make_interval(secs => p_window_seconds)
          THEN v_now
        ELSE rl.window_start
      END
  RETURNING rl.count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

-- Server-side only: revoke the default PUBLIC EXECUTE so anon/authenticated
-- can't call this mutating function over REST. The server calls it as service_role.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
