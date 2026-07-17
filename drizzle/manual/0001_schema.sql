-- Phase 5 — FAITHFUL full schema for a fresh Cloud SQL DB (pg_dump --schema-only
-- from the source Postgres). Apply AFTER 0000_compat_setup.sql. This is the
-- reproducible source of truth: 38 functions, 43 tables, 99 COMPLETE RLS
-- policies (incl. is_store_admin WITH CHECK), 21 triggers, indexes. The
-- drizzle-kit baseline can't reproduce these — see README.md. (One line,
-- 'CREATE SCHEMA public;', is stripped: public already exists in Cloud SQL.)

--
-- PostgreSQL database dump
--

\restrict UCCd6Zx4xfMbdtU5UmhzUjIHP87OwI4lSeUuCofJwBRpridEnr8UepSXRjcqzIf

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: add_ai_credits(uuid, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_ai_credits(p_store uuid, p_delta integer, p_kind text, p_ref text, p_note text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_delta <= 0 then
    raise exception 'add_ai_credits: delta must be positive';
  end if;

  begin
    insert into public.ai_credit_ledger (store_id, delta, kind, ref, note)
      values (p_store, p_delta, p_kind, p_ref, p_note);
  exception when unique_violation then
    return false; -- this purchase ref was already credited
  end;

  insert into public.ai_credit_balances (store_id, balance, updated_at)
    values (p_store, p_delta, now())
  on conflict (store_id) do update
    set balance = public.ai_credit_balances.balance + excluded.balance,
        updated_at = now();

  return true;
end; $$;


--
-- Name: adjust_stock(uuid, uuid, uuid, integer, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.adjust_stock(p_store uuid, p_product uuid, p_variant uuid, p_delta integer, p_reason text, p_note text, p_actor uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_new_stock integer;
BEGIN
  IF p_variant IS NOT NULL THEN
    UPDATE public.product_variants
       SET stock = GREATEST(0, stock + p_delta)
     WHERE id = p_variant
       AND store_id = p_store
    RETURNING stock INTO v_new_stock;

    INSERT INTO public.stock_movements
      (store_id, product_id, variant_id, delta, reason, balance_after, note, created_by)
    VALUES
      (p_store, p_product, p_variant, p_delta, p_reason, v_new_stock, p_note, p_actor);
  ELSE
    UPDATE public.products
       SET stock = GREATEST(0, stock + p_delta)
     WHERE id = p_product
       AND store_id = p_store
    RETURNING stock INTO v_new_stock;

    INSERT INTO public.stock_movements
      (store_id, product_id, variant_id, delta, reason, balance_after, note, created_by)
    VALUES
      (p_store, p_product, NULL, p_delta, p_reason, v_new_stock, p_note, p_actor);
  END IF;

  RETURN v_new_stock;
END;
$$;


--
-- Name: check_rate_limit(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_now   TIMESTAMPTZ := NOW();
  v_count INTEGER;
BEGIN
  INSERT INTO public.rate_limits AS rl (key, count, window_start)
    VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE
    SET
      -- Reset the counter when the previous window has elapsed,
      -- otherwise increment within the current window.
      count = CASE
        WHEN rl.window_start < v_now - make_interval(secs => p_window_seconds)
          THEN 1
        ELSE rl.count + 1
      END,
      window_start = CASE
        WHEN rl.window_start < v_now - make_interval(secs => p_window_seconds)
          THEN v_now
        ELSE rl.window_start
      END
  RETURNING rl.count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: email_campaign_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaign_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    email text NOT NULL,
    first_name text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    claimed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id uuid NOT NULL
);


--
-- Name: claim_email_batch(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_email_batch(p_limit integer) RETURNS SETOF public.email_campaign_recipients
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  UPDATE public.email_campaign_recipients r
  SET status = 'sending', claimed_at = NOW()
  WHERE r.id IN (
    SELECT id FROM public.email_campaign_recipients
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING r.*;
$$;


--
-- Name: custom_access_token_hook(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.custom_access_token_hook(event jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  claims jsonb; v_role text; v_force boolean; v_store uuid;
BEGIN
  SELECT role, force_password_reset, store_id INTO v_role, v_force, v_store
  FROM public.admins WHERE id = (event->>'user_id')::uuid;
  IF v_store IS NULL THEN
    SELECT store_id INTO v_store FROM public.users WHERE id = (event->>'user_id')::uuid;
  END IF;
  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', CASE WHEN v_role IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_role) END);
  claims := jsonb_set(claims, '{force_password_reset}', to_jsonb(COALESCE(v_force, false)));
  claims := jsonb_set(claims, '{store_id}', CASE WHEN v_store IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_store) END);
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;


--
-- Name: decrement_coupon_usage(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_coupon_usage(p_code text, p_store_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  UPDATE public.coupons
     SET used_count = GREATEST(used_count - 1, 0)
   WHERE code = p_code
     AND store_id = p_store_id;
END;
$$;


--
-- Name: distinct_enquiry_subjects(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.distinct_enquiry_subjects(p_store_id uuid) RETURNS TABLE(subject text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT DISTINCT NULLIF(TRIM(subject), '') AS subject
  FROM public.enquiries
  WHERE store_id = p_store_id;
$$;


--
-- Name: increment_coupon_usage(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_coupon_usage(p_code text, p_store_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_reserved boolean;
BEGIN
  UPDATE public.coupons
     SET used_count = used_count + 1
   WHERE code = p_code
     AND store_id = p_store_id
     AND status = 'active'
     AND (max_uses = 0 OR used_count < max_uses)
  RETURNING true INTO v_reserved;

  -- No row matched (unknown/disabled coupon, or already at its cap) → not reserved.
  RETURN COALESCE(v_reserved, false);
END;
$$;


--
-- Name: is_platform_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE lower(email) = lower(auth.email()));
$$;


--
-- Name: is_platform_superadmin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_superadmin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE lower(email) = lower(auth.email()) AND role = 'superadmin');
$$;


--
-- Name: is_store_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_store_admin(target_store uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.admins
    WHERE id = auth.uid() AND role = ANY (ARRAY['superadmin', 'member']) AND store_id = target_store
  );
END;
$$;


--
-- Name: is_store_superadmin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_store_superadmin(target_store uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.admins
    WHERE id = auth.uid() AND role = 'superadmin' AND store_id = target_store
  );
END;
$$;


--
-- Name: is_superadmin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_superadmin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE id = auth.uid() AND role = 'superadmin'
  );
END;
$$;


--
-- Name: next_order_no(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_order_no(p_store uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v integer;
begin
  insert into public.store_counters (store_id) values (p_store)
    on conflict (store_id) do nothing;
  update public.store_counters set order_seq = order_seq + 1
    where store_id = p_store returning order_seq into v;
  return v;
end; $$;


--
-- Name: next_product_no(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_product_no(p_store uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v integer;
begin
  insert into public.store_counters (store_id) values (p_store)
    on conflict (store_id) do nothing;
  update public.store_counters set product_seq = product_seq + 1
    where store_id = p_store returning product_seq into v;
  return v;
end; $$;


--
-- Name: next_variant_no(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_variant_no(p_product uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v integer;
begin
  update public.products set variant_seq = variant_seq + 1
    where id = p_product returning variant_seq into v;
  return v;
end; $$;


--
-- Name: product_counts_by_category(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.product_counts_by_category(p_store_id uuid) RETURNS TABLE(category_id uuid, cnt bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT category_id, COUNT(*)::BIGINT
  FROM public.products
  WHERE category_id IS NOT NULL AND store_id = p_store_id
  GROUP BY category_id;
$$;


--
-- Name: product_counts_by_color(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.product_counts_by_color(p_store_id uuid) RETURNS TABLE(card_color text, cnt bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT LOWER(card_color) AS card_color, COUNT(*)::BIGINT
  FROM public.products
  WHERE card_color IS NOT NULL AND store_id = p_store_id
  GROUP BY LOWER(card_color);
$$;


--
-- Name: release_stock(uuid, uuid, uuid, integer, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_stock(p_store uuid, p_product uuid, p_variant uuid, p_qty integer, p_order uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_new_stock integer;
  v_tracked   boolean;
BEGIN
  IF p_variant IS NOT NULL THEN
    SELECT track_inventory INTO v_tracked
      FROM public.product_variants
     WHERE id = p_variant
       AND store_id = p_store;

    IF v_tracked IS NOT TRUE THEN
      RETURN;
    END IF;

    UPDATE public.product_variants
       SET stock = stock + p_qty
     WHERE id = p_variant
       AND store_id = p_store
    RETURNING stock INTO v_new_stock;

    INSERT INTO public.stock_movements
      (store_id, product_id, variant_id, delta, reason, balance_after, order_id)
    VALUES
      (p_store, p_product, p_variant, p_qty, p_reason, v_new_stock, p_order);
  ELSE
    SELECT track_inventory INTO v_tracked
      FROM public.products
     WHERE id = p_product
       AND store_id = p_store;

    IF v_tracked IS NOT TRUE THEN
      RETURN;
    END IF;

    UPDATE public.products
       SET stock = stock + p_qty
     WHERE id = p_product
       AND store_id = p_store
    RETURNING stock INTO v_new_stock;

    INSERT INTO public.stock_movements
      (store_id, product_id, variant_id, delta, reason, balance_after, order_id)
    VALUES
      (p_store, p_product, NULL, p_qty, p_reason, v_new_stock, p_order);
  END IF;
END;
$$;


--
-- Name: requeue_stale_email_recipients(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.requeue_stale_email_recipients(p_older_than_seconds integer DEFAULT 600) RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH updated AS (
    UPDATE public.email_campaign_recipients
    SET status = 'pending', claimed_at = NULL
    WHERE status = 'sending'
      AND claimed_at < NOW() - make_interval(secs => p_older_than_seconds)
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER FROM updated;
$$;


--
-- Name: reserve_stock(uuid, uuid, uuid, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_stock(p_store uuid, p_product uuid, p_variant uuid, p_qty integer, p_order uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_new_stock integer;
  v_reserved  boolean;
  v_tracked   boolean;
BEGIN
  IF p_variant IS NOT NULL THEN
    -- Check if inventory tracking is enabled for this variant.
    SELECT track_inventory INTO v_tracked
      FROM public.product_variants
     WHERE id = p_variant
       AND store_id = p_store;

    IF v_tracked IS NOT TRUE THEN
      -- Untracked variant = infinite stock; nothing to decrement.
      RETURN true;
    END IF;

    UPDATE public.product_variants
       SET stock = stock - p_qty
     WHERE id = p_variant
       AND store_id = p_store
       AND (allow_backorder OR stock >= p_qty)
    RETURNING stock, true INTO v_new_stock, v_reserved;

    IF COALESCE(v_reserved, false) THEN
      INSERT INTO public.stock_movements
        (store_id, product_id, variant_id, delta, reason, balance_after, order_id)
      VALUES
        (p_store, p_product, p_variant, -p_qty, 'sale', v_new_stock, p_order);
    END IF;
  ELSE
    -- Product-level stock.
    SELECT track_inventory INTO v_tracked
      FROM public.products
     WHERE id = p_product
       AND store_id = p_store;

    IF v_tracked IS NOT TRUE THEN
      RETURN true;
    END IF;

    UPDATE public.products
       SET stock = stock - p_qty
     WHERE id = p_product
       AND store_id = p_store
       AND (allow_backorder OR stock >= p_qty)
    RETURNING stock, true INTO v_new_stock, v_reserved;

    IF COALESCE(v_reserved, false) THEN
      INSERT INTO public.stock_movements
        (store_id, product_id, variant_id, delta, reason, balance_after, order_id)
      VALUES
        (p_store, p_product, NULL, -p_qty, 'sale', v_new_stock, p_order);
    END IF;
  END IF;

  RETURN COALESCE(v_reserved, false);
END;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: set_roles_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_roles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: sm_luhn(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sm_luhn(p_digits text) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
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


--
-- Name: sm_order_ref(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sm_order_ref(p_store integer, p_order integer) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select 'ORD' || lpad(p_store::text,4,'0') || lpad(p_order::text,4,'0')
      || public.sm_luhn(lpad(p_store::text,4,'0') || lpad(p_order::text,4,'0'))::text;
$$;


--
-- Name: sm_sku(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sm_sku(p_store integer, p_seq integer) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select 'SKU' || lpad(p_store::text,4,'0') || lpad(p_seq::text,4,'0')
      || public.sm_luhn(lpad(p_store::text,4,'0') || lpad(p_seq::text,4,'0'))::text;
$$;


--
-- Name: sm_variant_sku(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sm_variant_sku(p_store integer, p_seq integer, p_var integer) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select 'SKU' || lpad(p_store::text,4,'0') || lpad(p_seq::text,4,'0') || 'V' || lpad(p_var::text,2,'0')
      || public.sm_luhn(lpad(p_store::text,4,'0') || lpad(p_seq::text,4,'0') || lpad(p_var::text,2,'0'))::text;
$$;


--
-- Name: trg_orders_set_ref(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_orders_set_ref() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_store_no int;
begin
  if new.order_no is null then
    new.order_no := public.next_order_no(new.store_id);
  end if;
  select store_no into v_store_no from public.stores where id = new.store_id;
  new.order_ref := public.sm_order_ref(v_store_no, new.order_no);
  return new;
end; $$;


--
-- Name: trg_products_set_sku(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_products_set_sku() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_store_no int;
begin
  if new.sku_no is null then
    new.sku_no := public.next_product_no(new.store_id);
  end if;
  select store_no into v_store_no from public.stores where id = new.store_id;
  new.sku := public.sm_sku(v_store_no, new.sku_no);
  return new;
end; $$;


--
-- Name: trg_variants_set_sku(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_variants_set_sku() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: try_ai_generation(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.try_ai_generation(p_store uuid, p_period text, p_cap integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v integer;
begin
  insert into public.ai_usage (store_id, period, used) values (p_store, p_period, 0)
    on conflict (store_id, period) do nothing;
  update public.ai_usage set used = used + 1
    where store_id = p_store and period = p_period and used < p_cap
    returning used into v;
  return v is not null;
end; $$;


--
-- Name: try_spend_ai_credit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.try_spend_ai_credit(p_store uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v integer;
begin
  update public.ai_credit_balances
     set balance = balance - 1, updated_at = now()
   where store_id = p_store and balance > 0
  returning balance into v;
  if v is null then
    return false;
  end if;

  insert into public.ai_credit_ledger (store_id, delta, kind, ref, note)
    values (p_store, -1, 'spend', 'ai-generation', null);
  return true;
end; $$;


--
-- Name: update_blogs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_blogs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_catalog_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_catalog_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_customer_addresses_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_customer_addresses_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_customers_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_customers_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_enquiries_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_enquiries_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_orders_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_orders_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admins (
    id uuid NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    force_password_reset boolean DEFAULT true NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_suspended boolean DEFAULT false,
    first_name text DEFAULT ''::text NOT NULL,
    last_name text,
    phone text,
    store_id uuid NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['superadmin'::text, 'member'::text])))
);


--
-- Name: ai_credit_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_credit_balances (
    store_id uuid NOT NULL,
    balance integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_credit_balances_balance_check CHECK ((balance >= 0))
);


--
-- Name: ai_credit_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_credit_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    delta integer NOT NULL,
    kind text NOT NULL,
    ref text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_credit_ledger_kind_check CHECK ((kind = ANY (ARRAY['purchase'::text, 'grant'::text, 'spend'::text])))
);


--
-- Name: ai_credit_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_credit_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    pack_id text NOT NULL,
    credits integer NOT NULL,
    amount_inr integer NOT NULL,
    rzp_order_id text,
    rzp_payment_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_credit_purchases_amount_inr_check CHECK ((amount_inr > 0)),
    CONSTRAINT ai_credit_purchases_credits_check CHECK ((credits > 0)),
    CONSTRAINT ai_credit_purchases_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text])))
);


--
-- Name: ai_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage (
    store_id uuid NOT NULL,
    period text NOT NULL,
    used integer DEFAULT 0 NOT NULL
);


--
-- Name: billing_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_webhook_events (
    event_id text NOT NULL,
    event_type text,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blog_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT blog_categories_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 40)))
);


--
-- Name: blog_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blog_id uuid NOT NULL,
    user_id uuid NOT NULL,
    author_name text DEFAULT ''::text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id uuid NOT NULL,
    CONSTRAINT blog_comments_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)))
);


--
-- Name: blog_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blog_id uuid NOT NULL,
    visitor_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reaction text DEFAULT 'like'::text NOT NULL,
    store_id uuid NOT NULL,
    CONSTRAINT blog_likes_reaction_check CHECK ((reaction = ANY (ARRAY['like'::text, 'love'::text, 'haha'::text, 'wow'::text, 'celebrate'::text])))
);


--
-- Name: blog_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT blog_tags_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 40)))
);


--
-- Name: blogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blogs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    excerpt text,
    content text,
    cover_image_url text,
    author text,
    status text DEFAULT 'draft'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    featured boolean DEFAULT false NOT NULL,
    seo_title text,
    seo_description text,
    reading_time integer,
    created_by uuid,
    updated_by uuid,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    categories text[] DEFAULT '{}'::text[],
    submitted_by uuid,
    is_customer_submission boolean DEFAULT false NOT NULL,
    store_id uuid NOT NULL
);

ALTER TABLE ONLY public.blogs REPLICA IDENTITY FULL;


--
-- Name: card_colors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_colors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    hex text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id uuid NOT NULL
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    image_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id uuid NOT NULL
);


--
-- Name: coupon_user_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupon_user_groups (
    coupon_id uuid NOT NULL,
    group_id uuid NOT NULL,
    store_id uuid NOT NULL
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    description text,
    discount_type text DEFAULT 'percentage'::text NOT NULL,
    discount_value numeric(10,2) DEFAULT 0 NOT NULL,
    min_order_amount numeric(10,2) DEFAULT 0 NOT NULL,
    max_uses integer DEFAULT 0 NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id uuid NOT NULL,
    show_on_storefront boolean DEFAULT false NOT NULL
);


--
-- Name: customer_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    store_id uuid NOT NULL,
    first_name text NOT NULL,
    last_name text,
    email text,
    phone text,
    address_line1 text NOT NULL,
    address_line2 text,
    city text NOT NULL,
    state text NOT NULL,
    postal_code text NOT NULL,
    country text DEFAULT 'India'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    user_id uuid NOT NULL,
    author_name text DEFAULT ''::text NOT NULL,
    rating integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id uuid NOT NULL,
    CONSTRAINT product_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    phone text NOT NULL,
    email text,
    first_name text DEFAULT ''::text NOT NULL,
    last_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id uuid NOT NULL
);


--
-- Name: customer_admin; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.customer_admin AS
 SELECT u.id,
    u.phone,
    u.email,
    u.first_name,
    u.last_name,
    u.created_at,
    u.updated_at,
    COALESCE(r.cnt, (0)::bigint) AS review_count,
    COALESCE(b.cnt, (0)::bigint) AS blog_count,
    (COALESCE(r.cnt, (0)::bigint) + COALESCE(b.cnt, (0)::bigint)) AS activity_count,
    u.store_id
   FROM ((public.users u
     LEFT JOIN ( SELECT product_reviews.user_id,
            count(*) AS cnt
           FROM public.product_reviews
          GROUP BY product_reviews.user_id) r ON ((r.user_id = u.id)))
     LEFT JOIN ( SELECT blogs.submitted_by,
            count(*) AS cnt
           FROM public.blogs
          WHERE blogs.is_customer_submission
          GROUP BY blogs.submitted_by) b ON ((b.submitted_by = u.id)));


--
-- Name: email_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    code text NOT NULL,
    discount_label text NOT NULL,
    valid_until_label text,
    status text DEFAULT 'pending'::text NOT NULL,
    total integer DEFAULT 0 NOT NULL,
    sent integer DEFAULT 0 NOT NULL,
    failed integer DEFAULT 0 NOT NULL,
    skipped_no_email integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id uuid NOT NULL
);


--
-- Name: enquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    subject text,
    message text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    subject_detail text,
    store_id uuid NOT NULL
);

ALTER TABLE ONLY public.enquiries REPLICA IDENTITY FULL;


--
-- Name: enquiry_admin; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.enquiry_admin AS
 SELECT id,
    name,
    email,
    phone,
    subject,
    message,
    status,
    created_by,
    created_at,
    updated_at,
    subject_detail,
        CASE status
            WHEN 'new'::text THEN 0
            WHEN 'in_progress'::text THEN 1
            WHEN 'resolved'::text THEN 2
            WHEN 'archived'::text THEN 3
            ELSE 4
        END AS status_rank,
    store_id
   FROM public.enquiries e;


--
-- Name: homepage_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homepage_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id uuid NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variant_id uuid,
    name text NOT NULL,
    variant_name text,
    price numeric(12,2) DEFAULT 0 NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tax_rate numeric(6,3) DEFAULT 0 NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
    tax_class_name text
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payment_method text DEFAULT 'cash_on_delivery'::text NOT NULL,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    shipping_address jsonb NOT NULL,
    billing_address jsonb,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    tax numeric(12,2) DEFAULT 0 NOT NULL,
    shipping numeric(12,2) DEFAULT 0 NOT NULL,
    discount numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    applied_coupon_code text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stock_status text DEFAULT 'none'::text NOT NULL,
    order_no integer NOT NULL,
    order_ref text NOT NULL,
    tax_inclusive boolean DEFAULT false NOT NULL,
    razorpay_order_id text,
    razorpay_payment_id text,
    CONSTRAINT orders_stock_status_check CHECK ((stock_status = ANY (ARRAY['none'::text, 'reserved'::text, 'released'::text])))
);

ALTER TABLE ONLY public.orders REPLICA IDENTITY FULL;


--
-- Name: plan_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    from_plan text,
    to_plan text NOT NULL,
    source text NOT NULL,
    actor text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plan_events_source_check CHECK ((source = ANY (ARRAY['operator'::text, 'billing'::text, 'system'::text])))
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_admins_role_check CHECK ((role = ANY (ARRAY['superadmin'::text, 'member'::text])))
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    name text NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    sku text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    base_price numeric(10,2) DEFAULT 0 NOT NULL,
    selling_price numeric(10,2) DEFAULT 0 NOT NULL,
    image_url text,
    images text[] DEFAULT '{}'::text[] NOT NULL,
    special_price numeric(10,2),
    store_id uuid NOT NULL,
    track_inventory boolean DEFAULT true NOT NULL,
    low_stock_threshold integer,
    allow_backorder boolean DEFAULT false NOT NULL,
    variant_no integer NOT NULL
);

ALTER TABLE ONLY public.product_variants REPLICA IDENTITY FULL;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    category_id uuid,
    image_url text,
    images text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    seo_title text,
    seo_description text,
    published_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    base_price numeric(10,2) DEFAULT 0 NOT NULL,
    selling_price numeric(10,2) DEFAULT 0 NOT NULL,
    card_color text,
    store_id uuid NOT NULL,
    track_inventory boolean DEFAULT false NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    low_stock_threshold integer,
    allow_backorder boolean DEFAULT false NOT NULL,
    sku text NOT NULL,
    sku_no integer NOT NULL,
    variant_seq integer DEFAULT 0 NOT NULL,
    tax_class_id uuid
);

ALTER TABLE ONLY public.products REPLICA IDENTITY FULL;


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    key text NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: razorpay_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.razorpay_plans (
    plan text NOT NULL,
    period text NOT NULL,
    amount_paise integer NOT NULL,
    rzp_plan_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT razorpay_plans_period_check CHECK ((period = ANY (ARRAY['monthly'::text, 'yearly'::text]))),
    CONSTRAINT razorpay_plans_plan_check CHECK ((plan = ANY (ARRAY['basic'::text, 'pro'::text])))
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    color text DEFAULT 'grey'::text NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id uuid NOT NULL
);


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variant_id uuid,
    delta integer NOT NULL,
    reason text NOT NULL,
    balance_after integer NOT NULL,
    order_id uuid,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: store_billing_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_billing_settings (
    store_id uuid NOT NULL,
    tax_enabled boolean DEFAULT false NOT NULL,
    prices_include_tax boolean DEFAULT false NOT NULL,
    default_tax_class_id uuid,
    business_name text,
    business_address text,
    tax_id text,
    contact_email text,
    contact_phone text,
    logo_url text,
    invoice_prefix text DEFAULT 'INV'::text NOT NULL,
    accent_color text DEFAULT '#111111'::text NOT NULL,
    footer_note text,
    terms text,
    template jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: store_brand_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_brand_profiles (
    store_id uuid NOT NULL,
    content_md text DEFAULT ''::text NOT NULL,
    structured jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: store_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_counters (
    store_id uuid NOT NULL,
    order_seq integer DEFAULT 999 NOT NULL,
    product_seq integer DEFAULT 0 NOT NULL
);


--
-- Name: store_menus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_menus (
    store_id uuid NOT NULL,
    header jsonb DEFAULT '[]'::jsonb NOT NULL,
    footer_groups jsonb DEFAULT '[]'::jsonb NOT NULL,
    footer_legal jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: store_no_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_no_seq
    AS integer
    START WITH 1000
    INCREMENT BY 1
    MINVALUE 1000
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    slug text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    seo_title text DEFAULT ''::text NOT NULL,
    seo_description text DEFAULT ''::text NOT NULL,
    seo_noindex boolean DEFAULT false NOT NULL,
    sections jsonb DEFAULT '[]'::jsonb NOT NULL,
    published_sections jsonb DEFAULT '[]'::jsonb NOT NULL,
    published_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT store_pages_slug_check CHECK (((slug = ''::text) OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))),
    CONSTRAINT store_pages_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);


--
-- Name: store_payment_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_payment_providers (
    store_id uuid NOT NULL,
    provider text DEFAULT 'razorpay'::text NOT NULL,
    key_id text NOT NULL,
    key_secret_enc text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT store_payment_providers_provider_check CHECK ((provider = 'razorpay'::text))
);


--
-- Name: store_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_subscriptions (
    store_id uuid NOT NULL,
    plan text NOT NULL,
    period text NOT NULL,
    rzp_subscription_id text,
    rzp_plan_id text,
    status text DEFAULT 'created'::text NOT NULL,
    current_start timestamp with time zone,
    current_end timestamp with time zone,
    mandate_max_paise integer,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT store_subscriptions_period_check CHECK ((period = ANY (ARRAY['monthly'::text, 'yearly'::text]))),
    CONSTRAINT store_subscriptions_plan_check CHECK ((plan = ANY (ARRAY['basic'::text, 'pro'::text]))),
    CONSTRAINT store_subscriptions_status_check CHECK ((status = ANY (ARRAY['created'::text, 'authenticated'::text, 'active'::text, 'pending'::text, 'halted'::text, 'cancelled'::text, 'completed'::text])))
);


--
-- Name: stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    plan text DEFAULT 'free'::text NOT NULL,
    custom_domain text,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_no integer DEFAULT nextval('public.store_no_seq'::regclass) NOT NULL,
    plan_source text DEFAULT 'comp'::text NOT NULL,
    plan_expires_at timestamp with time zone,
    CONSTRAINT stores_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'basic'::text, 'pro'::text]))),
    CONSTRAINT stores_plan_source_check CHECK ((plan_source = ANY (ARRAY['comp'::text, 'paid'::text, 'trial'::text]))),
    CONSTRAINT stores_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'pending'::text])))
);


