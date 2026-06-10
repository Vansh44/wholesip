-- Per-product storefront card background colour.
-- Stored as a CSS hex string (e.g. '#f4dfe0'); NULL = use the storefront default.
-- Idempotent — safe to run more than once.

ALTER TABLE products ADD COLUMN IF NOT EXISTS card_color TEXT;
