-- =============================================================
-- Supabase migration: per-variant image galleries
-- Each product variant can have its own set of photos (one or many).
-- The storefront shows the selected variant's gallery, falling back to the
-- product-level gallery when a variant has none.
--   • images      — the variant's gallery (source of truth)
--   • image_url   — kept in sync with images[0] for convenience/back-compat
-- Apply by hand in the Supabase SQL Editor (service key can't run DDL).
-- Idempotent: safe to re-run.
-- =============================================================

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT '{}';

-- Backfill the gallery from any single image already set on a variant.
UPDATE product_variants
  SET images = ARRAY[image_url]
  WHERE image_url IS NOT NULL
    AND image_url <> ''
    AND cardinality(images) = 0;
