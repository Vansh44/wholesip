-- =============================================================
-- Card colour palette — managed list of storefront card background
-- shades. Products reference a shade by its hex (stored in
-- products.card_color). Apply by hand in the Supabase SQL Editor.
-- Idempotent: safe to re-run.
-- =============================================================

CREATE TABLE IF NOT EXISTS card_colors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,                    -- shade label, e.g. 'Blush Rose'
  hex         TEXT NOT NULL,                    -- CSS hex, e.g. '#f4dfe0'
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_colors_sort ON card_colors (sort_order);

-- Reuse the catalog updated_at trigger fn (created in products_categories.sql).
DROP TRIGGER IF EXISTS card_colors_updated_at_trigger ON card_colors;
CREATE TRIGGER card_colors_updated_at_trigger
  BEFORE UPDATE ON card_colors
  FOR EACH ROW EXECUTE FUNCTION update_catalog_updated_at();

-- Row Level Security
ALTER TABLE card_colors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read card_colors" ON card_colors;
CREATE POLICY "Anyone can read card_colors"
  ON card_colors FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can insert card_colors" ON card_colors;
CREATE POLICY "Admins can insert card_colors"
  ON card_colors FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM admins
    WHERE admins.id = auth.uid()
      AND admins.role IN ('superadmin', 'member')
  ));

DROP POLICY IF EXISTS "Admins can update card_colors" ON card_colors;
CREATE POLICY "Admins can update card_colors"
  ON card_colors FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM admins
    WHERE admins.id = auth.uid()
      AND admins.role IN ('superadmin', 'member')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM admins
    WHERE admins.id = auth.uid()
      AND admins.role IN ('superadmin', 'member')
  ));

DROP POLICY IF EXISTS "Admins can delete card_colors" ON card_colors;
CREATE POLICY "Admins can delete card_colors"
  ON card_colors FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM admins
    WHERE admins.id = auth.uid()
      AND admins.role IN ('superadmin', 'member')
  ));

-- Optional starter palette (only inserts if the table is empty).
INSERT INTO card_colors (name, hex, sort_order)
SELECT * FROM (VALUES
  ('Blush Rose', '#f4dfe0', 0),
  ('Sky Blue',   '#dce6f1', 1),
  ('Mint Green', '#dcebde', 2),
  ('Soft Butter','#f3e9c8', 3),
  ('Warm Sand',  '#f4f2ee', 4)
) AS seed(name, hex, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM card_colors);
