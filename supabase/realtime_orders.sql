-- =============================================================
-- Enable Supabase Realtime on the `orders` table.
-- Lets the dashboard reflect new / updated orders live — a shopper placing an
-- order (or a payment/status change) shows up on /dashboard/orders and the
-- overview WITHOUT a manual refresh: the dashboard subscribes to change events
-- and re-fetches when one fires. Mirrors realtime_blogs.sql.
--
-- Run by hand in the Supabase SQL Editor. Idempotent — safe to re-run.
-- Realtime respects RLS, so an admin only receives events for their own store's
-- orders (store admins have FOR ALL on their store's orders — orders_table.sql).
-- =============================================================

-- FULL replica identity lets Realtime evaluate RLS against the *old* row too,
-- so UPDATE and DELETE events are delivered — not just INSERTs.
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- Add the table to Supabase's realtime publication (only if not already in it).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;
