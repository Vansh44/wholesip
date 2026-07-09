-- =============================================================
-- PHASE 3 of 3 — lock the identifiers in. Run AFTER 02_backfill has populated
-- every row (no NULLs; no duplicate (store_id, sku) / (store_id, order_no)).
--
-- Verify first, e.g.:
--   select count(*) from stores           where store_no  is null;   -- expect 0
--   select count(*) from orders           where order_no  is null;   -- expect 0
--   select count(*) from products         where sku       is null;   -- expect 0
--   select count(*) from product_variants where sku       is null;   -- expect 0
-- =============================================================

alter table public.stores           alter column store_no   set not null;
alter table public.orders           alter column order_no   set not null;
alter table public.orders           alter column order_ref  set not null;
alter table public.products         alter column sku_no     set not null;
alter table public.products         alter column sku        set not null;
alter table public.product_variants alter column variant_no set not null;
alter table public.product_variants alter column sku        set not null;

-- Uniqueness: store_no is GLOBALLY unique; order_no + sku are unique PER STORE.
create unique index if not exists stores_store_no_key      on public.stores            (store_no);
create unique index if not exists orders_store_order_no_key on public.orders            (store_id, order_no);
create unique index if not exists products_store_sku_key    on public.products          (store_id, sku);
create unique index if not exists pv_store_sku_key          on public.product_variants  (store_id, sku);

-- ───────────────────────── ROLLBACK ─────────────────────────
-- drop index if exists public.pv_store_sku_key;
-- drop index if exists public.products_store_sku_key;
-- drop index if exists public.orders_store_order_no_key;
-- drop index if exists public.stores_store_no_key;
-- alter table public.product_variants alter column sku drop not null, alter column variant_no drop not null;
-- alter table public.products         alter column sku drop not null, alter column sku_no drop not null;
-- alter table public.orders           alter column order_ref drop not null, alter column order_no drop not null;
-- alter table public.stores           alter column store_no drop not null;
