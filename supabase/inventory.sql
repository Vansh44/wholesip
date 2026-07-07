-- =============================================================
-- StoreMink inventory schema additions
--
-- Adds inventory-tracking columns to products & product_variants,
-- creates an append-only stock_movements audit ledger, and applies
-- store-scoped RLS so admins can only read their own store's ledger.
--
-- All writes to stock_movements go through SECURITY DEFINER RPCs
-- (see inventory_rpc.sql), so no INSERT/UPDATE/DELETE policies are
-- needed here.
--
-- Idempotent: safe to re-run.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Products — inventory columns
-- -------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_inventory     bool    NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock               integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold  integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_backorder      bool    NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku                  text;

-- -------------------------------------------------------------
-- 2. Product variants — inventory columns (stock & sku already exist)
-- -------------------------------------------------------------
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS track_inventory     bool    NOT NULL DEFAULT true;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS low_stock_threshold  integer;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS allow_backorder      bool    NOT NULL DEFAULT false;

-- -------------------------------------------------------------
-- 3. Stock movements — append-only audit ledger
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id    uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  delta         integer NOT NULL,
  reason        text NOT NULL,
  balance_after integer NOT NULL,
  order_id      uuid REFERENCES orders(id) ON DELETE SET NULL,
  note          text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------
-- 4. Indexes
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_low_stock       ON products (store_id, stock) WHERE track_inventory;
CREATE INDEX IF NOT EXISTS idx_variants_stock           ON product_variants (store_id, stock);
CREATE INDEX IF NOT EXISTS idx_stock_movements_sku      ON stock_movements (product_id, variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_store    ON stock_movements (store_id, created_at DESC);

-- -------------------------------------------------------------
-- 5. RLS on stock_movements
--    SELECT only — writes go through SECURITY DEFINER RPCs.
-- -------------------------------------------------------------
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store admins can read stock_movements" ON public.stock_movements;
CREATE POLICY "Store admins can read stock_movements" ON public.stock_movements FOR SELECT TO public
  USING ((SELECT is_store_admin(store_id)));