--
-- Name: tax_classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    name text NOT NULL,
    rate numeric(6,3) DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tax_classes_rate_range CHECK (((rate >= (0)::numeric) AND (rate <= (100)::numeric)))
);


--
-- Name: user_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_group_members (
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    added_by uuid,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id uuid NOT NULL
);


--
-- Name: user_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT 'blue'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id uuid NOT NULL
);


--
-- Name: ai_credit_balances ai_credit_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_credit_balances
    ADD CONSTRAINT ai_credit_balances_pkey PRIMARY KEY (store_id);


--
-- Name: ai_credit_ledger ai_credit_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_credit_ledger
    ADD CONSTRAINT ai_credit_ledger_pkey PRIMARY KEY (id);


--
-- Name: ai_credit_purchases ai_credit_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_credit_purchases
    ADD CONSTRAINT ai_credit_purchases_pkey PRIMARY KEY (id);


--
-- Name: ai_credit_purchases ai_credit_purchases_rzp_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_credit_purchases
    ADD CONSTRAINT ai_credit_purchases_rzp_order_id_key UNIQUE (rzp_order_id);


--
-- Name: ai_usage ai_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (store_id, period);


--
-- Name: billing_webhook_events billing_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_webhook_events
    ADD CONSTRAINT billing_webhook_events_pkey PRIMARY KEY (event_id);


