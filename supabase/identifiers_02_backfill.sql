-- =============================================================
-- PHASE 2 of 3 — backfill the identifier columns for EXISTING rows.
-- Run AFTER identifiers_01_schema.sql and BEFORE identifiers_03_constraints.sql.
-- Idempotent given the new columns are still NULL (re-running skips filled rows).
--
-- NOTE: SKUs are system-generated & locked, so this REPLACES any pre-existing
-- manual product/variant SKU with the new canonical format (by design).
-- =============================================================

-- Temporary SQL mirror of lib/identifiers.ts, used ONLY for this backfill and
-- dropped at the end. Cross-checked against the TS test vectors
-- (lib/identifiers.test.ts): sm_luhn('10010001')=5, ('10011000')=6,
-- ('1001000101')=3. New rows are formatted by the app, not by these.
create or replace function public.sm_luhn(p_digits text)
returns integer language plpgsql immutable as $$
declare s int := 0; dbl boolean := true; i int; d int;
begin
  for i in reverse length(p_digits)..1 loop
    d := ascii(substr(p_digits, i, 1)) - 48;
    if d < 0 or d > 9 then continue; end if;
    if dbl then d := d * 2; if d > 9 then d := d - 9; end if; end if;
    s := s + d; dbl := not dbl;
  end loop;
  return (10 - (s % 10)) % 10;
end; $$;

create or replace function public.sm_sku(p_store int, p_seq int)
returns text language sql immutable as $$
  select 'SKU' || lpad(p_store::text,4,'0') || lpad(p_seq::text,4,'0')
      || public.sm_luhn(lpad(p_store::text,4,'0') || lpad(p_seq::text,4,'0'))::text;
$$;

create or replace function public.sm_variant_sku(p_store int, p_seq int, p_var int)
returns text language sql immutable as $$
  select 'SKU' || lpad(p_store::text,4,'0') || lpad(p_seq::text,4,'0') || 'V' || lpad(p_var::text,2,'0')
      || public.sm_luhn(lpad(p_store::text,4,'0') || lpad(p_seq::text,4,'0') || lpad(p_var::text,2,'0'))::text;
$$;

create or replace function public.sm_order_ref(p_store int, p_order int)
returns text language sql immutable as $$
  select 'ORD' || lpad(p_store::text,4,'0') || lpad(p_order::text,4,'0')
      || public.sm_luhn(lpad(p_store::text,4,'0') || lpad(p_order::text,4,'0'))::text;
$$;

-- 1. stores.store_no — oldest store first, from 1000. Then advance the sequence
--    past the highest assigned so future createStore() calls continue the series.
with ordered as (
  select id, (1000 + row_number() over (order by created_at, id) - 1)::int as n
  from public.stores where store_no is null
)
update public.stores s set store_no = o.n from ordered o where s.id = o.id;
select setval('public.store_no_seq',
              (select coalesce(max(store_no), 999) from public.stores), true);

-- 2. products.sku_no + sku — per store, oldest first, from 1.
with ordered as (
  select p.id,
         (row_number() over (partition by p.store_id order by p.created_at, p.id))::int as n,
         s.store_no
  from public.products p join public.stores s on s.id = p.store_id
  where p.sku_no is null
)
update public.products p
   set sku_no = o.n,
       sku    = public.sm_sku(o.store_no, o.n)
  from ordered o where p.id = o.id;

-- 3. product_variants.variant_no + sku — per product, oldest first, from 1;
--    then freeze each product's variant counter at its variant count.
with ordered as (
  select v.id,
         (row_number() over (partition by v.product_id order by v.created_at, v.id))::int as vn,
         s.store_no, p.sku_no
  from public.product_variants v
  join public.products p on p.id = v.product_id
  join public.stores   s on s.id = v.store_id
  where v.variant_no is null
)
update public.product_variants v
   set variant_no = o.vn,
       sku        = public.sm_variant_sku(o.store_no, o.sku_no, o.vn)
  from ordered o where v.id = o.id;

update public.products p
   set variant_seq = c.cnt
  from (select product_id, count(*) cnt from public.product_variants group by product_id) c
 where p.id = c.product_id;

-- 4. orders.order_no + order_ref — per store, oldest first, from 1000.
with ordered as (
  select o.id,
         (999 + row_number() over (partition by o.store_id order by o.created_at, o.id))::int as n,
         s.store_no
  from public.orders o join public.stores s on s.id = o.store_id
  where o.order_no is null
)
update public.orders o
   set order_no  = x.n,
       order_ref = public.sm_order_ref(x.store_no, x.n)
  from ordered x where o.id = x.id;

-- 5. Seed per-store counters to the current maxes so the next allocation
--    continues cleanly.
insert into public.store_counters (store_id, order_seq, product_seq)
select s.id,
       greatest(coalesce((select max(order_no) from public.orders   o where o.store_id = s.id), 999), 999),
       coalesce((select max(sku_no)   from public.products p where p.store_id = s.id), 0)
from public.stores s
on conflict (store_id) do update
  set order_seq   = excluded.order_seq,
      product_seq = excluded.product_seq;

-- Drop the temporary formatting mirror — the app (lib/identifiers.ts) owns
-- formatting for all new rows from here on.
drop function if exists public.sm_order_ref(int, int);
drop function if exists public.sm_variant_sku(int, int, int);
drop function if exists public.sm_sku(int, int);
drop function if exists public.sm_luhn(text);

-- ───────────────────────── ROLLBACK ─────────────────────────
-- update public.orders           set order_no = null, order_ref = null;
-- update public.product_variants set variant_no = null;
-- update public.products         set sku_no = null, sku = null, variant_seq = 0;
-- update public.stores           set store_no = null;
-- delete from public.store_counters;
