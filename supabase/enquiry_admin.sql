-- =============================================================
-- Supabase migration: enquiry_admin view + helpers
-- Backs the paginated Enquiries dashboard. The view adds a
-- status_rank so the "new first" sort can be done in SQL (PostgREST
-- can't ORDER BY a CASE expression directly). The RPC returns the
-- small set of distinct subjects for the filter dropdown without
-- pulling every enquiry row into Node.
--
-- Queried via the service-role admin client (bypasses RLS).
-- Apply by hand in the Supabase SQL Editor. Idempotent.
-- =============================================================

CREATE OR REPLACE VIEW public.enquiry_admin
WITH (security_invoker = true)
AS
SELECT
  e.*,
  CASE e.status
    WHEN 'new' THEN 0
    WHEN 'in_progress' THEN 1
    WHEN 'resolved' THEN 2
    WHEN 'archived' THEN 3
    ELSE 4
  END AS status_rank
FROM public.enquiries e;

REVOKE ALL ON public.enquiry_admin FROM anon, authenticated;

-- Distinct, trimmed subjects for the filter dropdown. A NULL row in the result
-- signals that some enquiries have no subject (the "(No subject)" option).
CREATE OR REPLACE FUNCTION public.distinct_enquiry_subjects()
RETURNS TABLE (subject TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT NULLIF(TRIM(subject), '') AS subject
  FROM public.enquiries;
$$;

-- Called server-side via the service-role admin client only.
REVOKE EXECUTE ON FUNCTION public.distinct_enquiry_subjects() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distinct_enquiry_subjects() TO service_role;