--
-- Name: blog_categories blog_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_categories
    ADD CONSTRAINT blog_categories_pkey PRIMARY KEY (id);


--
-- Name: blog_comments blog_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_comments
    ADD CONSTRAINT blog_comments_pkey PRIMARY KEY (id);


--
-- Name: blog_likes blog_likes_blog_visitor_reaction_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_likes
    ADD CONSTRAINT blog_likes_blog_visitor_reaction_key UNIQUE (blog_id, visitor_id, reaction);


--
-- Name: blog_likes blog_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_likes
    ADD CONSTRAINT blog_likes_pkey PRIMARY KEY (id);


--
-- Name: blog_tags blog_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_tags
    ADD CONSTRAINT blog_tags_pkey PRIMARY KEY (id);


--
-- Name: blogs blogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blogs
    ADD CONSTRAINT blogs_pkey PRIMARY KEY (id);


--
-- Name: blogs blogs_store_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blogs
    ADD CONSTRAINT blogs_store_slug_key UNIQUE (store_id, slug);


--
-- Name: card_colors card_colors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_colors
    ADD CONSTRAINT card_colors_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_store_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_store_slug_key UNIQUE (store_id, slug);


--
-- Name: coupon_user_groups coupon_user_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_user_groups
    ADD CONSTRAINT coupon_user_groups_pkey PRIMARY KEY (coupon_id, group_id);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_store_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_store_code_key UNIQUE (store_id, code);


