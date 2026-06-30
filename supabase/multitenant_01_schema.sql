-- =============================================================
-- MULTI-TENANT — Phase 1a: schema foundation (storiq.in)
--
-- Turns the single WholeSip install into "Store #1" of a multi-store
-- platform, WITHOUT changing any current behaviour.
--
-- What it does:
--   1. Creates a `stores` table (one row per tenant store).
--   2. Seeds WholeSip as the first store, with a FIXED id.
--   3. Adds a `store_id` column to every store-scoped table, defaulting
--      to the WholeSip id, NOT NULL, FK -> stores(id).
--   4. Converts globally-unique keys (slug/code/email/...) to be unique
--      PER STORE, so a second store can reuse the same slugs later.
--
-- Why it's safe / zero-change:
--   * The DEFAULT on store_id means existing app INSERTs that don't yet
--     pass store_id keep working — every new row lands on WholeSip.
--   * All existing rows are backfilled to WholeSip automatically by the
--     column default, so reads are identical.
--   * RLS and the JWT hook are NOT touched here — real cross-store
--     isolation is turned on in Phase 1b once the app passes store_id
--     explicitly. (At that point we DROP these defaults.)
--
-- Idempotent: re-running is safe (IF NOT EXISTS / DROP IF EXISTS / ON CONFLICT).
-- Apply by hand in the Supabase SQL Editor, or via MCP apply_migration.
-- =============================================================

-- The first store gets a stable, intentional id so it can be used as a
-- column DEFAULT (column defaults can't be subqueries). Phase 1b drops
-- these defaults once the app sends store_id on every write.
--   WholeSip store id = a0000000-0000-4000-8000-000000000001

-- -------------------------------------------------------------
-- 1. stores (tenants)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,                       -- {slug}.storiq.in
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended', 'pending')),
  plan          text NOT NULL DEFAULT 'free',
  custom_domain text UNIQUE,                                -- e.g. shop.acme.com
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb,         -- branding/theme (Phase 3)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Storefront (anon) must read store config to resolve host -> store.
-- Only active stores are publicly visible; the platform owner sees all.
DROP POLICY IF EXISTS "Read stores" ON public.stores;
CREATE POLICY "Read stores" ON public.stores FOR SELECT TO public
  USING (status = 'active' OR (SELECT is_superadmin()));

-- Only the platform owner (superadmin) can create/modify/remove stores.
-- Self-serve signup (Phase 3) will use the service role, which bypasses RLS.
DROP POLICY IF EXISTS "Insert stores" ON public.stores;
CREATE POLICY "Insert stores" ON public.stores FOR INSERT TO public
  WITH CHECK ((SELECT is_superadmin()));
DROP POLICY IF EXISTS "Update stores" ON public.stores;
CREATE POLICY "Update stores" ON public.stores FOR UPDATE TO public
  USING ((SELECT is_superadmin())) WITH CHECK ((SELECT is_superadmin()));
DROP POLICY IF EXISTS "Delete stores" ON public.stores;
CREATE POLICY "Delete stores" ON public.stores FOR DELETE TO public
  USING ((SELECT is_superadmin()));

GRANT SELECT ON public.stores TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.stores TO authenticated;

-- -------------------------------------------------------------
-- 2. Seed WholeSip as Store #1 (must exist before the FK defaults below)
-- -------------------------------------------------------------
INSERT INTO public.stores (id, slug, name, status, plan)
VALUES ('a0000000-0000-4000-8000-000000000001'::uuid,
        'wholesip', 'WholeSip', 'active', 'pro')
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------
-- 3. Add store_id to every store-scoped table.
--    One ALTER does add + backfill (via default) + NOT NULL + FK.
--    A constant-default add is a fast metadata-only change.
-- -------------------------------------------------------------
DO $$
DECLARE
  t text;
  wholesip constant text := 'a0000000-0000-4000-8000-000000000001';
  store_tables constant text[] := ARRAY[
    'products', 'product_variants', 'categories', 'blogs', 'blog_comments',
    'blog_likes', 'coupons', 'coupon_user_groups', 'card_colors',
    'homepage_sections', 'enquiries', 'product_reviews', 'email_campaigns',
    'email_campaign_recipients', 'user_groups', 'user_group_members',
    'admins', 'users', 'roles'
  ];
BEGIN
  FOREACH t IN ARRAY store_tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS store_id uuid '
      || 'NOT NULL DEFAULT %L::uuid REFERENCES public.stores(id) ON DELETE CASCADE',
      t, wholesip
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (store_id)',
      'idx_' || t || '_store_id', t
    );
  END LOOP;
END $$;

-- NOTE: rate_limits is intentionally NOT store-scoped (infra, keyed by IP/identifier).

-- -------------------------------------------------------------
-- 4. Make formerly-global unique keys unique PER STORE, so two stores
--    can both have e.g. a "classic-almond" product slug.
-- -------------------------------------------------------------
-- products.slug
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_slug_key;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_store_slug_key;
ALTER TABLE public.products ADD CONSTRAINT products_store_slug_key UNIQUE (store_id, slug);

-- blogs.slug
ALTER TABLE public.blogs DROP CONSTRAINT IF EXISTS blogs_slug_key;
ALTER TABLE public.blogs DROP CONSTRAINT IF EXISTS blogs_store_slug_key;
ALTER TABLE public.blogs ADD CONSTRAINT blogs_store_slug_key UNIQUE (store_id, slug);

-- categories.slug
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_slug_key;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_store_slug_key;
ALTER TABLE public.categories ADD CONSTRAINT categories_store_slug_key UNIQUE (store_id, slug);

-- coupons.code
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_code_key;
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_store_code_key;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_store_code_key UNIQUE (store_id, code);

-- user_groups.name
ALTER TABLE public.user_groups DROP CONSTRAINT IF EXISTS user_groups_name_key;
ALTER TABLE public.user_groups DROP CONSTRAINT IF EXISTS user_groups_store_name_key;
ALTER TABLE public.user_groups ADD CONSTRAINT user_groups_store_name_key UNIQUE (store_id, name);

-- roles.slug + roles unique-lower(name)
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_slug_key;
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_store_slug_key;
ALTER TABLE public.roles ADD CONSTRAINT roles_store_slug_key UNIQUE (store_id, slug);
DROP INDEX IF EXISTS public.idx_roles_name_lower;
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_store_name_lower
  ON public.roles (store_id, lower(name));

-- users.email + users.phone  (a person can be a customer of multiple stores)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS customers_email_key;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_store_email_key;
ALTER TABLE public.users ADD CONSTRAINT users_store_email_key UNIQUE (store_id, email);
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS customers_phone_key;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_store_phone_key;
ALTER TABLE public.users ADD CONSTRAINT users_store_phone_key UNIQUE (store_id, phone);

-- =============================================================
-- DONE. After this runs, the site behaves exactly as before, but every
-- row belongs to the WholeSip store and a `stores` table exists.
--
-- NEXT (Phase 1b), in order:
--   a. Extend custom_access_token_hook to put admins.store_id in the JWT.
--   b. Add `store_id = <current store>` predicates to RLS policies.
--   c. Thread store_id through lib/storefront/queries.ts + app/actions/*.
--   d. THEN drop the column defaults added above (so a forgotten store_id
--      fails loudly instead of silently writing to WholeSip).
-- =============================================================
