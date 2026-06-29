-- =============================================================
-- MULTI-TENANT — Phase 1b·4b: store-scope the dashboard count RPCs
--
-- These aggregate functions summed across ALL stores. Add a required
-- p_store_id parameter so each dashboard's counts reflect only its store.
-- Signature changes, so DROP + CREATE (not CREATE OR REPLACE).
-- Callers: dashboard categories/colors pages and enquiries subject filter.
-- =============================================================

DROP FUNCTION IF EXISTS public.product_counts_by_category();
CREATE FUNCTION public.product_counts_by_category(p_store_id uuid)
RETURNS TABLE(category_id uuid, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  SELECT category_id, COUNT(*)::BIGINT
  FROM public.products
  WHERE category_id IS NOT NULL AND store_id = p_store_id
  GROUP BY category_id;
$$;

DROP FUNCTION IF EXISTS public.product_counts_by_color();
CREATE FUNCTION public.product_counts_by_color(p_store_id uuid)
RETURNS TABLE(card_color text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  SELECT LOWER(card_color) AS card_color, COUNT(*)::BIGINT
  FROM public.products
  WHERE card_color IS NOT NULL AND store_id = p_store_id
  GROUP BY LOWER(card_color);
$$;

DROP FUNCTION IF EXISTS public.distinct_enquiry_subjects();
CREATE FUNCTION public.distinct_enquiry_subjects(p_store_id uuid)
RETURNS TABLE(subject text)
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  SELECT DISTINCT NULLIF(TRIM(subject), '') AS subject
  FROM public.enquiries
  WHERE store_id = p_store_id;
$$;

GRANT EXECUTE ON FUNCTION public.product_counts_by_category(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.product_counts_by_color(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distinct_enquiry_subjects(uuid) TO anon, authenticated;
