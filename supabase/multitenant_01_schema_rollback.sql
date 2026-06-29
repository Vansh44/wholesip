-- =============================================================
-- MULTI-TENANT — Phase 1a ROLLBACK (undo multitenant_01_schema.sql)
--
-- Reverses the schema foundation: removes store_id from every table,
-- restores the original global unique keys, and drops the stores table.
-- Safe to run while only one store (WholeSip) exists — restoring the
-- global UNIQUE(slug)/UNIQUE(code)/... succeeds because all rows share
-- one store, so the values are still globally unique.
--
-- Idempotent. Apply by hand in the SQL Editor or via MCP.
-- =============================================================

-- 1. Drop store_id from every store-scoped table (CASCADE removes the
--    per-store unique constraints, FK and index that depend on it).
DO $$
DECLARE
  t text;
  store_tables constant text[] := ARRAY[
    'products', 'product_variants', 'categories', 'blogs', 'blog_comments',
    'blog_likes', 'coupons', 'coupon_user_groups', 'card_colors',
    'homepage_sections', 'enquiries', 'product_reviews', 'email_campaigns',
    'email_campaign_recipients', 'user_groups', 'user_group_members',
    'admins', 'users', 'roles'
  ];
BEGIN
  FOREACH t IN ARRAY store_tables LOOP
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS store_id CASCADE', t);
  END LOOP;
END $$;

-- 2. Restore the original global unique keys.
ALTER TABLE public.products    ADD CONSTRAINT products_slug_key       UNIQUE (slug);
ALTER TABLE public.blogs       ADD CONSTRAINT blogs_slug_key          UNIQUE (slug);
ALTER TABLE public.categories  ADD CONSTRAINT categories_slug_key     UNIQUE (slug);
ALTER TABLE public.coupons     ADD CONSTRAINT coupons_code_key        UNIQUE (code);
ALTER TABLE public.user_groups ADD CONSTRAINT user_groups_name_key    UNIQUE (name);
ALTER TABLE public.roles       ADD CONSTRAINT roles_slug_key          UNIQUE (slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_name_lower ON public.roles (lower(name));
ALTER TABLE public.users       ADD CONSTRAINT customers_email_key     UNIQUE (email);
ALTER TABLE public.users       ADD CONSTRAINT customers_phone_key     UNIQUE (phone);

-- 3. Drop the stores table.
DROP TABLE IF EXISTS public.stores;
