-- ==========================================
-- Orders and Order Items Tables
-- ==========================================

-- 1. Create orders table
CREATE TABLE IF NOT EXISTS public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    status text NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'shipped', 'delivered', 'cancelled'
    payment_method text NOT NULL DEFAULT 'cash_on_delivery',
    payment_status text NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'failed'
    
    shipping_address jsonb NOT NULL,
    billing_address jsonb,
    
    subtotal numeric(12,2) NOT NULL DEFAULT 0,
    tax numeric(12,2) NOT NULL DEFAULT 0,
    shipping numeric(12,2) NOT NULL DEFAULT 0,
    discount numeric(12,2) NOT NULL DEFAULT 0,
    total numeric(12,2) NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'INR',
    
    applied_coupon_code text,
    notes text,
    
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders (store_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders (customer_id);

-- 2. Create order_items table
CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    variant_id uuid REFERENCES public.product_variants(id) ON DELETE RESTRICT,
    
    name text NOT NULL,
    variant_name text,
    price numeric(12,2) NOT NULL DEFAULT 0,
    quantity integer NOT NULL DEFAULT 1,
    total numeric(12,2) NOT NULL DEFAULT 0,
    
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);

-- Keep orders.updated_at fresh on status/payment changes (mirrors the shared
-- catalog trigger used by other tables). Self-contained so this file re-runs.
CREATE OR REPLACE FUNCTION public.update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at_trigger ON public.orders;
CREATE TRIGGER orders_updated_at_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_orders_updated_at();

-- 3. Row Level Security (RLS)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Customers can view their own orders
DROP POLICY IF EXISTS "Customers can view own orders" ON public.orders;
CREATE POLICY "Customers can view own orders"
ON public.orders FOR SELECT
TO authenticated
USING (customer_id = (auth.uid()::uuid));

-- Customers can view their own order items
DROP POLICY IF EXISTS "Customers can view own order items" ON public.order_items;
CREATE POLICY "Customers can view own order items"
ON public.order_items FOR SELECT
TO authenticated
USING (
  order_id IN (
    SELECT id FROM public.orders WHERE customer_id = (auth.uid()::uuid)
  )
);

-- Store admins can view and manage orders for their store
DROP POLICY IF EXISTS "Admins can view and manage store orders" ON public.orders;
CREATE POLICY "Admins can view and manage store orders"
ON public.orders FOR ALL
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM public.admins WHERE id = (auth.uid()::uuid)
  )
);

DROP POLICY IF EXISTS "Admins can view and manage store order items" ON public.order_items;
CREATE POLICY "Admins can view and manage store order items"
ON public.order_items FOR ALL
TO authenticated
USING (
  order_id IN (
    SELECT id FROM public.orders
    WHERE store_id IN (
      SELECT store_id FROM public.admins WHERE id = (auth.uid()::uuid)
    )
  )
);

-- Note: shoppers place orders through the placeOrder server action, which writes
-- with the SERVICE ROLE (bypasses RLS) after re-deriving all prices/totals from
-- the DB — so there is intentionally NO customer INSERT policy here. Do not add
-- one unless the checkout path stops using the service-role client.
