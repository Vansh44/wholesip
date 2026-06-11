-- =============================================================
-- Supabase migration: product_reviews (storefront customer reviews)
-- Signed-in customers can post one review per product; everyone can read.
-- Mirrors the customer-authored conventions (own-row RLS via auth.uid()).
-- author_name is denormalised on the row because the customers table is
-- own-row-only under RLS, so a public reader can't join to it for the name.
-- Apply by hand in the Supabase SQL Editor (service key can't run DDL).
-- Idempotent: safe to re-run.
-- =============================================================

CREATE TABLE IF NOT EXISTS product_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  author_name  TEXT NOT NULL DEFAULT '',          -- snapshot of the reviewer's name
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, customer_id)               -- one review per customer per product
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product
  ON product_reviews (product_id, created_at DESC);

-- -------------------------------------------------------------
-- updated_at trigger (reuses the shared catalog function; redefined
-- here so this migration is self-contained)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_reviews_updated_at_trigger ON product_reviews;
CREATE TRIGGER product_reviews_updated_at_trigger
  BEFORE UPDATE ON product_reviews
  FOR EACH ROW EXECUTE FUNCTION update_catalog_updated_at();

-- =============================================================
-- Row Level Security
-- =============================================================
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. logged-out shoppers) can read reviews.
DROP POLICY IF EXISTS "Anyone can read reviews" ON product_reviews;
CREATE POLICY "Anyone can read reviews"
  ON product_reviews FOR SELECT
  USING (true);

-- A signed-in customer may post a review owned by themselves.
DROP POLICY IF EXISTS "Customers can insert own review" ON product_reviews;
CREATE POLICY "Customers can insert own review"
  ON product_reviews FOR INSERT
  WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM customers WHERE customers.id = auth.uid())
  );

-- A customer may edit their own review.
DROP POLICY IF EXISTS "Customers can update own review" ON product_reviews;
CREATE POLICY "Customers can update own review"
  ON product_reviews FOR UPDATE
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- A customer may delete their own review.
DROP POLICY IF EXISTS "Customers can delete own review" ON product_reviews;
CREATE POLICY "Customers can delete own review"
  ON product_reviews FOR DELETE
  USING (customer_id = auth.uid());
