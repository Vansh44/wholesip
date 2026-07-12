-- =============================================================
-- Enable Supabase Realtime for the remaining live dashboard surfaces, so they
-- update without a manual refresh (like orders — see realtime_orders.sql).
--
--   products / product_variants  → the Inventory + Products lists reflect stock
--                                  changes the moment a checkout reserves it.
--   enquiries                    → the Enquiries inbox shows new customer
--                                  enquiries as they arrive.
--
-- Run by hand in the Supabase SQL Editor. Idempotent — safe to re-run.
--
-- Realtime respects RLS, so each admin only receives events for their own
-- store. products/product_variants already grant store admins SELECT
-- (multitenant_03_rls.sql "Read products"). `enquiries` was service-role-only,
-- so Realtime couldn't deliver its events to an admin — we add a store-scoped
-- admin SELECT policy below (the same is_store_admin check orders/products use;
-- it exposes nothing an admin can't already see in the dashboard).
-- =============================================================

-- FULL replica identity so Realtime can evaluate RLS against the old row too
-- (UPDATE/DELETE), not just INSERT.
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.product_variants REPLICA IDENTITY FULL;
ALTER TABLE public.enquiries REPLICA IDENTITY FULL;

-- Store admins can read their own store's enquiries directly (needed for the
-- Realtime RLS check; the dashboard itself still reads via the service role).
DROP POLICY IF EXISTS "Admins read store enquiries" ON public.enquiries;
CREATE POLICY "Admins read store enquiries"
  ON public.enquiries FOR SELECT
  TO authenticated
  USING ((SELECT public.is_store_admin(store_id)));

-- Add each table to Supabase's realtime publication (only if not already in it).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'product_variants', 'enquiries'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ───────────────────────── ROLLBACK ─────────────────────────
-- DROP POLICY IF EXISTS "Admins read store enquiries" ON public.enquiries;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.enquiries;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.product_variants;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.products;
