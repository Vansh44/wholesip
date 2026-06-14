-- -------------------------------------------------------------
-- Add a per-variant `special_price`: when set (NOT NULL), this is the
-- effective sell price for the variant AND the storefront wraps the variant
-- chip in a "tag" badge to call out the deal. When NULL, the variant prices
-- as normal (base / selling).
--
-- Stored as a NULLABLE numeric so "no special price" is distinct from
-- "special price of ₹0". Clamped to <= base_price at the app layer in
-- product-actions.sanitizeVariants.
-- -------------------------------------------------------------
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS special_price NUMERIC(10, 2);
