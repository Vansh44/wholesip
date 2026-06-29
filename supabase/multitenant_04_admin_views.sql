-- =============================================================
-- MULTI-TENANT — Phase 1b·4a: expose store_id on the admin views
--
-- enquiry_admin and customer_admin are read by the dashboard via the SERVICE
-- ROLE (RLS bypassed), so the app must filter them by store_id. These views
-- didn't expose store_id; add it (appended last, so CREATE OR REPLACE is legal)
-- so the dashboard loaders can scope by the acting admin's store.
-- Idempotent.
-- =============================================================

CREATE OR REPLACE VIEW public.enquiry_admin AS
  SELECT id, name, email, phone, subject, message, status, created_by,
         created_at, updated_at, subject_detail,
         CASE status
           WHEN 'new' THEN 0
           WHEN 'in_progress' THEN 1
           WHEN 'resolved' THEN 2
           WHEN 'archived' THEN 3
           ELSE 4
         END AS status_rank,
         store_id
  FROM public.enquiries e;

CREATE OR REPLACE VIEW public.customer_admin AS
  SELECT u.id, u.phone, u.email, u.first_name, u.last_name,
         u.created_at, u.updated_at,
         COALESCE(r.cnt, 0::bigint) AS review_count,
         COALESCE(b.cnt, 0::bigint) AS blog_count,
         (COALESCE(r.cnt, 0::bigint) + COALESCE(b.cnt, 0::bigint)) AS activity_count,
         u.store_id
  FROM public.users u
    LEFT JOIN (SELECT product_reviews.user_id, count(*) AS cnt
               FROM public.product_reviews GROUP BY product_reviews.user_id) r
      ON r.user_id = u.id
    LEFT JOIN (SELECT blogs.submitted_by, count(*) AS cnt
               FROM public.blogs WHERE blogs.is_customer_submission GROUP BY blogs.submitted_by) b
      ON b.submitted_by = u.id;
