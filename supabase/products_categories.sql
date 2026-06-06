-- =============================================================
-- Supabase migration: categories + products + product_variants
-- Storefront catalog with admin management and RLS.
-- Mirrors the blogs table conventions (status, RLS by profiles.role).
-- Apply by hand in the Supabase SQL Editor (service key can't run DDL).
-- Idempotent: safe to re-run.
-- =============================================================

-- -------------------------------------------------------------
-- Categories
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT,
  image_url   TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'hidden'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories (slug);
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories (sort_order);

-- -------------------------------------------------------------
-- Products
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  description     TEXT,                               -- plain text (rendered with pre-wrap)
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
  base_price      NUMERIC(10, 2) NOT NULL DEFAULT 0,  -- original / MRP (struck through when discounted)
  selling_price   NUMERIC(10, 2) NOT NULL DEFAULT 0,  -- actual price charged (must be <= base_price)
  image_url       TEXT,                               -- primary image
  images          TEXT[] NOT NULL DEFAULT '{}',       -- gallery
  status          TEXT NOT NULL DEFAULT 'draft',      -- 'draft' | 'published'
  featured        BOOLEAN NOT NULL DEFAULT false,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  seo_title       TEXT,
  seo_description TEXT,
  published_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON products (slug);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_published
  ON products (status, published_at DESC)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_products_featured ON products (featured)
  WHERE featured = true;

-- -------------------------------------------------------------
-- Product variants (per-variant price + stock)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_variants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                          -- e.g. "500ml", "Mango"
  base_price    NUMERIC(10, 2) NOT NULL DEFAULT 0,    -- original / MRP for this variant
  selling_price NUMERIC(10, 2) NOT NULL DEFAULT 0,    -- actual price charged (<= base_price)
  stock       INTEGER NOT NULL DEFAULT 0,
  sku         TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants (product_id);

-- -------------------------------------------------------------
-- Upgrade path: installs created before the price split had a single
-- `price` column. Add the new columns idempotently and backfill from the
-- old column so existing data isn't lost. (No-ops on a fresh install.)
-- -------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS base_price NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'price'
  ) THEN
    UPDATE products
      SET base_price = price, selling_price = price
      WHERE base_price = 0 AND selling_price = 0;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'price'
  ) THEN
    UPDATE product_variants
      SET base_price = price, selling_price = price
      WHERE base_price = 0 AND selling_price = 0;
  END IF;
END $$;

-- Now that any old `price` data has been backfilled into base_price/selling_price,
-- drop the legacy column. No-op on fresh installs (which never had it).
ALTER TABLE products DROP COLUMN IF EXISTS price;
ALTER TABLE product_variants DROP COLUMN IF EXISTS price;

-- -------------------------------------------------------------
-- updated_at triggers
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS categories_updated_at_trigger ON categories;
CREATE TRIGGER categories_updated_at_trigger
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_catalog_updated_at();

DROP TRIGGER IF EXISTS products_updated_at_trigger ON products;
CREATE TRIGGER products_updated_at_trigger
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_catalog_updated_at();

-- =============================================================
-- Row Level Security
-- =============================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an admin? Inlined into each policy below.
-- (No SECURITY DEFINER function to keep this migration self-contained.)

-- ---------- categories ----------
DROP POLICY IF EXISTS "Public can read active categories" ON categories;
CREATE POLICY "Public can read active categories"
  ON categories FOR SELECT
  USING (status = 'active');

DROP POLICY IF EXISTS "Admins can read all categories" ON categories;
CREATE POLICY "Admins can read all categories"
  ON categories FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superadmin', 'member')
  ));

DROP POLICY IF EXISTS "Admins can insert categories" ON categories;
CREATE POLICY "Admins can insert categories"
  ON categories FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superadmin', 'member')
  ));

DROP POLICY IF EXISTS "Admins can update categories" ON categories;
CREATE POLICY "Admins can update categories"
  ON categories FOR UPDATE
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

DROP POLICY IF EXISTS "Admins can delete categories" ON categories;
CREATE POLICY "Admins can delete categories"
  ON categories FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superadmin', 'member')
  ));

-- ---------- products ----------
DROP POLICY IF EXISTS "Public can read published products" ON products;
CREATE POLICY "Public can read published products"
  ON products FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "Admins can read all products" ON products;
CREATE POLICY "Admins can read all products"
  ON products FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superadmin', 'member')
  ));

DROP POLICY IF EXISTS "Admins can insert products" ON products;
CREATE POLICY "Admins can insert products"
  ON products FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superadmin', 'member')
  ));

DROP POLICY IF EXISTS "Admins can update products" ON products;
CREATE POLICY "Admins can update products"
  ON products FOR UPDATE
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

DROP POLICY IF EXISTS "Admins can delete products" ON products;
CREATE POLICY "Admins can delete products"
  ON products FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superadmin', 'member')
  ));

-- ---------- product_variants ----------
-- Public can read variants of published products.
DROP POLICY IF EXISTS "Public can read variants of published products" ON product_variants;
CREATE POLICY "Public can read variants of published products"
  ON product_variants FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM products
    WHERE products.id = product_variants.product_id
      AND products.status = 'published'
  ));

DROP POLICY IF EXISTS "Admins can read all variants" ON product_variants;
CREATE POLICY "Admins can read all variants"
  ON product_variants FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superadmin', 'member')
  ));

DROP POLICY IF EXISTS "Admins can insert variants" ON product_variants;
CREATE POLICY "Admins can insert variants"
  ON product_variants FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superadmin', 'member')
  ));

DROP POLICY IF EXISTS "Admins can update variants" ON product_variants;
CREATE POLICY "Admins can update variants"
  ON product_variants FOR UPDATE
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

DROP POLICY IF EXISTS "Admins can delete variants" ON product_variants;
CREATE POLICY "Admins can delete variants"
  ON product_variants FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superadmin', 'member')
  ));
