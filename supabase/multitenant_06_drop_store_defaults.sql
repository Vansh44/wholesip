-- =============================================================
-- MULTI-TENANT — Phase 1b·5 (Step 4): drop the store_id column defaults
--
-- Phase 1a gave store_id a DEFAULT of the WholeSip id so existing inserts kept
-- working before the app was store-aware. Now every app insert sets store_id
-- explicitly (Phase 1b·2b) and an audit found NO DB triggers/functions and NO
-- background workers that insert into these tables. So we drop the defaults:
-- a forgotten store_id now fails loudly (NOT NULL violation) instead of
-- silently landing on WholeSip.
--
-- store_id stays NOT NULL + FK; only the DEFAULT is removed. Idempotent.
-- =============================================================
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
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN store_id DROP DEFAULT', t);
  END LOOP;
END $$;
