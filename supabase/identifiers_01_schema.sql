-- =============================================================
-- Human-readable business identifiers (store_no / order_no / sku)
-- layered on top of the internal UUID keys. See lib/identifiers.ts for the
-- canonical format + Luhn check digit.
--
-- PHASE 1 of 3 — schema only; every new column is NULLABLE here.
--   02_backfill      populates existing rows
--   03_constraints   adds NOT NULL + UNIQUE once backfill verifies clean
--
-- UUID primary keys, foreign keys, and URL/lookup keys are UNCHANGED — these
-- codes are display + search values only. Idempotent (safe to re-run).
-- =============================================================

-- 1. Global store-number sequence. First store = 1000.
create sequence if not exists public.store_no_seq as integer start with 1000 minvalue 1000;

-- 2. stores.store_no — unique numeric business key (nullable until backfilled).
alter table public.stores add column if not exists store_no integer;

-- 3. orders — per-store running number + persisted display ref (for the
--    dashboard search box; also freezes the label on the row).
alter table public.orders add column if not exists order_no  integer;
alter table public.orders add column if not exists order_ref text;

-- 4. products — per-store product number + a per-product variant counter.
--    products.sku already exists (text, nullable); it becomes the formatted SKU.
alter table public.products add column if not exists sku_no      integer;
alter table public.products add column if not exists variant_seq integer not null default 0;

-- 5. product_variants — per-product variant index (pv.sku already exists).
alter table public.product_variants add column if not exists variant_no integer;

-- 6. Per-store counters for orders + products. Kept in a SEPARATE table that is
--    NOT granted to anon: stores.settings is anon-readable (convention #9) and a
--    live order counter would leak each store's order volume. Only the SECURITY
--    DEFINER allocators below (and service_role) ever touch this table.
create table if not exists public.store_counters (
  store_id    uuid primary key references public.stores(id) on delete cascade,
  order_seq   integer not null default 999,  -- next order   -> 1000
  product_seq integer not null default 0     -- next product -> 1
);
alter table public.store_counters enable row level security;
revoke all on public.store_counters from anon, authenticated;
-- (no RLS policies by design: reached only through the definer RPCs / service role.)

-- 7. Atomic allocators — a single UPDATE … RETURNING under the row lock, the
--    same race-safe pattern as increment_coupon_usage. Each upserts the counter
--    row on first use so a store created before this migration still allocates.
create or replace function public.next_order_no(p_store uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  insert into public.store_counters (store_id) values (p_store)
    on conflict (store_id) do nothing;
  update public.store_counters set order_seq = order_seq + 1
    where store_id = p_store returning order_seq into v;
  return v;
end; $$;

create or replace function public.next_product_no(p_store uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  insert into public.store_counters (store_id) values (p_store)
    on conflict (store_id) do nothing;
  update public.store_counters set product_seq = product_seq + 1
    where store_id = p_store returning product_seq into v;
  return v;
end; $$;

-- Variant numbers are per PRODUCT (…V01, V02, …) and FROZEN once assigned, so a
-- reorder / delete never renumbers a live SKU. Counter lives on products.
create or replace function public.next_variant_no(p_product uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  update public.products set variant_seq = variant_seq + 1
    where id = p_product returning variant_seq into v;
  return v;
end; $$;

grant execute on function public.next_order_no(uuid)   to authenticated, service_role;
grant execute on function public.next_product_no(uuid) to authenticated, service_role;
grant execute on function public.next_variant_no(uuid) to authenticated, service_role;

-- ───────────────────────── ROLLBACK ─────────────────────────
-- drop function if exists public.next_variant_no(uuid);
-- drop function if exists public.next_product_no(uuid);
-- drop function if exists public.next_order_no(uuid);
-- drop table if exists public.store_counters;
-- alter table public.product_variants drop column if exists variant_no;
-- alter table public.products drop column if exists variant_seq;
-- alter table public.products drop column if exists sku_no;
-- alter table public.orders   drop column if exists order_ref;
-- alter table public.orders   drop column if exists order_no;
-- alter table public.stores   drop column if exists store_no;
-- drop sequence if exists public.store_no_seq;
