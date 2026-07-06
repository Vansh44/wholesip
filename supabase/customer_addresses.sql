-- =============================================================
-- Customer saved addresses (storefront checkout address book)
--
-- Lets a signed-in shopper save shipping addresses and reuse them at checkout
-- instead of retyping every time. Own-row RLS via auth.uid() (mirrors
-- product_reviews / users conventions). store_id is carried for tenancy
-- consistency; isolation is really by user_id (a user belongs to one store).
-- Apply by hand in the Supabase SQL Editor. Idempotent: safe to re-run.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  store_id      uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

  first_name    text NOT NULL,
  last_name     text,
  email         text,
  phone         text,
  address_line1 text NOT NULL,
  address_line2 text,
  city          text NOT NULL,
  state         text NOT NULL,
  postal_code   text NOT NULL,
  country       text NOT NULL DEFAULT 'India',
  is_default    boolean NOT NULL DEFAULT false,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user
  ON public.customer_addresses (user_id);

-- updated_at trigger (self-contained so this migration re-runs cleanly)
CREATE OR REPLACE FUNCTION public.update_customer_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_addresses_updated_at_trigger ON public.customer_addresses;
CREATE TRIGGER customer_addresses_updated_at_trigger
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_customer_addresses_updated_at();

-- -------------------------------------------------------------
-- Row Level Security — a customer may only touch their OWN rows.
-- -------------------------------------------------------------
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers read own addresses" ON public.customer_addresses;
CREATE POLICY "Customers read own addresses"
  ON public.customer_addresses FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Customers insert own addresses" ON public.customer_addresses;
CREATE POLICY "Customers insert own addresses"
  ON public.customer_addresses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Customers update own addresses" ON public.customer_addresses;
CREATE POLICY "Customers update own addresses"
  ON public.customer_addresses FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Customers delete own addresses" ON public.customer_addresses;
CREATE POLICY "Customers delete own addresses"
  ON public.customer_addresses FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
