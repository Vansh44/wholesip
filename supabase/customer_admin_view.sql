-- =============================================================
-- Supabase migration: customer_admin view
-- Backs the dashboard Users list. Pre-aggregates each customer's
-- review + blog-submission counts so the admin list can paginate,
-- search, filter and sort entirely in SQL (via PostgREST) instead
-- of loading every user + every review + every blog into the Node
-- process. Essential once the users table grows large.
--
-- Queried only through the service-role admin client (which bypasses
-- RLS), so it sees all rows. security_invoker keeps it from leaking
-- data to anon/authenticated even if they were ever granted SELECT.
-- Apply by hand in the Supabase SQL Editor. Idempotent.
-- =============================================================

CREATE OR REPLACE VIEW public.customer_admin
WITH (security_invoker = true)
AS
SELECT
  u.id,
  u.phone,
  u.email,
  u.first_name,
  u.last_name,
  u.created_at,
  u.updated_at,
  COALESCE(r.cnt, 0)                      AS review_count,
  COALESCE(b.cnt, 0)                      AS blog_count,
  COALESCE(r.cnt, 0) + COALESCE(b.cnt, 0) AS activity_count
FROM public.users u
LEFT JOIN (
  SELECT user_id, COUNT(*) AS cnt
  FROM public.product_reviews
  GROUP BY user_id
) r ON r.user_id = u.id
LEFT JOIN (
  SELECT submitted_by, COUNT(*) AS cnt
  FROM public.blogs
  WHERE is_customer_submission
  GROUP BY submitted_by
) b ON b.submitted_by = u.id;

-- Belt and braces: this view is for admin (service-role) use only.
REVOKE ALL ON public.customer_admin FROM anon, authenticated;
