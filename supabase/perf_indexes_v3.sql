-- =============================================================
-- Perf indexes v3 — cover the ORDER BY on the two hot, UNCACHED,
-- ever-growing dashboard list queries.
--
-- The storefront reads are wrapped in unstable_cache (5-min), so they hit
-- Postgres at most once per store per window. The dashboard LIST pages are
-- live (per request) and paginate with `count: exact` + an ORDER BY, so an
-- unindexed sort re-sorts the whole tenant slice on every page view. These
-- composites let Postgres return rows already in order (no sort node) and
-- paginate by walking the index.
--
-- On a large existing table you may prefer CREATE INDEX CONCURRENTLY (cannot
-- run inside a transaction) to avoid a write lock; the IF NOT EXISTS form
-- below is fine for small/new stores and for a maintenance window.
-- Idempotent: safe to re-run.
-- =============================================================

-- Dashboard orders list: WHERE store_id = ? ORDER BY created_at DESC (+ exact
-- count), the most-viewed growing table. Only idx_orders_store_id (store_id)
-- existed, so every page load filtered by store then SORTED by created_at.
create index if not exists idx_orders_store_created
  on public.orders (store_id, created_at desc);

-- Dashboard products list: WHERE store_id = ? [+ status/featured/category]
-- ORDER BY sort_order ASC, created_at DESC (+ exact count). No index led with
-- store_id followed by the sort keys, so the list re-sorted every load. This
-- also serves the cached storefront listing (getPublishedProducts) on a
-- cache miss, which sorts the same way.
create index if not exists idx_products_store_sort
  on public.products (store_id, sort_order, created_at desc);

-- ───────────────────────── ROLLBACK ─────────────────────────
-- drop index if exists public.idx_products_store_sort;
-- drop index if exists public.idx_orders_store_created;
