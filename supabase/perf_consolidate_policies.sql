-- =============================================================
-- Performance: consolidate overlapping PERMISSIVE policies
-- (Supabase advisor: multiple_permissive_policies).
--
-- Postgres OR-combines permissive policies, so merging same-command, same-role
-- permissive policies into ONE policy is access-equivalent. For tables where an
-- admin "FOR ALL" policy overlapped SELECT, ALL is split into INSERT/UPDATE/
-- DELETE so reads are served by a single read policy. All auth.*()/is_superadmin()
-- calls stay wrapped in (SELECT ...) so this doesn't reintroduce auth_rls_initplan.
--
-- Already applied to the live DB via MCP; kept here for reproducibility.
-- Apply by hand in the Supabase SQL Editor. Idempotent (DROP IF EXISTS + CREATE).
-- =============================================================

-- admins
DROP POLICY IF EXISTS "Superadmins can read all profiles" ON public.admins;
DROP POLICY IF EXISTS "Users can read own profile" ON public.admins;
CREATE POLICY "Read admins" ON public.admins FOR SELECT TO public
  USING ((SELECT is_superadmin()) OR ((SELECT auth.uid()) = id));
DROP POLICY IF EXISTS "Superadmins can update profiles" ON public.admins;
DROP POLICY IF EXISTS "Users can update own profile" ON public.admins;
CREATE POLICY "Update admins" ON public.admins FOR UPDATE TO public
  USING ((SELECT is_superadmin()) OR ((SELECT auth.uid()) = id));

-- categories
DROP POLICY IF EXISTS "Admins can read all categories" ON public.categories;
DROP POLICY IF EXISTS "Public can read active categories" ON public.categories;
CREATE POLICY "Read categories" ON public.categories FOR SELECT TO public
  USING ((status = 'active')
    OR EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')));

-- coupons
DROP POLICY IF EXISTS "Admins can read all coupons" ON public.coupons;
DROP POLICY IF EXISTS "Public can read active coupons" ON public.coupons;
CREATE POLICY "Read coupons" ON public.coupons FOR SELECT TO public
  USING ((status = 'active')
    OR EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')));

-- products
DROP POLICY IF EXISTS "Admins can read all products" ON public.products;
DROP POLICY IF EXISTS "Public can read published products" ON public.products;
CREATE POLICY "Read products" ON public.products FOR SELECT TO public
  USING ((status = 'published')
    OR EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')));

-- product_variants
DROP POLICY IF EXISTS "Admins can read all variants" ON public.product_variants;
DROP POLICY IF EXISTS "Public can read variants of published products" ON public.product_variants;
CREATE POLICY "Read product_variants" ON public.product_variants FOR SELECT TO public
  USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = product_variants.product_id AND products.status = 'published')
    OR EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member'))
  );

-- blogs
DROP POLICY IF EXISTS "Admins can read all blogs" ON public.blogs;
DROP POLICY IF EXISTS "Customers can read own submissions" ON public.blogs;
DROP POLICY IF EXISTS "Public can read published blogs" ON public.blogs;
CREATE POLICY "Read blogs" ON public.blogs FOR SELECT TO public
  USING (
    (status = 'published')
    OR ((submitted_by = (SELECT auth.uid())) AND (is_customer_submission = true))
    OR EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member'))
  );
DROP POLICY IF EXISTS "Admins can insert blogs" ON public.blogs;
DROP POLICY IF EXISTS "Customers can submit blogs for review" ON public.blogs;
CREATE POLICY "Insert blogs" ON public.blogs FOR INSERT TO public
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member'))
    OR (
      EXISTS (SELECT 1 FROM users WHERE users.id = (SELECT auth.uid()))
      AND (status = ANY (ARRAY['draft','pending_review']))
      AND (submitted_by = (SELECT auth.uid()))
      AND (is_customer_submission = true)
    )
  );
DROP POLICY IF EXISTS "Admins can update blogs" ON public.blogs;
DROP POLICY IF EXISTS "Customers can edit own drafts and pending submissions" ON public.blogs;
CREATE POLICY "Update blogs" ON public.blogs FOR UPDATE TO public
  USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member'))
    OR ((submitted_by = (SELECT auth.uid())) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft','pending_review'])))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member'))
    OR ((submitted_by = (SELECT auth.uid())) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft','pending_review'])))
  );
DROP POLICY IF EXISTS "Admins can delete blogs" ON public.blogs;
DROP POLICY IF EXISTS "Customers can delete own drafts and pending submissions" ON public.blogs;
CREATE POLICY "Delete blogs" ON public.blogs FOR DELETE TO public
  USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member'))
    OR ((submitted_by = (SELECT auth.uid())) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft','pending_review'])))
  );

-- coupon_user_groups (split FOR ALL; public read kept)
DROP POLICY IF EXISTS "Admins can write coupon group links" ON public.coupon_user_groups;
CREATE POLICY "Admins insert coupon group links" ON public.coupon_user_groups FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')));
CREATE POLICY "Admins update coupon group links" ON public.coupon_user_groups FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')));
CREATE POLICY "Admins delete coupon group links" ON public.coupon_user_groups FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')));

-- user_groups (split FOR ALL; admin read kept)
DROP POLICY IF EXISTS "Admins can write user_groups" ON public.user_groups;
CREATE POLICY "Admins insert user_groups" ON public.user_groups FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')));
CREATE POLICY "Admins update user_groups" ON public.user_groups FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')));
CREATE POLICY "Admins delete user_groups" ON public.user_groups FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')));

-- user_group_members (split FOR ALL; merge the two SELECT reads)
DROP POLICY IF EXISTS "Admins can write memberships" ON public.user_group_members;
DROP POLICY IF EXISTS "Admins can read memberships" ON public.user_group_members;
DROP POLICY IF EXISTS "Customers can read own memberships" ON public.user_group_members;
CREATE POLICY "Read memberships" ON public.user_group_members FOR SELECT TO public
  USING (
    ((SELECT auth.uid()) = user_id)
    OR EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member'))
  );
CREATE POLICY "Admins insert memberships" ON public.user_group_members FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')));
CREATE POLICY "Admins update memberships" ON public.user_group_members FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')));
CREATE POLICY "Admins delete memberships" ON public.user_group_members FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid()) AND admins.role IN ('superadmin','member')));
