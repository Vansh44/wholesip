-- =============================================================
-- Supabase migration: coupons (storefront discount codes)
-- Managed from the dashboard (Marketing → Coupons), applied in the
-- storefront cart. Mirrors the categories/products table conventions
-- (status, updated_at trigger, RLS by admins.role).
-- Apply by hand in the Supabase SQL Editor (service key can't run DDL).
-- Idempotent: safe to re-run.
-- =============================================================

CREATE TABLE IF NOT EXISTS coupons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT NOT NULL UNIQUE,             -- stored uppercased, e.g. "SUMMER25"
  description      TEXT,
  discount_type    TEXT NOT NULL DEFAULT 'percentage', -- 'percentage' | 'fixed'
  discount_value   NUMERIC(10, 2) NOT NULL DEFAULT 0,   -- 25 (%) or 100 (₹)
  min_order_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,   -- 0 = no minimum
  max_uses         INTEGER NOT NULL DEFAULT 0,          -- 0 = unlimited
  used_count       INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'active',      -- 'active' | 'disabled'
  valid_from       TIMESTAMPTZ,                         -- null = no start bound
  valid_until      TIMESTAMPTZ,                         -- null = no end bound
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons (code);
CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons (status);

-- -------------------------------------------------------------
-- updated_at trigger (reuses the shared catalog function from
-- products_categories.sql; redefined here so this file is self-contained)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS coupons_updated_at_trigger ON coupons;
CREATE TRIGGER coupons_updated_at_trigger
  BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION update_catalog_updated_at();

-- =============================================================
-- Row Level Security
-- =============================================================
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- Storefront shoppers (incl. anonymous) may read ACTIVE coupons so the cart
-- can validate a typed code. Date / usage / minimum checks happen in the
-- server action so we can return a specific message. Disabled coupons stay
-- hidden, so they simply read as "invalid".
DROP POLICY IF EXISTS "Public can read active coupons" ON coupons;
CREATE POLICY "Public can read active coupons"
  ON coupons FOR SELECT
  USING (status = 'active');

DROP POLICY IF EXISTS "Admins can read all coupons" ON coupons;
CREATE POLICY "Admins can read all coupons"
  ON coupons FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM admins
    WHERE admins.id = auth.uid()
      AND admins.role IN ('superadmin', 'member')
  ));

DROP POLICY IF EXISTS "Admins can insert coupons" ON coupons;
CREATE POLICY "Admins can insert coupons"
  ON coupons FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM admins
    WHERE admins.id = auth.uid()
      AND admins.role IN ('superadmin', 'member')
  ));

DROP POLICY IF EXISTS "Admins can update coupons" ON coupons;
CREATE POLICY "Admins can update coupons"
  ON coupons FOR UPDATE
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

DROP POLICY IF EXISTS "Admins can delete coupons" ON coupons;
CREATE POLICY "Admins can delete coupons"
  ON coupons FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM admins
    WHERE admins.id = auth.uid()
      AND admins.role IN ('superadmin', 'member')
  ));
