-- =============================================================
-- Atomic coupon usage counters
--
-- Redeeming a coupon must bump `coupons.used_count` WITHOUT a read-modify-write
-- race: two simultaneous checkouts could each read the same count and each write
-- count+1, letting a `max_uses`-limited coupon be redeemed past its cap.
--
-- increment_coupon_usage() is a single conditional UPDATE. Postgres locks the
-- matched row for the statement, and the `used_count < max_uses` guard lives in
-- the WHERE clause, so a concurrent caller re-evaluates it against the freshly
-- committed value. It returns TRUE only when a use was actually reserved; the
-- caller aborts checkout on FALSE (the coupon was exhausted by a concurrent
-- order). max_uses = 0 means "unlimited".
--
-- decrement_coupon_usage() releases a reserved use if the surrounding order
-- fails to persist (best effort; floors at 0 so it can never go negative).
--
-- SECURITY DEFINER so it can update coupons regardless of the caller's RLS; the
-- coupon is matched by (code, store_id) so a call can only ever touch the
-- intended store's coupon. Called by placeOrder (app/actions/checkout-actions.ts)
-- through the service-role client. Apply by hand in the Supabase SQL Editor.
-- Idempotent: safe to re-run.
-- =============================================================

CREATE OR REPLACE FUNCTION public.increment_coupon_usage(
  p_code text,
  p_store_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.decrement_coupon_usage(
  p_code text,
  p_store_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.coupons
     SET used_count = GREATEST(used_count - 1, 0)
   WHERE code = p_code
     AND store_id = p_store_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(text, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decrement_coupon_usage(text, uuid)
  TO authenticated, service_role;