--
-- Name: customer_addresses customer_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_pkey PRIMARY KEY (id);


--
-- Name: users customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: email_campaign_recipients email_campaign_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT email_campaign_recipients_pkey PRIMARY KEY (id);


--
-- Name: email_campaigns email_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_pkey PRIMARY KEY (id);


--
-- Name: enquiries enquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enquiries
    ADD CONSTRAINT enquiries_pkey PRIMARY KEY (id);


--
-- Name: homepage_sections homepage_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_sections
    ADD CONSTRAINT homepage_sections_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: plan_events plan_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_events
    ADD CONSTRAINT plan_events_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_email_key UNIQUE (email);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (id);


--
-- Name: product_reviews product_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_pkey PRIMARY KEY (id);


--
-- Name: product_reviews product_reviews_product_id_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_product_id_customer_id_key UNIQUE (product_id, user_id);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_store_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_store_slug_key UNIQUE (store_id, slug);


--
-- Name: admins profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (key);


--
-- Name: razorpay_plans razorpay_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.razorpay_plans
    ADD CONSTRAINT razorpay_plans_pkey PRIMARY KEY (plan, period, amount_paise);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: roles roles_store_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_store_slug_key UNIQUE (store_id, slug);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: store_billing_settings store_billing_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_billing_settings
    ADD CONSTRAINT store_billing_settings_pkey PRIMARY KEY (store_id);


--
-- Name: store_brand_profiles store_brand_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_brand_profiles
    ADD CONSTRAINT store_brand_profiles_pkey PRIMARY KEY (store_id);


--
-- Name: store_counters store_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_counters
    ADD CONSTRAINT store_counters_pkey PRIMARY KEY (store_id);


--
-- Name: store_menus store_menus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_menus
    ADD CONSTRAINT store_menus_pkey PRIMARY KEY (store_id);


--
-- Name: store_pages store_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_pages
    ADD CONSTRAINT store_pages_pkey PRIMARY KEY (id);


--
-- Name: store_pages store_pages_store_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_pages
    ADD CONSTRAINT store_pages_store_id_slug_key UNIQUE (store_id, slug);


--
-- Name: store_payment_providers store_payment_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_payment_providers
    ADD CONSTRAINT store_payment_providers_pkey PRIMARY KEY (store_id);


--
-- Name: store_subscriptions store_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_subscriptions
    ADD CONSTRAINT store_subscriptions_pkey PRIMARY KEY (store_id);


--
-- Name: store_subscriptions store_subscriptions_rzp_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_subscriptions
    ADD CONSTRAINT store_subscriptions_rzp_subscription_id_key UNIQUE (rzp_subscription_id);


--
-- Name: stores stores_custom_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_custom_domain_key UNIQUE (custom_domain);


--
-- Name: stores stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_pkey PRIMARY KEY (id);


--
-- Name: stores stores_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_slug_key UNIQUE (slug);


--
-- Name: tax_classes tax_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_classes
    ADD CONSTRAINT tax_classes_pkey PRIMARY KEY (id);


--
-- Name: user_group_members user_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_group_members
    ADD CONSTRAINT user_group_members_pkey PRIMARY KEY (group_id, user_id);


--
-- Name: user_groups user_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_pkey PRIMARY KEY (id);


--
-- Name: user_groups user_groups_store_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_store_name_key UNIQUE (store_id, name);


--
-- Name: users users_store_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_store_email_key UNIQUE (store_id, email);


--
-- Name: users users_store_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_store_phone_key UNIQUE (store_id, phone);


--
-- Name: ai_credit_ledger_purchase_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_credit_ledger_purchase_ref_idx ON public.ai_credit_ledger USING btree (kind, ref) WHERE (kind = 'purchase'::text);


--
-- Name: ai_credit_ledger_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_credit_ledger_store_idx ON public.ai_credit_ledger USING btree (store_id, created_at DESC);


--
-- Name: ai_credit_purchases_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_credit_purchases_pending_idx ON public.ai_credit_purchases USING btree (created_at) WHERE (status = 'pending'::text);


--
-- Name: ai_credit_purchases_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_credit_purchases_store_idx ON public.ai_credit_purchases USING btree (store_id, created_at DESC);


--
-- Name: idx_admins_invited_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admins_invited_by ON public.admins USING btree (invited_by);


--
-- Name: idx_admins_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admins_store_id ON public.admins USING btree (store_id);


--
-- Name: idx_blog_comments_blog; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_comments_blog ON public.blog_comments USING btree (blog_id, created_at DESC);


--
-- Name: idx_blog_comments_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_comments_store_id ON public.blog_comments USING btree (store_id);


--
-- Name: idx_blog_comments_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_comments_user_id ON public.blog_comments USING btree (user_id);


--
-- Name: idx_blog_likes_blog; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_likes_blog ON public.blog_likes USING btree (blog_id);


--
-- Name: idx_blog_likes_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_likes_store_id ON public.blog_likes USING btree (store_id);


--
-- Name: idx_blogs_categories_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_categories_gin ON public.blogs USING gin (categories) WHERE (status = 'published'::text);


--
-- Name: idx_blogs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_created_at ON public.blogs USING btree (created_at DESC);


--
-- Name: idx_blogs_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_created_by ON public.blogs USING btree (created_by);


--
-- Name: idx_blogs_customer_submissions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_customer_submissions ON public.blogs USING btree (submitted_by) WHERE (is_customer_submission = true);


--
-- Name: idx_blogs_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_featured ON public.blogs USING btree (featured) WHERE (featured = true);


--
-- Name: idx_blogs_pending_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_pending_review ON public.blogs USING btree (status, created_at DESC) WHERE (status = 'pending_review'::text);


--
-- Name: idx_blogs_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_published ON public.blogs USING btree (status, published_at DESC) WHERE (status = 'published'::text);


