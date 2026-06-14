-- =============================================================
-- Homepage sections — composable, dashboard-managed homepage blocks.
-- An ordered list of typed, toggleable sections rendered BELOW the
-- hardcoded hero on the storefront homepage. `config` holds the
-- per-type settings (shape varies by `type` — validated in the app
-- layer, see app/actions/homepage-actions.ts).
-- Apply by hand in the Supabase SQL Editor. Idempotent: safe to re-run.
-- =============================================================

CREATE TABLE IF NOT EXISTS homepage_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,                 -- 'featured_products' | 'shop_by_category' | 'promo_banner'
  sort_order  INTEGER NOT NULL DEFAULT 0,    -- render order (ascending)
  enabled     BOOLEAN NOT NULL DEFAULT TRUE, -- hidden from the storefront when false
  config      JSONB NOT NULL DEFAULT '{}'::jsonb, -- per-type settings
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homepage_sections_order ON homepage_sections (sort_order);

-- Reuse the catalog updated_at trigger fn (created in products_categories.sql).
DROP TRIGGER IF EXISTS homepage_sections_updated_at_trigger ON homepage_sections;
CREATE TRIGGER homepage_sections_updated_at_trigger
  BEFORE UPDATE ON homepage_sections
  FOR EACH ROW EXECUTE FUNCTION update_catalog_updated_at();

-- =============================================================
-- Row Level Security — public read, admin write.
-- NOTE: the public read policy exposes disabled rows too, so the
-- storefront query MUST filter `.eq("enabled", true)` itself.
-- =============================================================
ALTER TABLE homepage_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read homepage_sections" ON homepage_sections;
CREATE POLICY "Anyone can read homepage_sections"
  ON homepage_sections FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert homepage_sections" ON homepage_sections;
CREATE POLICY "Admins can insert homepage_sections"
  ON homepage_sections FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superadmin', 'member')
  ));

DROP POLICY IF EXISTS "Admins can update homepage_sections" ON homepage_sections;
CREATE POLICY "Admins can update homepage_sections"
  ON homepage_sections FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superadmin', 'member')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superadmin', 'member')
  ));

DROP POLICY IF EXISTS "Admins can delete homepage_sections" ON homepage_sections;
CREATE POLICY "Admins can delete homepage_sections"
  ON homepage_sections FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superadmin', 'member')
  ));
