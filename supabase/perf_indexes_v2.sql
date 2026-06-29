-- =============================================================
-- Supabase migration: performance indexes (round 2)
-- Supports the paginated/searchable dashboard lists and the
-- customer_admin view added for scale. Apply by hand in the
-- Supabase SQL Editor. Idempotent.
-- =============================================================

-- -------------------------------------------------------------
-- Trigram indexes for substring (ILIKE '%term%') search.
-- The customer list + email recipient picker search users by
-- first_name / last_name / email / phone using a LEADING wildcard,
-- which a B-tree can't serve — without these it's a full seq scan
-- on every keystroke. pg_trgm + GIN makes them index scans.
-- -------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_users_first_name_trgm
  ON public.users USING GIN (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_last_name_trgm
  ON public.users USING GIN (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_email_trgm
  ON public.users USING GIN (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_phone_trgm
  ON public.users USING GIN (phone gin_trgm_ops);

-- -------------------------------------------------------------
-- customer_admin view aggregates: the blog-submission count groups
-- blogs by submitted_by filtered to is_customer_submission. A partial
-- composite index lets that GROUP BY use an index-only scan.
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_blogs_customer_submissions
  ON public.blogs (submitted_by)
  WHERE is_customer_submission = true;

-- -------------------------------------------------------------
-- Customer detail view: reviews + blog submissions for one user,
-- newest first. Composite (user_id/submitted_by, created_at DESC)
-- serves both the equality filter AND the sort, no in-memory sort.
-- These supersede the single-column FK indexes, which we drop.
-- -------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_product_reviews_user_id;
CREATE INDEX IF NOT EXISTS idx_product_reviews_user_created
  ON public.product_reviews (user_id, created_at DESC);

DROP INDEX IF EXISTS public.idx_blogs_submitted_by;
CREATE INDEX IF NOT EXISTS idx_blogs_submitted_created
  ON public.blogs (submitted_by, created_at DESC)
  WHERE submitted_by IS NOT NULL;

-- -------------------------------------------------------------
-- Storefront "related posts": blogs.categories is a text[] queried via array
-- overlap (.overlaps()), so it needs a GIN index, not a B-tree. Partial to
-- published rows since that's all the overlap query reads.
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_blogs_categories_gin
  ON public.blogs USING GIN (categories)
  WHERE status = 'published';

-- -------------------------------------------------------------
-- Dashboard list ordering (created_at DESC) on growing tables, so
-- paginated reads use an index instead of sorting the whole table.
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_created_at
  ON public.products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blogs_created_at
  ON public.blogs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupons_created_at
  ON public.coupons (created_at DESC);
