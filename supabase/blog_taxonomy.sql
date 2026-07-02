-- =============================================================
-- Blog taxonomy: per-store blog categories & tags
--
-- Replaces the hardcoded PREDEFINED_CATEGORIES / PREDEFINED_TAGS lists
-- (lib/blog-config.ts) with store-owned rows. Every store manages its own
-- lists from /dashboard/blogs/settings; blogs keep storing plain names in
-- their text[] columns (blogs.categories / blogs.tags), so rename/delete is
-- propagated by the server actions (app/actions/blog-taxonomy-actions.ts).
--
-- Idempotent: safe to re-run.
-- =============================================================

CREATE TABLE IF NOT EXISTS blog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blog_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One name per store, case-insensitively ("Recipes" == "recipes").
CREATE UNIQUE INDEX IF NOT EXISTS uq_blog_categories_store_name
  ON blog_categories (store_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_blog_tags_store_name
  ON blog_tags (store_id, lower(name));

-- =============================================================
-- Row Level Security
--
-- Reads are PUBLIC: the storefront write editor shows the options to
-- signed-in customers via the anon-cacheable client, and names carry no
-- sensitive data (they appear on published posts anyway). Writes are
-- store-admin only via the store-scoped helper from multitenant_03_rls.sql.
-- =============================================================

ALTER TABLE blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read blog categories" ON blog_categories;
CREATE POLICY "Public can read blog categories"
  ON blog_categories FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admins can insert blog categories" ON blog_categories;
CREATE POLICY "Admins can insert blog categories"
  ON blog_categories FOR INSERT TO public
  WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can update blog categories" ON blog_categories;
CREATE POLICY "Admins can update blog categories"
  ON blog_categories FOR UPDATE TO public
  USING ((SELECT is_store_admin(store_id)))
  WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can delete blog categories" ON blog_categories;
CREATE POLICY "Admins can delete blog categories"
  ON blog_categories FOR DELETE TO public
  USING ((SELECT is_store_admin(store_id)));

DROP POLICY IF EXISTS "Public can read blog tags" ON blog_tags;
CREATE POLICY "Public can read blog tags"
  ON blog_tags FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admins can insert blog tags" ON blog_tags;
CREATE POLICY "Admins can insert blog tags"
  ON blog_tags FOR INSERT TO public
  WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can update blog tags" ON blog_tags;
CREATE POLICY "Admins can update blog tags"
  ON blog_tags FOR UPDATE TO public
  USING ((SELECT is_store_admin(store_id)))
  WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can delete blog tags" ON blog_tags;
CREATE POLICY "Admins can delete blog tags"
  ON blog_tags FOR DELETE TO public
  USING ((SELECT is_store_admin(store_id)));

-- =============================================================
-- Seed: preserve the previously hardcoded lists for EXISTING stores so
-- their editors keep offering the same options after the switch. New
-- stores start empty and define their own taxonomy.
-- =============================================================

INSERT INTO blog_categories (store_id, name)
SELECT s.id, c.name
FROM stores s
CROSS JOIN (VALUES
  ('Nutrition'), ('Recipes'), ('Healthy Living'), ('Community'), ('Research')
) AS c(name)
ON CONFLICT DO NOTHING;

INSERT INTO blog_tags (store_id, name)
SELECT s.id, t.name
FROM stores s
CROSS JOIN (VALUES
  ('Protein'), ('Gut Health'), ('Weight Management'), ('Sleep'), ('Hydration'),
  ('Meal Prep'), ('Mindful Eating'), ('Healthy Habits'), ('Indian Food'), ('Real Food')
) AS t(name)
ON CONFLICT DO NOTHING;
