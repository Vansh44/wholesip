-- =============================================================
-- PLATFORM ADMINS — route the orders policies through is_store_admin()
--
-- THE BUG THIS FIXES
-- ------------------
-- multitenant_07_platform_admins.sql made a platform operator an implicit
-- superadmin of EVERY store by folding is_platform_admin() into the two RLS
-- helpers:
--
--   is_store_admin(store)      := is_platform_admin() OR <admins row for store>
--   is_store_superadmin(store) := is_platform_admin() OR <superadmin row>
--
-- Every store-admin policy in the schema calls those helpers — except two. The
-- orders and order_items admin policies (written before the helpers existed,
-- and carried forward verbatim by phase6_01_uid_columns_to_text.sql §7) inline
-- the membership test instead:
--
--   store_id IN (SELECT store_id FROM admins WHERE id = auth.uid())
--
-- That expression knows nothing about platform_admins. So a StoreMink operator
-- — full access at the app layer (getManagerIdentity returns their identity for
-- every store), no `admins` row for the store they are managing — matched no
-- policy on those two tables. Postgres does not error on that: it returns zero
-- rows. The orders dashboard read "No orders yet" for a store whose analytics
-- page (service scope, RLS bypassed) reported nine orders and ₹3,415 of
-- revenue, and status updates reported success while changing nothing.
--
-- Fix: delegate to the helper, so there is ONE definition of "may administer
-- this store" and these policies cannot drift from it again. order_items has
-- no store_id of its own, so it reaches the store through its order.
--
-- The customer-facing policies ("Customers can view own …") are deliberately
-- untouched — they are own-row checks on auth.uid() and were always correct.
--
-- Idempotent (DROP POLICY IF EXISTS + CREATE). Reversible via the _rollback
-- file. Run as a role that owns the tables (postgres), like the phase-6
-- migration.
-- =============================================================

-- ---- orders ----
DROP POLICY IF EXISTS "Admins can view and manage store orders" ON public.orders;
CREATE POLICY "Admins can view and manage store orders"
  ON public.orders AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT public.is_store_admin(store_id)))
  WITH CHECK ((SELECT public.is_store_admin(store_id)));

-- ---- order_items ----
-- No store_id column: authority comes from the parent order. The subquery is
-- itself subject to the orders policy above, which is the same answer.
DROP POLICY IF EXISTS "Admins can view and manage store order items" ON public.order_items;
CREATE POLICY "Admins can view and manage store order items"
  ON public.order_items AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (SELECT public.is_store_admin(o.store_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (SELECT public.is_store_admin(o.store_id))
  ));

-- ---- guard: no admin policy may inline the membership test again ----
-- Cheap drift detector. If a future migration reintroduces a hand-rolled
-- `FROM admins WHERE id = auth.uid()` in a policy, this migration fails loudly
-- rather than shipping another table that platform operators silently cannot
-- see.
DO $$
DECLARE offenders text;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ')
    INTO offenders
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (qual LIKE '%FROM admins%' OR with_check LIKE '%FROM admins%');

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'RLS policies still inline the admins lookup (they bypass is_platform_admin): %',
      offenders;
  END IF;
END $$;
