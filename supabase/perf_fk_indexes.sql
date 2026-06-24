-- =============================================================
-- Performance hygiene from the Supabase performance advisor.
-- Drops a duplicate index left by the customers->users rename, and adds
-- covering indexes for foreign keys that lacked one (faster joins / cascade
-- deletes / lookups by these columns as the data grows).
-- Already applied to the live DB via MCP; kept here so a rebuild reproduces it.
-- Idempotent. Apply by hand in the Supabase SQL Editor.
-- =============================================================

DROP INDEX IF EXISTS public.idx_ugm_customer;

CREATE INDEX IF NOT EXISTS idx_admins_invited_by ON public.admins (invited_by);
CREATE INDEX IF NOT EXISTS idx_blog_comments_user_id ON public.blog_comments (user_id);
CREATE INDEX IF NOT EXISTS idx_blogs_created_by ON public.blogs (created_by);
CREATE INDEX IF NOT EXISTS idx_blogs_updated_by ON public.blogs (updated_by);
CREATE INDEX IF NOT EXISTS idx_coupons_created_by ON public.coupons (created_by);
CREATE INDEX IF NOT EXISTS idx_coupons_updated_by ON public.coupons (updated_by);
CREATE INDEX IF NOT EXISTS idx_enquiries_created_by ON public.enquiries (created_by);
CREATE INDEX IF NOT EXISTS idx_product_reviews_user_id ON public.product_reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_products_created_by ON public.products (created_by);
CREATE INDEX IF NOT EXISTS idx_products_updated_by ON public.products (updated_by);
CREATE INDEX IF NOT EXISTS idx_user_group_members_added_by ON public.user_group_members (added_by);
CREATE INDEX IF NOT EXISTS idx_user_groups_created_by ON public.user_groups (created_by);