--
-- Name: idx_blogs_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_slug ON public.blogs USING btree (slug);


--
-- Name: idx_blogs_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_store_id ON public.blogs USING btree (store_id);


--
-- Name: idx_blogs_submitted_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_submitted_created ON public.blogs USING btree (submitted_by, created_at DESC) WHERE (submitted_by IS NOT NULL);


--
-- Name: idx_blogs_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_updated_by ON public.blogs USING btree (updated_by);


--
-- Name: idx_card_colors_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_colors_sort ON public.card_colors USING btree (sort_order);


--
-- Name: idx_card_colors_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_colors_store_id ON public.card_colors USING btree (store_id);


--
-- Name: idx_categories_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_slug ON public.categories USING btree (slug);


--
-- Name: idx_categories_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_sort ON public.categories USING btree (sort_order);


--
-- Name: idx_categories_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_store_id ON public.categories USING btree (store_id);


--
-- Name: idx_coupon_user_groups_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_user_groups_store_id ON public.coupon_user_groups USING btree (store_id);


--
-- Name: idx_coupons_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_code ON public.coupons USING btree (code);


--
-- Name: idx_coupons_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_created_at ON public.coupons USING btree (created_at DESC);


--
-- Name: idx_coupons_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_created_by ON public.coupons USING btree (created_by);


--
-- Name: idx_coupons_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_status ON public.coupons USING btree (status);


--
-- Name: idx_coupons_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_store_id ON public.coupons USING btree (store_id);


--
-- Name: idx_coupons_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_updated_by ON public.coupons USING btree (updated_by);


--
-- Name: idx_cug_coupon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cug_coupon ON public.coupon_user_groups USING btree (coupon_id);


--
-- Name: idx_cug_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cug_group ON public.coupon_user_groups USING btree (group_id);


--
-- Name: idx_customer_addresses_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_addresses_user ON public.customer_addresses USING btree (user_id);


--
-- Name: idx_ecr_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ecr_campaign ON public.email_campaign_recipients USING btree (campaign_id);


--
-- Name: idx_ecr_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ecr_pending ON public.email_campaign_recipients USING btree (created_at) WHERE (status = 'pending'::text);


--
-- Name: idx_email_campaign_recipients_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_recipients_store_id ON public.email_campaign_recipients USING btree (store_id);


--
-- Name: idx_email_campaigns_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaigns_store_id ON public.email_campaigns USING btree (store_id);


--
-- Name: idx_enquiries_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enquiries_created_at ON public.enquiries USING btree (created_at DESC);


--
-- Name: idx_enquiries_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enquiries_created_by ON public.enquiries USING btree (created_by);


--
-- Name: idx_enquiries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enquiries_status ON public.enquiries USING btree (status);


--
-- Name: idx_enquiries_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enquiries_store_id ON public.enquiries USING btree (store_id);


--
-- Name: idx_homepage_sections_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_homepage_sections_order ON public.homepage_sections USING btree (sort_order);


--
-- Name: idx_homepage_sections_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_homepage_sections_store_id ON public.homepage_sections USING btree (store_id);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_orders_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_customer_id ON public.orders USING btree (customer_id);


--
-- Name: idx_orders_store_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_store_created ON public.orders USING btree (store_id, created_at DESC);


--
-- Name: idx_orders_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_store_id ON public.orders USING btree (store_id);


--
-- Name: idx_product_reviews_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_reviews_product ON public.product_reviews USING btree (product_id, created_at DESC);


--
-- Name: idx_product_reviews_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_reviews_store_id ON public.product_reviews USING btree (store_id);


--
-- Name: idx_product_reviews_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_reviews_user_created ON public.product_reviews USING btree (user_id, created_at DESC);


--
-- Name: idx_product_variants_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_variants_store_id ON public.product_variants USING btree (store_id);


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category_id);


--
-- Name: idx_products_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_created_at ON public.products USING btree (created_at DESC);


--
-- Name: idx_products_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_created_by ON public.products USING btree (created_by);


--
-- Name: idx_products_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_featured ON public.products USING btree (featured) WHERE (featured = true);


--
-- Name: idx_products_low_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_low_stock ON public.products USING btree (store_id, stock) WHERE track_inventory;


--
-- Name: idx_products_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_published ON public.products USING btree (status, published_at DESC) WHERE (status = 'published'::text);


--
-- Name: idx_products_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_slug ON public.products USING btree (slug);


--
-- Name: idx_products_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_store_id ON public.products USING btree (store_id);


--
-- Name: idx_products_store_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_store_sort ON public.products USING btree (store_id, sort_order, created_at DESC);


--
-- Name: idx_products_tax_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_tax_class ON public.products USING btree (tax_class_id);


--
-- Name: idx_products_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_updated_by ON public.products USING btree (updated_by);


--
-- Name: idx_rate_limits_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_window ON public.rate_limits USING btree (window_start);


--
-- Name: idx_roles_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_store_id ON public.roles USING btree (store_id);


--
-- Name: idx_roles_store_name_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_roles_store_name_lower ON public.roles USING btree (store_id, lower(name));


--
-- Name: idx_stock_movements_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_sku ON public.stock_movements USING btree (product_id, variant_id, created_at DESC);


--
-- Name: idx_stock_movements_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_store ON public.stock_movements USING btree (store_id, created_at DESC);


--
-- Name: idx_store_pages_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_pages_store ON public.store_pages USING btree (store_id, status);


--
-- Name: idx_tax_classes_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_classes_store ON public.tax_classes USING btree (store_id);


--
-- Name: idx_tax_classes_store_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_tax_classes_store_name ON public.tax_classes USING btree (store_id, lower(name));


--
-- Name: idx_ugm_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugm_group ON public.user_group_members USING btree (group_id);


--
-- Name: idx_ugm_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugm_user ON public.user_group_members USING btree (user_id);


--
-- Name: idx_user_group_members_added_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_group_members_added_by ON public.user_group_members USING btree (added_by);


--
-- Name: idx_user_group_members_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_group_members_store_id ON public.user_group_members USING btree (store_id);


--
-- Name: idx_user_groups_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_groups_created_by ON public.user_groups USING btree (created_by);


--
-- Name: idx_user_groups_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_groups_name ON public.user_groups USING btree (name);


--
-- Name: idx_user_groups_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_groups_store_id ON public.user_groups USING btree (store_id);


--
-- Name: idx_users_email_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email_trgm ON public.users USING gin (email public.gin_trgm_ops);


--
-- Name: idx_users_first_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_first_name_trgm ON public.users USING gin (first_name public.gin_trgm_ops);


--
-- Name: idx_users_last_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_last_name_trgm ON public.users USING gin (last_name public.gin_trgm_ops);


--
-- Name: idx_users_phone_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_phone_trgm ON public.users USING gin (phone public.gin_trgm_ops);


--
-- Name: idx_users_store_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_store_id ON public.users USING btree (store_id);


--
-- Name: idx_variants_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_product ON public.product_variants USING btree (product_id);


--
-- Name: idx_variants_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_stock ON public.product_variants USING btree (store_id, stock);


--
-- Name: orders_pending_payment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_pending_payment_idx ON public.orders USING btree (created_at) WHERE ((payment_method = 'razorpay'::text) AND (payment_status = 'pending'::text));


--
-- Name: orders_razorpay_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_razorpay_order_idx ON public.orders USING btree (razorpay_order_id) WHERE (razorpay_order_id IS NOT NULL);


--
-- Name: orders_store_order_no_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_store_order_no_key ON public.orders USING btree (store_id, order_no);


--
-- Name: plan_events_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_events_store_idx ON public.plan_events USING btree (store_id, created_at DESC);


--
-- Name: products_store_sku_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX products_store_sku_key ON public.products USING btree (store_id, sku);


--
-- Name: pv_store_sku_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pv_store_sku_key ON public.product_variants USING btree (store_id, sku);


--
-- Name: store_subscriptions_rzp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX store_subscriptions_rzp_idx ON public.store_subscriptions USING btree (rzp_subscription_id);


--
-- Name: stores_plan_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stores_plan_expiry_idx ON public.stores USING btree (plan_expires_at) WHERE (plan_expires_at IS NOT NULL);


--
-- Name: stores_store_no_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stores_store_no_key ON public.stores USING btree (store_no);


--
-- Name: uq_blog_categories_store_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_blog_categories_store_name ON public.blog_categories USING btree (store_id, lower(name));


--
-- Name: uq_blog_tags_store_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_blog_tags_store_name ON public.blog_tags USING btree (store_id, lower(name));


--
-- Name: blogs blogs_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER blogs_updated_at_trigger BEFORE UPDATE ON public.blogs FOR EACH ROW EXECUTE FUNCTION public.update_blogs_updated_at();


--
-- Name: card_colors card_colors_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER card_colors_updated_at_trigger BEFORE UPDATE ON public.card_colors FOR EACH ROW EXECUTE FUNCTION public.update_catalog_updated_at();


--
-- Name: categories categories_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER categories_updated_at_trigger BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_catalog_updated_at();


