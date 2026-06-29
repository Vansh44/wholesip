-- =============================================================
-- Supabase migration: email campaign queue
-- Coupon email campaigns are sent in the BACKGROUND, not in the
-- request that triggers them — sending to 100k recipients inline
-- would blow past the serverless function timeout. The dashboard
-- action enqueues a campaign + one row per recipient; a worker
-- (app/api/cron/send-emails) drains the queue in batches.
--
-- Touched only by the service-role admin client (bypasses RLS), so
-- RLS is enabled with no client policies.
-- Apply by hand in the Supabase SQL Editor. Idempotent.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject           TEXT NOT NULL,
  body              TEXT NOT NULL,
  code              TEXT NOT NULL,
  discount_label    TEXT NOT NULL,
  valid_until_label TEXT,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | sending | done
  total             INTEGER NOT NULL DEFAULT 0,
  sent              INTEGER NOT NULL DEFAULT 0,
  failed            INTEGER NOT NULL DEFAULT 0,
  skipped_no_email  INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  first_name  TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | sending | sent | failed
  claimed_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index makes "next pending batch" claims fast even with millions of
-- already-sent rows in the table.
CREATE INDEX IF NOT EXISTS idx_ecr_pending
  ON public.email_campaign_recipients (created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ecr_campaign
  ON public.email_campaign_recipients (campaign_id);

-- updated_at trigger (shared catalog function; redefined for self-containment)
CREATE OR REPLACE FUNCTION update_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS email_campaigns_updated_at_trigger ON public.email_campaigns;
CREATE TRIGGER email_campaigns_updated_at_trigger
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_catalog_updated_at();

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
-- No client policies: only the service role touches these tables.

-- -------------------------------------------------------------
-- claim_email_batch(limit) -> rows
-- Atomically claims up to `limit` pending recipients (marking them
-- 'sending') and returns them. FOR UPDATE SKIP LOCKED means two
-- concurrent workers never grab the same rows — so the cron tick and
-- the self-chained drain can run safely at the same time.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_email_batch(p_limit INTEGER)
RETURNS SETOF public.email_campaign_recipients
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.email_campaign_recipients r
  SET status = 'sending', claimed_at = NOW()
  WHERE r.id IN (
    SELECT id FROM public.email_campaign_recipients
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING r.*;
$$;

-- -------------------------------------------------------------
-- requeue_stale_email_recipients(seconds) -> count
-- Recovers recipients stuck in 'sending' (a worker crashed mid-send)
-- back to 'pending' so the next run retries them.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.requeue_stale_email_recipients(
  p_older_than_seconds INTEGER DEFAULT 600
)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH updated AS (
    UPDATE public.email_campaign_recipients
    SET status = 'pending', claimed_at = NULL
    WHERE status = 'sending'
      AND claimed_at < NOW() - make_interval(secs => p_older_than_seconds)
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER FROM updated;
$$;

-- Server-side only (the worker calls these as service_role). Revoke the default
-- PUBLIC EXECUTE so anon/authenticated can't manipulate the email queue.
REVOKE EXECUTE ON FUNCTION public.claim_email_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.requeue_stale_email_recipients(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_stale_email_recipients(integer) TO service_role;
