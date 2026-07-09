-- =============================================================
-- Write-time generation of identifiers, at the DB layer so NO insert path
-- (checkout placeOrder, product-actions, theme seeding, future code) can create
-- a code-less row. Run AFTER identifiers_03_constraints.sql.
--
-- Permanent SQL formatters mirror lib/identifiers.ts (the client-display
-- authority); both are cross-checked by lib/identifiers.test.ts vectors.
-- =============================================================

create or replace function public.sm_luhn(p_digits text)
returns integer language plpgsql immutable set search_path = '' as $$
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
returns text language sql immutable set search_path = '' as $$
  select 'SKU' || lpad(p_store::text,4,'0') || lpad(p_seq::text,4,'0')
      || public.sm_luhn(lpad(p_store::text,4,'0') || lpad(p_seq::text,4,'0'))::text;
$$;

create or replace function public.sm_variant_sku(p_store int, p_seq int, p_var int)
returns text language sql immutable set search_path = '' as $$
  select 'SKU' || lpad(p_store::text,4,'0') || lpad(p_seq::text,4,'0') || 'V' || lpad(p_var::text,2,'0')
      || public.sm_luhn(lpad(p_store::text,4,'0') || lpad(p_seq::text,4,'0') || lpad(p_var::text,2,'0'))::text;
$$;

create or replace function public.sm_order_ref(p_store int, p_order int)
returns text language sql immutable set search_path = '' as $$
  select 'ORD' || lpad(p_store::text,4,'0') || lpad(p_order::text,4,'0')
      || public.sm_luhn(lpad(p_store::text,4,'0') || lpad(p_order::text,4,'0'))::text;
$$;

-- stores.store_no auto-assigns from the global sequence.
alter table public.stores alter column store_no set default nextval('public.store_no_seq');

-- orders: allocate order_no (per store) + freeze order_ref on insert.
create or replace function public.trg_orders_set_ref()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_store_no int;
begin
  if new.order_no is null then
    new.order_no := public.next_order_no(new.store_id);
  end if;
  select store_no into v_store_no from public.stores where id = new.store_id;
  new.order_ref := public.sm_order_ref(v_store_no, new.order_no);
  return new;
end; $$;
drop trigger if exists orders_set_ref on public.orders;
create trigger orders_set_ref before insert on public.orders
  for each row execute function public.trg_orders_set_ref();

-- products: allocate sku_no (per store) + set sku on insert (system-locked).
create or replace function public.trg_products_set_sku()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_store_no int;
begin
  if new.sku_no is null then
    new.sku_no := public.next_product_no(new.store_id);
  end if;
  select store_no into v_store_no from public.stores where id = new.store_id;
  new.sku := public.sm_sku(v_store_no, new.sku_no);
  return new;
end; $$;
drop trigger if exists products_set_sku on public.products;
create trigger products_set_sku before insert on public.products
  for each row execute function public.trg_products_set_sku();

-- variants: allocate variant_no (per product, frozen) + set sku on insert.
create or replace function public.trg_variants_set_sku()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_store_no int; v_prod_sku_no int;
begin
  if new.variant_no is null then
    new.variant_no := public.next_variant_no(new.product_id);
  end if;
  select s.store_no, p.sku_no into v_store_no, v_prod_sku_no
    from public.products p join public.stores s on s.id = p.store_id
   where p.id = new.product_id;
  new.sku := public.sm_variant_sku(v_store_no, v_prod_sku_no, new.variant_no);
  return new;
end; $$;
drop trigger if exists variants_set_sku on public.product_variants;
create trigger variants_set_sku before insert on public.product_variants
  for each row execute function public.trg_variants_set_sku();

-- ───────────────────────── ROLLBACK ─────────────────────────
-- drop trigger if exists variants_set_sku on public.product_variants;
-- drop trigger if exists products_set_sku on public.products;
-- drop trigger if exists orders_set_ref  on public.orders;
-- drop function if exists public.trg_variants_set_sku();
-- drop function if exists public.trg_products_set_sku();
-- drop function if exists public.trg_orders_set_ref();
-- alter table public.stores alter column store_no drop default;
-- drop function if exists public.sm_order_ref(int, int);
-- drop function if exists public.sm_variant_sku(int, int, int);
-- drop function if exists public.sm_sku(int, int);
-- drop function if exists public.sm_luhn(text);
