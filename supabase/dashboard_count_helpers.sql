-- =============================================================
-- Supabase migration: dashboard count helpers
-- The Categories and Colours dashboard pages previously fetched
-- EVERY product row just to tally counts in JS (an N+1-style full
-- scan that grows with the catalogue). These RPCs do the GROUP BY
-- in Postgres and return just the per-group counts.
-- Apply by hand in the Supabase SQL Editor. Idempotent.
-- =============================================================

-- Products per category.
CREATE OR REPLACE FUNCTION public.product_counts_by_category()
RETURNS TABLE (category_id UUID, cnt BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT category_id, COUNT(*)::BIGINT
  FROM public.products
  WHERE category_id IS NOT NULL
  GROUP BY category_id;
$$;

-- Products per card colour (normalised to lower-case hex).
CREATE OR REPLACE FUNCTION public.product_counts_by_color()
RETURNS TABLE (card_color TEXT, cnt BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT LOWER(card_color) AS card_color, COUNT(*)::BIGINT
  FROM public.products
  WHERE card_color IS NOT NULL
  GROUP BY LOWER(card_color);
$$;

-- The dashboard runs these under the admin's `authenticated` session and they
-- only expose non-sensitive product counts. Revoke anon; keep authenticated.
REVOKE EXECUTE ON FUNCTION public.product_counts_by_category() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.product_counts_by_color() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_counts_by_category() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.product_counts_by_color() TO authenticated, service_role;