--
-- Name: coupons coupons_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER coupons_updated_at_trigger BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.update_catalog_updated_at();


--
-- Name: customer_addresses customer_addresses_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER customer_addresses_updated_at_trigger BEFORE UPDATE ON public.customer_addresses FOR EACH ROW EXECUTE FUNCTION public.update_customer_addresses_updated_at();


--
-- Name: users customers_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER customers_updated_at_trigger BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_customers_updated_at();


--
-- Name: email_campaigns email_campaigns_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_campaigns_updated_at_trigger BEFORE UPDATE ON public.email_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_catalog_updated_at();


--
-- Name: enquiries enquiries_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enquiries_updated_at_trigger BEFORE UPDATE ON public.enquiries FOR EACH ROW EXECUTE FUNCTION public.update_enquiries_updated_at();


--
-- Name: homepage_sections homepage_sections_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER homepage_sections_updated_at_trigger BEFORE UPDATE ON public.homepage_sections FOR EACH ROW EXECUTE FUNCTION public.update_catalog_updated_at();


--
-- Name: orders orders_set_ref; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_set_ref BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_orders_set_ref();


--
-- Name: orders orders_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_updated_at_trigger BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_orders_updated_at();


--
-- Name: product_reviews product_reviews_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_reviews_updated_at_trigger BEFORE UPDATE ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION public.update_catalog_updated_at();


--
-- Name: products products_set_sku; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_set_sku BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.trg_products_set_sku();


--
-- Name: products products_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_updated_at_trigger BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_catalog_updated_at();


--
-- Name: roles roles_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER roles_updated_at_trigger BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.set_roles_updated_at();


--
-- Name: store_billing_settings store_billing_settings_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER store_billing_settings_updated_at_trigger BEFORE UPDATE ON public.store_billing_settings FOR EACH ROW EXECUTE FUNCTION public.update_catalog_updated_at();


--
-- Name: store_menus store_menus_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER store_menus_updated_at_trigger BEFORE UPDATE ON public.store_menus FOR EACH ROW EXECUTE FUNCTION public.update_catalog_updated_at();


--
-- Name: store_pages store_pages_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER store_pages_updated_at_trigger BEFORE UPDATE ON public.store_pages FOR EACH ROW EXECUTE FUNCTION public.update_catalog_updated_at();


--
-- Name: tax_classes tax_classes_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tax_classes_updated_at_trigger BEFORE UPDATE ON public.tax_classes FOR EACH ROW EXECUTE FUNCTION public.update_catalog_updated_at();


--
-- Name: user_groups user_groups_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_groups_updated_at_trigger BEFORE UPDATE ON public.user_groups FOR EACH ROW EXECUTE FUNCTION public.update_catalog_updated_at();


--
-- Name: product_variants variants_set_sku; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER variants_set_sku BEFORE INSERT ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.trg_variants_set_sku();


--
-- Name: admins admins_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: ai_credit_balances ai_credit_balances_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_credit_balances
    ADD CONSTRAINT ai_credit_balances_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: ai_credit_ledger ai_credit_ledger_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_credit_ledger
    ADD CONSTRAINT ai_credit_ledger_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: ai_credit_purchases ai_credit_purchases_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_credit_purchases
    ADD CONSTRAINT ai_credit_purchases_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: ai_usage ai_usage_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: blog_categories blog_categories_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_categories
    ADD CONSTRAINT blog_categories_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: blog_comments blog_comments_blog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_comments
    ADD CONSTRAINT blog_comments_blog_id_fkey FOREIGN KEY (blog_id) REFERENCES public.blogs(id) ON DELETE CASCADE;


--
-- Name: blog_comments blog_comments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_comments
    ADD CONSTRAINT blog_comments_customer_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: blog_comments blog_comments_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_comments
    ADD CONSTRAINT blog_comments_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: blog_likes blog_likes_blog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_likes
    ADD CONSTRAINT blog_likes_blog_id_fkey FOREIGN KEY (blog_id) REFERENCES public.blogs(id) ON DELETE CASCADE;


--
-- Name: blog_likes blog_likes_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_likes
    ADD CONSTRAINT blog_likes_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: blog_tags blog_tags_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_tags
    ADD CONSTRAINT blog_tags_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: blogs blogs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blogs
    ADD CONSTRAINT blogs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: blogs blogs_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blogs
    ADD CONSTRAINT blogs_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: blogs blogs_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blogs
    ADD CONSTRAINT blogs_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: blogs blogs_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blogs
    ADD CONSTRAINT blogs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: card_colors card_colors_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_colors
    ADD CONSTRAINT card_colors_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: categories categories_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: coupon_user_groups coupon_user_groups_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_user_groups
    ADD CONSTRAINT coupon_user_groups_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE CASCADE;


--
-- Name: coupon_user_groups coupon_user_groups_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_user_groups
    ADD CONSTRAINT coupon_user_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.user_groups(id) ON DELETE CASCADE;


--
-- Name: coupon_user_groups coupon_user_groups_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_user_groups
    ADD CONSTRAINT coupon_user_groups_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: coupons coupons_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: coupons coupons_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: coupons coupons_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: customer_addresses customer_addresses_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: customer_addresses customer_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users customers_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT customers_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: email_campaign_recipients email_campaign_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT email_campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.email_campaigns(id) ON DELETE CASCADE;


--
-- Name: email_campaign_recipients email_campaign_recipients_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT email_campaign_recipients_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: email_campaigns email_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: email_campaigns email_campaigns_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: enquiries enquiries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enquiries
    ADD CONSTRAINT enquiries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: enquiries enquiries_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enquiries
    ADD CONSTRAINT enquiries_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: homepage_sections homepage_sections_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_sections
    ADD CONSTRAINT homepage_sections_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: order_items order_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: orders orders_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: plan_events plan_events_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_events
    ADD CONSTRAINT plan_events_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_customer_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: products products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: products products_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: products products_tax_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tax_class_id_fkey FOREIGN KEY (tax_class_id) REFERENCES public.tax_classes(id) ON DELETE SET NULL;


--
-- Name: products products_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: admins profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: admins profiles_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT profiles_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.admins(id) ON DELETE SET NULL;


--
-- Name: roles roles_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;


--
-- Name: store_billing_settings store_billing_settings_default_tax_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_billing_settings
    ADD CONSTRAINT store_billing_settings_default_tax_class_id_fkey FOREIGN KEY (default_tax_class_id) REFERENCES public.tax_classes(id) ON DELETE SET NULL;


--
-- Name: store_billing_settings store_billing_settings_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_billing_settings
    ADD CONSTRAINT store_billing_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: store_brand_profiles store_brand_profiles_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_brand_profiles
    ADD CONSTRAINT store_brand_profiles_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: store_counters store_counters_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_counters
    ADD CONSTRAINT store_counters_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: store_menus store_menus_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_menus
    ADD CONSTRAINT store_menus_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: store_pages store_pages_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_pages
    ADD CONSTRAINT store_pages_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: store_payment_providers store_payment_providers_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_payment_providers
    ADD CONSTRAINT store_payment_providers_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: store_subscriptions store_subscriptions_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_subscriptions
    ADD CONSTRAINT store_subscriptions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: tax_classes tax_classes_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_classes
    ADD CONSTRAINT tax_classes_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: user_group_members user_group_members_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_group_members
    ADD CONSTRAINT user_group_members_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_group_members user_group_members_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_group_members
    ADD CONSTRAINT user_group_members_customer_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_group_members user_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_group_members
    ADD CONSTRAINT user_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.user_groups(id) ON DELETE CASCADE;


--
-- Name: user_group_members user_group_members_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_group_members
    ADD CONSTRAINT user_group_members_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: user_groups user_groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_groups user_groups_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: users users_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;


--
-- Name: blog_categories Admins can delete blog categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete blog categories" ON public.blog_categories FOR DELETE USING (( SELECT public.is_store_admin(blog_categories.store_id) AS is_store_admin));


--
-- Name: blog_tags Admins can delete blog tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete blog tags" ON public.blog_tags FOR DELETE USING (( SELECT public.is_store_admin(blog_tags.store_id) AS is_store_admin));


--
-- Name: card_colors Admins can delete card_colors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete card_colors" ON public.card_colors FOR DELETE USING (( SELECT public.is_store_admin(card_colors.store_id) AS is_store_admin));


--
-- Name: categories Admins can delete categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete categories" ON public.categories FOR DELETE USING (( SELECT public.is_store_admin(categories.store_id) AS is_store_admin));


--
-- Name: coupons Admins can delete coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete coupons" ON public.coupons FOR DELETE USING (( SELECT public.is_store_admin(coupons.store_id) AS is_store_admin));


--
-- Name: homepage_sections Admins can delete homepage_sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete homepage_sections" ON public.homepage_sections FOR DELETE USING (( SELECT public.is_store_admin(homepage_sections.store_id) AS is_store_admin));


--
-- Name: products Admins can delete products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete products" ON public.products FOR DELETE USING (( SELECT public.is_store_admin(products.store_id) AS is_store_admin));


