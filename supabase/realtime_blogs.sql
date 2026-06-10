-- =============================================================
-- Enable Supabase Realtime on the `blogs` table.
-- Lets the dashboard reflect storefront-driven changes live (e.g. a customer
-- submitting a blog for review) without a manual refresh — the dashboard
-- subscribes to change events and re-fetches when one fires.
--
-- Run by hand in the Supabase SQL Editor. Idempotent — safe to re-run.
-- (Realtime also respects RLS, so each admin only receives events for rows
--  they're allowed to read.)
-- =============================================================

-- FULL replica identity lets Realtime evaluate RLS against the *old* row too,
-- so UPDATE and DELETE events are delivered to admins — not just INSERTs.
ALTER TABLE blogs REPLICA IDENTITY FULL;

-- Add the table to Supabase's realtime publication (only if not already in it).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'blogs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE blogs;
  END IF;
END $$;
