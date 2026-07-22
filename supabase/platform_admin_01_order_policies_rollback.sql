-- =============================================================
-- ROLLBACK — platform_admin_01_order_policies.sql
--
-- Restores the pre-migration orders/order_items admin policies exactly as
-- phase6_01_uid_columns_to_text.sql §7 created them (the inline admins
-- lookup). Rolling back REINTRODUCES the platform-operator blind spot: a
-- StoreMink operator with no admins row for a store will again see zero rows
-- on these two tables under the user scope.
-- =============================================================

DROP POLICY IF EXISTS "Admins can view and manage store orders" ON public.orders;
CREATE POLICY "Admins can view and manage store orders"
  ON public.orders AS PERMISSIVE FOR ALL TO authenticated
  USING ((store_id IN ( SELECT admins.store_id
   FROM admins
  WHERE (admins.id = auth.uid()))));

DROP POLICY IF EXISTS "Admins can view and manage store order items" ON public.order_items;
CREATE POLICY "Admins can view and manage store order items"
  ON public.order_items AS PERMISSIVE FOR ALL TO authenticated
  USING ((order_id IN ( SELECT orders.id
   FROM orders
  WHERE (orders.store_id IN ( SELECT admins.store_id
           FROM admins
          WHERE (admins.id = auth.uid()))))));