--
-- Name: product_variants Admins can delete variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete variants" ON public.product_variants FOR DELETE USING (( SELECT public.is_store_admin(product_variants.store_id) AS is_store_admin));


--
-- Name: blog_categories Admins can insert blog categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert blog categories" ON public.blog_categories FOR INSERT WITH CHECK (( SELECT public.is_store_admin(blog_categories.store_id) AS is_store_admin));


--
-- Name: blog_tags Admins can insert blog tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert blog tags" ON public.blog_tags FOR INSERT WITH CHECK (( SELECT public.is_store_admin(blog_tags.store_id) AS is_store_admin));


--
-- Name: card_colors Admins can insert card_colors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert card_colors" ON public.card_colors FOR INSERT WITH CHECK (( SELECT public.is_store_admin(card_colors.store_id) AS is_store_admin));


--
-- Name: categories Admins can insert categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert categories" ON public.categories FOR INSERT WITH CHECK (( SELECT public.is_store_admin(categories.store_id) AS is_store_admin));


--
-- Name: coupons Admins can insert coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert coupons" ON public.coupons FOR INSERT WITH CHECK (( SELECT public.is_store_admin(coupons.store_id) AS is_store_admin));


--
-- Name: homepage_sections Admins can insert homepage_sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert homepage_sections" ON public.homepage_sections FOR INSERT WITH CHECK (( SELECT public.is_store_admin(homepage_sections.store_id) AS is_store_admin));


--
-- Name: products Admins can insert products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert products" ON public.products FOR INSERT WITH CHECK (( SELECT public.is_store_admin(products.store_id) AS is_store_admin));


--
-- Name: product_variants Admins can insert variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert variants" ON public.product_variants FOR INSERT WITH CHECK (( SELECT public.is_store_admin(product_variants.store_id) AS is_store_admin));


--
-- Name: user_groups Admins can read user_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read user_groups" ON public.user_groups FOR SELECT USING (( SELECT public.is_store_admin(user_groups.store_id) AS is_store_admin));


--
-- Name: blog_categories Admins can update blog categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update blog categories" ON public.blog_categories FOR UPDATE USING (( SELECT public.is_store_admin(blog_categories.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(blog_categories.store_id) AS is_store_admin));


--
-- Name: blog_tags Admins can update blog tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update blog tags" ON public.blog_tags FOR UPDATE USING (( SELECT public.is_store_admin(blog_tags.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(blog_tags.store_id) AS is_store_admin));


--
-- Name: card_colors Admins can update card_colors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update card_colors" ON public.card_colors FOR UPDATE USING (( SELECT public.is_store_admin(card_colors.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(card_colors.store_id) AS is_store_admin));


--
-- Name: categories Admins can update categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update categories" ON public.categories FOR UPDATE USING (( SELECT public.is_store_admin(categories.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(categories.store_id) AS is_store_admin));


--
-- Name: coupons Admins can update coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update coupons" ON public.coupons FOR UPDATE USING (( SELECT public.is_store_admin(coupons.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(coupons.store_id) AS is_store_admin));


--
-- Name: homepage_sections Admins can update homepage_sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update homepage_sections" ON public.homepage_sections FOR UPDATE USING (( SELECT public.is_store_admin(homepage_sections.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(homepage_sections.store_id) AS is_store_admin));


--
-- Name: products Admins can update products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update products" ON public.products FOR UPDATE USING (( SELECT public.is_store_admin(products.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(products.store_id) AS is_store_admin));


--
-- Name: product_variants Admins can update variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update variants" ON public.product_variants FOR UPDATE USING (( SELECT public.is_store_admin(product_variants.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(product_variants.store_id) AS is_store_admin));


--
-- Name: order_items Admins can view and manage store order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view and manage store order items" ON public.order_items TO authenticated USING ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE (orders.store_id IN ( SELECT admins.store_id
           FROM public.admins
          WHERE (admins.id = auth.uid()))))));


--
-- Name: orders Admins can view and manage store orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view and manage store orders" ON public.orders TO authenticated USING ((store_id IN ( SELECT admins.store_id
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: coupon_user_groups Admins delete coupon group links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete coupon group links" ON public.coupon_user_groups FOR DELETE USING (( SELECT public.is_store_admin(coupon_user_groups.store_id) AS is_store_admin));


--
-- Name: user_group_members Admins delete memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete memberships" ON public.user_group_members FOR DELETE USING (( SELECT public.is_store_admin(user_group_members.store_id) AS is_store_admin));


--
-- Name: store_pages Admins delete store_pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete store_pages" ON public.store_pages FOR DELETE USING (( SELECT public.is_store_admin(store_pages.store_id) AS is_store_admin));


--
-- Name: user_groups Admins delete user_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete user_groups" ON public.user_groups FOR DELETE USING (( SELECT public.is_store_admin(user_groups.store_id) AS is_store_admin));


--
-- Name: coupon_user_groups Admins insert coupon group links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins insert coupon group links" ON public.coupon_user_groups FOR INSERT WITH CHECK (( SELECT public.is_store_admin(coupon_user_groups.store_id) AS is_store_admin));


--
-- Name: user_group_members Admins insert memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins insert memberships" ON public.user_group_members FOR INSERT WITH CHECK (( SELECT public.is_store_admin(user_group_members.store_id) AS is_store_admin));


--
-- Name: store_pages Admins insert store_pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins insert store_pages" ON public.store_pages FOR INSERT WITH CHECK (( SELECT public.is_store_admin(store_pages.store_id) AS is_store_admin));


--
-- Name: user_groups Admins insert user_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins insert user_groups" ON public.user_groups FOR INSERT WITH CHECK (( SELECT public.is_store_admin(user_groups.store_id) AS is_store_admin));


--
-- Name: enquiries Admins read store enquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read store enquiries" ON public.enquiries FOR SELECT TO authenticated USING (( SELECT public.is_store_admin(enquiries.store_id) AS is_store_admin));


--
-- Name: coupon_user_groups Admins update coupon group links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update coupon group links" ON public.coupon_user_groups FOR UPDATE USING (( SELECT public.is_store_admin(coupon_user_groups.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(coupon_user_groups.store_id) AS is_store_admin));


--
-- Name: user_group_members Admins update memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update memberships" ON public.user_group_members FOR UPDATE USING (( SELECT public.is_store_admin(user_group_members.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(user_group_members.store_id) AS is_store_admin));


--
-- Name: store_pages Admins update store_pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update store_pages" ON public.store_pages FOR UPDATE USING (( SELECT public.is_store_admin(store_pages.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(store_pages.store_id) AS is_store_admin));


--
-- Name: user_groups Admins update user_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update user_groups" ON public.user_groups FOR UPDATE USING (( SELECT public.is_store_admin(user_groups.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(user_groups.store_id) AS is_store_admin));


--
-- Name: blog_comments Anyone can read blog comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read blog comments" ON public.blog_comments FOR SELECT USING (true);


--
-- Name: blog_likes Anyone can read blog likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read blog likes" ON public.blog_likes FOR SELECT USING (true);


--
-- Name: card_colors Anyone can read card_colors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read card_colors" ON public.card_colors FOR SELECT USING (true);


--
-- Name: homepage_sections Anyone can read homepage_sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read homepage_sections" ON public.homepage_sections FOR SELECT USING (true);


--
-- Name: product_reviews Anyone can read reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read reviews" ON public.product_reviews FOR SELECT USING (true);


--
-- Name: store_billing_settings Anyone can read store_billing_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read store_billing_settings" ON public.store_billing_settings FOR SELECT USING (true);


--
-- Name: store_menus Anyone can read store_menus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read store_menus" ON public.store_menus FOR SELECT USING (true);


--
-- Name: tax_classes Anyone can read tax_classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read tax_classes" ON public.tax_classes FOR SELECT USING (true);


--
-- Name: admins Auth admin can read admins for token hook; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth admin can read admins for token hook" ON public.admins FOR SELECT TO supabase_auth_admin USING (true);


--
-- Name: users Auth admin can read users for token hook; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth admin can read users for token hook" ON public.users FOR SELECT TO supabase_auth_admin USING (true);


--
-- Name: roles Authenticated can read roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read roles" ON public.roles FOR SELECT USING (( SELECT public.is_store_admin(roles.store_id) AS is_store_admin));


--
-- Name: blog_comments Customers can delete own comment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can delete own comment" ON public.blog_comments FOR DELETE USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: product_reviews Customers can delete own review; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can delete own review" ON public.product_reviews FOR DELETE USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: blog_comments Customers can insert own comment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can insert own comment" ON public.blog_comments FOR INSERT WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.store_id = blog_comments.store_id))))));


--
-- Name: product_reviews Customers can insert own review; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can insert own review" ON public.product_reviews FOR INSERT WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.store_id = product_reviews.store_id))))));


