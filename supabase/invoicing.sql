-- =============================================================
-- Invoicing & Tax — per-store tax classes, order-level tax capture,
-- and the invoice/billing settings row edited in /dashboard/billing.
--
-- Model (chosen scope): TAX CLASSES PER PRODUCT.
--   * A store defines named tax classes (e.g. "GST 18%", "GST 5%").
--   * Each product may reference one (products.tax_class_id); products
--     without one fall back to the store default (store_billing_settings
--     .default_tax_class_id).
--   * Prices are either tax-EXCLUSIVE (tax added on top) or tax-INCLUSIVE
--     (tax carved out of the listed price) — a store-wide toggle.
--
-- Tax is computed authoritatively server-side in placeOrder (never trusts the
-- client) and snapshotted onto the order + each line, so a later rate change
-- never rewrites historical invoices.
--
-- Apply via the Supabase SQL editor / MCP apply_migration. Idempotent: safe to
-- re-run. Rollback block at the bottom.
-- Conventions: is_store_admin(store_id) RLS helper + update_catalog_updated_at
-- trigger fn (both defined in earlier migrations).
-- =============================================================

-- -------------------------------------------------------------
-- 1. tax_classes — named rate buckets, one set per store.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tax_classes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name       text NOT NULL,
  rate       numeric(6,3) NOT NULL DEFAULT 0,   -- percentage, 0..100
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_classes_rate_range CHECK (rate >= 0 AND rate <= 100)
);

CREATE INDEX IF NOT EXISTS idx_tax_classes_store ON public.tax_classes (store_id);
-- One name per store (case-insensitive), so a store can't have two "GST 18%".
CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_classes_store_name
  ON public.tax_classes (store_id, lower(name));

DROP TRIGGER IF EXISTS tax_classes_updated_at_trigger ON public.tax_classes;
CREATE TRIGGER tax_classes_updated_at_trigger
  BEFORE UPDATE ON public.tax_classes
  FOR EACH ROW EXECUTE FUNCTION update_catalog_updated_at();

-- RLS: public read (the storefront/checkout needs the rate; a tax percentage is
-- not sensitive), store admins manage.
ALTER TABLE public.tax_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read tax_classes" ON public.tax_classes;
CREATE POLICY "Anyone can read tax_classes"
  ON public.tax_classes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Store admins manage tax_classes" ON public.tax_classes;
CREATE POLICY "Store admins manage tax_classes"
  ON public.tax_classes FOR ALL
  USING ((SELECT is_store_admin(store_id)))
  WITH CHECK ((SELECT is_store_admin(store_id)));

-- -------------------------------------------------------------
-- 2. products.tax_class_id — optional per-product class.
--    ON DELETE SET NULL so removing a class doesn't delete products;
--    they simply fall back to the store default.
-- -------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tax_class_id uuid
  REFERENCES public.tax_classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_tax_class ON public.products (tax_class_id);

-- -------------------------------------------------------------
-- 3. Order tax snapshot. orders.tax already exists (total tax);
--    add the presentation flag + per-line tax capture.
-- -------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_class_name text;

-- -------------------------------------------------------------
-- 4. store_billing_settings — one row per store. Tax configuration +
--    the business identity and invoice-template options.
--    NOTE: everything here is content that ends up PRINTED ON THE INVOICE
--    the customer receives (business name/address/GSTIN/logo, tax rates), so
--    it is intentionally public-readable — do NOT store secrets here.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_billing_settings (
  store_id             uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,

  -- tax config
  tax_enabled          boolean NOT NULL DEFAULT false,
  prices_include_tax   boolean NOT NULL DEFAULT false,
  default_tax_class_id uuid REFERENCES public.tax_classes(id) ON DELETE SET NULL,

  -- business identity (shown on invoices)
  business_name        text,
  business_address     text,
  tax_id               text,   -- GSTIN / tax registration number
  contact_email        text,
  contact_phone        text,
  logo_url             text,

  -- invoice template
  invoice_prefix       text NOT NULL DEFAULT 'INV',
  accent_color         text NOT NULL DEFAULT '#111111',
  footer_note          text,
  terms                text,
  template             jsonb NOT NULL DEFAULT '{}'::jsonb,  -- show/hide flags etc.

  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid
);

DROP TRIGGER IF EXISTS store_billing_settings_updated_at_trigger ON public.store_billing_settings;
CREATE TRIGGER store_billing_settings_updated_at_trigger
  BEFORE UPDATE ON public.store_billing_settings
  FOR EACH ROW EXECUTE FUNCTION update_catalog_updated_at();

ALTER TABLE public.store_billing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read store_billing_settings" ON public.store_billing_settings;
CREATE POLICY "Anyone can read store_billing_settings"
  ON public.store_billing_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Store admins manage store_billing_settings" ON public.store_billing_settings;
CREATE POLICY "Store admins manage store_billing_settings"
  ON public.store_billing_settings FOR ALL
  USING ((SELECT is_store_admin(store_id)))
  WITH CHECK ((SELECT is_store_admin(store_id)));

-- =============================================================
-- Rollback:
--   ALTER TABLE public.order_items
--     DROP COLUMN IF EXISTS tax_rate,
--     DROP COLUMN IF EXISTS tax_amount,
--     DROP COLUMN IF EXISTS tax_class_name;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS tax_inclusive;
--   ALTER TABLE public.products DROP COLUMN IF EXISTS tax_class_id;
--   DROP TABLE IF EXISTS public.store_billing_settings CASCADE;
--   DROP TABLE IF EXISTS public.tax_classes CASCADE;
-- =============================================================