--
-- Name: users Customers can insert own row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can insert own row" ON public.users FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: users Customers can read own row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can read own row" ON public.users FOR SELECT USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: product_reviews Customers can update own review; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can update own review" ON public.product_reviews FOR UPDATE USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: users Customers can update own row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can update own row" ON public.users FOR UPDATE USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: order_items Customers can view own order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can view own order items" ON public.order_items FOR SELECT TO authenticated USING ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE (orders.customer_id = auth.uid()))));


--
-- Name: orders Customers can view own orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can view own orders" ON public.orders FOR SELECT TO authenticated USING ((customer_id = auth.uid()));


--
-- Name: customer_addresses Customers delete own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers delete own addresses" ON public.customer_addresses FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: customer_addresses Customers insert own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers insert own addresses" ON public.customer_addresses FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: customer_addresses Customers read own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers read own addresses" ON public.customer_addresses FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: customer_addresses Customers update own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers update own addresses" ON public.customer_addresses FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: blogs Delete blogs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Delete blogs" ON public.blogs FOR DELETE USING ((( SELECT public.is_store_admin(blogs.store_id) AS is_store_admin) OR ((submitted_by = ( SELECT auth.uid() AS uid)) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text])))));


--
-- Name: platform_admins Delete platform_admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Delete platform_admins" ON public.platform_admins FOR DELETE USING (( SELECT public.is_platform_superadmin() AS is_platform_superadmin));


--
-- Name: stores Delete stores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Delete stores" ON public.stores FOR DELETE USING (( SELECT public.is_store_superadmin(stores.id) AS is_store_superadmin));


--
-- Name: blogs Insert blogs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insert blogs" ON public.blogs FOR INSERT WITH CHECK ((( SELECT public.is_store_admin(blogs.store_id) AS is_store_admin) OR ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.store_id = blogs.store_id)))) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text])) AND (submitted_by = ( SELECT auth.uid() AS uid)) AND (is_customer_submission = true))));


--
-- Name: platform_admins Insert platform_admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insert platform_admins" ON public.platform_admins FOR INSERT WITH CHECK (( SELECT public.is_platform_superadmin() AS is_platform_superadmin));


--
-- Name: stores Insert stores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insert stores" ON public.stores FOR INSERT WITH CHECK (( SELECT public.is_store_superadmin(stores.id) AS is_store_superadmin));


--
-- Name: blog_categories Public can read blog categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read blog categories" ON public.blog_categories FOR SELECT USING (true);


--
-- Name: blog_tags Public can read blog tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read blog tags" ON public.blog_tags FOR SELECT USING (true);


--
-- Name: coupon_user_groups Public can read coupon group links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read coupon group links" ON public.coupon_user_groups FOR SELECT USING (true);


--
-- Name: store_pages Public read published store_pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read published store_pages" ON public.store_pages FOR SELECT USING (((status = 'published'::text) OR ( SELECT public.is_store_admin(store_pages.store_id) AS is_store_admin)));


--
-- Name: admins Read admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read admins" ON public.admins FOR SELECT USING ((( SELECT public.is_store_superadmin(admins.store_id) AS is_store_superadmin) OR (( SELECT auth.uid() AS uid) = id)));


--
-- Name: blogs Read blogs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read blogs" ON public.blogs FOR SELECT USING (((status = 'published'::text) OR ((submitted_by = ( SELECT auth.uid() AS uid)) AND (is_customer_submission = true)) OR ( SELECT public.is_store_admin(blogs.store_id) AS is_store_admin)));


--
-- Name: categories Read categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read categories" ON public.categories FOR SELECT USING (((status = 'active'::text) OR ( SELECT public.is_store_admin(categories.store_id) AS is_store_admin)));


--
-- Name: coupons Read coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read coupons" ON public.coupons FOR SELECT USING (((status = 'active'::text) OR ( SELECT public.is_store_admin(coupons.store_id) AS is_store_admin)));


--
-- Name: user_group_members Read memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read memberships" ON public.user_group_members FOR SELECT USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT public.is_store_admin(user_group_members.store_id) AS is_store_admin)));


--
-- Name: platform_admins Read platform_admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read platform_admins" ON public.platform_admins FOR SELECT USING ((( SELECT public.is_platform_admin() AS is_platform_admin) OR (lower(email) = lower(auth.email()))));


--
-- Name: product_variants Read product_variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read product_variants" ON public.product_variants FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.products
  WHERE ((products.id = product_variants.product_id) AND (products.status = 'published'::text)))) OR ( SELECT public.is_store_admin(product_variants.store_id) AS is_store_admin)));


--
-- Name: products Read products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read products" ON public.products FOR SELECT USING (((status = 'published'::text) OR ( SELECT public.is_store_admin(products.store_id) AS is_store_admin)));


--
-- Name: stores Read stores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read stores" ON public.stores FOR SELECT USING (((status = 'active'::text) OR ( SELECT public.is_store_superadmin(stores.id) AS is_store_superadmin)));


--
-- Name: stock_movements Store admins can read stock_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Store admins can read stock_movements" ON public.stock_movements FOR SELECT USING (( SELECT public.is_store_admin(stock_movements.store_id) AS is_store_admin));


--
-- Name: store_billing_settings Store admins manage store_billing_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Store admins manage store_billing_settings" ON public.store_billing_settings USING (( SELECT public.is_store_admin(store_billing_settings.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(store_billing_settings.store_id) AS is_store_admin));


--
-- Name: store_menus Store admins manage store_menus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Store admins manage store_menus" ON public.store_menus USING (( SELECT public.is_store_admin(store_menus.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(store_menus.store_id) AS is_store_admin));


--
-- Name: tax_classes Store admins manage tax_classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Store admins manage tax_classes" ON public.tax_classes USING (( SELECT public.is_store_admin(tax_classes.store_id) AS is_store_admin)) WITH CHECK (( SELECT public.is_store_admin(tax_classes.store_id) AS is_store_admin));


--
-- Name: admins Superadmins can delete profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can delete profiles" ON public.admins FOR DELETE USING (( SELECT public.is_store_superadmin(admins.store_id) AS is_store_superadmin));


--
-- Name: roles Superadmins can delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can delete roles" ON public.roles FOR DELETE USING (( SELECT public.is_store_superadmin(roles.store_id) AS is_store_superadmin));


--
-- Name: admins Superadmins can insert profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can insert profiles" ON public.admins FOR INSERT WITH CHECK (( SELECT public.is_store_superadmin(admins.store_id) AS is_store_superadmin));


--
-- Name: roles Superadmins can insert roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can insert roles" ON public.roles FOR INSERT WITH CHECK (( SELECT public.is_store_superadmin(roles.store_id) AS is_store_superadmin));


--
-- Name: roles Superadmins can update roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can update roles" ON public.roles FOR UPDATE USING (( SELECT public.is_store_superadmin(roles.store_id) AS is_store_superadmin)) WITH CHECK (( SELECT public.is_store_superadmin(roles.store_id) AS is_store_superadmin));


--
-- Name: admins Update admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Update admins" ON public.admins FOR UPDATE USING ((( SELECT public.is_store_superadmin(admins.store_id) AS is_store_superadmin) OR (( SELECT auth.uid() AS uid) = id)));


--
-- Name: blogs Update blogs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Update blogs" ON public.blogs FOR UPDATE USING ((( SELECT public.is_store_admin(blogs.store_id) AS is_store_admin) OR ((submitted_by = ( SELECT auth.uid() AS uid)) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text]))))) WITH CHECK ((( SELECT public.is_store_admin(blogs.store_id) AS is_store_admin) OR ((submitted_by = ( SELECT auth.uid() AS uid)) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text])))));


--
-- Name: platform_admins Update platform_admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Update platform_admins" ON public.platform_admins FOR UPDATE USING (( SELECT public.is_platform_superadmin() AS is_platform_superadmin)) WITH CHECK (( SELECT public.is_platform_superadmin() AS is_platform_superadmin));


--
-- Name: stores Update stores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Update stores" ON public.stores FOR UPDATE USING (( SELECT public.is_store_superadmin(stores.id) AS is_store_superadmin)) WITH CHECK (( SELECT public.is_store_superadmin(stores.id) AS is_store_superadmin));


--
-- Name: enquiries Users can insert own enquiry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own enquiry" ON public.enquiries FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = created_by));


--
-- Name: enquiries Users can read own enquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own enquiries" ON public.enquiries FOR SELECT USING ((( SELECT auth.uid() AS uid) = created_by));


--
-- Name: admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_credit_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_credit_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_credit_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_credit_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_credit_purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_credit_purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: blogs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;

--
-- Name: card_colors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.card_colors ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: coupon_user_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupon_user_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaign_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: enquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_events ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: product_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: razorpay_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.razorpay_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: store_billing_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_billing_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: store_brand_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_brand_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: store_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: store_menus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_menus ENABLE ROW LEVEL SECURITY;

--
-- Name: store_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: store_payment_providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_payment_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: store_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: stores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_classes ENABLE ROW LEVEL SECURITY;

--
-- Name: user_group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: user_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict UCCd6Zx4xfMbdtU5UmhzUjIHP87OwI4lSeUuCofJwBRpridEnr8UepSXRjcqzIf

