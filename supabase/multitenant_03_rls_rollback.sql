-- =============================================================
-- MULTI-TENANT — Phase 1b·3 ROLLBACK (undo multitenant_03_rls.sql)
--
-- Restores the original (non-store-scoped) policies, reverts the JWT hook to
-- the admins-only version, and drops the store-membership helpers.
-- Idempotent. Run by hand in the SQL Editor or via MCP.
-- =============================================================

-- Reusable original admin branch:
--   EXISTS (SELECT 1 FROM admins WHERE admins.id = (SELECT auth.uid())
--           AND admins.role = ANY (ARRAY['superadmin','member']))

-- ---- products ----
DROP POLICY IF EXISTS "Read products" ON public.products;
CREATE POLICY "Read products" ON public.products FOR SELECT TO public
  USING ((status = 'published') OR EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
CREATE POLICY "Admins can insert products" ON public.products FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can update products" ON public.products;
CREATE POLICY "Admins can update products" ON public.products FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can delete products" ON public.products;
CREATE POLICY "Admins can delete products" ON public.products FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));

-- ---- product_variants ----
DROP POLICY IF EXISTS "Read product_variants" ON public.product_variants;
CREATE POLICY "Read product_variants" ON public.product_variants FOR SELECT TO public
  USING ((EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND products.status = 'published')) OR EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can insert variants" ON public.product_variants;
CREATE POLICY "Admins can insert variants" ON public.product_variants FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can update variants" ON public.product_variants;
CREATE POLICY "Admins can update variants" ON public.product_variants FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can delete variants" ON public.product_variants;
CREATE POLICY "Admins can delete variants" ON public.product_variants FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));

-- ---- categories ----
DROP POLICY IF EXISTS "Read categories" ON public.categories;
CREATE POLICY "Read categories" ON public.categories FOR SELECT TO public
  USING ((status = 'active') OR EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can insert categories" ON public.categories;
CREATE POLICY "Admins can insert categories" ON public.categories FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can update categories" ON public.categories;
CREATE POLICY "Admins can update categories" ON public.categories FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can delete categories" ON public.categories;
CREATE POLICY "Admins can delete categories" ON public.categories FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));

-- ---- coupons ----
DROP POLICY IF EXISTS "Read coupons" ON public.coupons;
CREATE POLICY "Read coupons" ON public.coupons FOR SELECT TO public
  USING ((status = 'active') OR EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can insert coupons" ON public.coupons;
CREATE POLICY "Admins can insert coupons" ON public.coupons FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can update coupons" ON public.coupons;
CREATE POLICY "Admins can update coupons" ON public.coupons FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can delete coupons" ON public.coupons;
CREATE POLICY "Admins can delete coupons" ON public.coupons FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));

-- ---- coupon_user_groups ----
DROP POLICY IF EXISTS "Admins insert coupon group links" ON public.coupon_user_groups;
CREATE POLICY "Admins insert coupon group links" ON public.coupon_user_groups FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins update coupon group links" ON public.coupon_user_groups;
CREATE POLICY "Admins update coupon group links" ON public.coupon_user_groups FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins delete coupon group links" ON public.coupon_user_groups;
CREATE POLICY "Admins delete coupon group links" ON public.coupon_user_groups FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));

-- ---- card_colors ----
DROP POLICY IF EXISTS "Admins can insert card_colors" ON public.card_colors;
CREATE POLICY "Admins can insert card_colors" ON public.card_colors FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can update card_colors" ON public.card_colors;
CREATE POLICY "Admins can update card_colors" ON public.card_colors FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can delete card_colors" ON public.card_colors;
CREATE POLICY "Admins can delete card_colors" ON public.card_colors FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));

-- ---- homepage_sections ----
DROP POLICY IF EXISTS "Admins can insert homepage_sections" ON public.homepage_sections;
CREATE POLICY "Admins can insert homepage_sections" ON public.homepage_sections FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can update homepage_sections" ON public.homepage_sections;
CREATE POLICY "Admins can update homepage_sections" ON public.homepage_sections FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins can delete homepage_sections" ON public.homepage_sections;
CREATE POLICY "Admins can delete homepage_sections" ON public.homepage_sections FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));

-- ---- user_groups ----
DROP POLICY IF EXISTS "Admins can read user_groups" ON public.user_groups;
CREATE POLICY "Admins can read user_groups" ON public.user_groups FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins insert user_groups" ON public.user_groups;
CREATE POLICY "Admins insert user_groups" ON public.user_groups FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins update user_groups" ON public.user_groups;
CREATE POLICY "Admins update user_groups" ON public.user_groups FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins delete user_groups" ON public.user_groups;
CREATE POLICY "Admins delete user_groups" ON public.user_groups FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));

-- ---- user_group_members ----
DROP POLICY IF EXISTS "Read memberships" ON public.user_group_members;
CREATE POLICY "Read memberships" ON public.user_group_members FOR SELECT TO public
  USING (((SELECT auth.uid()) = user_id) OR EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins insert memberships" ON public.user_group_members;
CREATE POLICY "Admins insert memberships" ON public.user_group_members FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins update memberships" ON public.user_group_members;
CREATE POLICY "Admins update memberships" ON public.user_group_members FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Admins delete memberships" ON public.user_group_members;
CREATE POLICY "Admins delete memberships" ON public.user_group_members FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));

-- ---- blogs ----
DROP POLICY IF EXISTS "Read blogs" ON public.blogs;
CREATE POLICY "Read blogs" ON public.blogs FOR SELECT TO public
  USING ((status = 'published') OR ((submitted_by = (SELECT auth.uid())) AND (is_customer_submission = true)) OR EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member'])));
DROP POLICY IF EXISTS "Insert blogs" ON public.blogs;
CREATE POLICY "Insert blogs" ON public.blogs FOR INSERT TO public
  WITH CHECK ((EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member']))) OR ((EXISTS (SELECT 1 FROM public.users WHERE users.id = (SELECT auth.uid()))) AND (status = ANY (ARRAY['draft','pending_review'])) AND (submitted_by = (SELECT auth.uid())) AND (is_customer_submission = true)));
DROP POLICY IF EXISTS "Update blogs" ON public.blogs;
CREATE POLICY "Update blogs" ON public.blogs FOR UPDATE TO public
  USING ((EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member']))) OR ((submitted_by = (SELECT auth.uid())) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft','pending_review']))))
  WITH CHECK ((EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member']))) OR ((submitted_by = (SELECT auth.uid())) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft','pending_review']))));
DROP POLICY IF EXISTS "Delete blogs" ON public.blogs;
CREATE POLICY "Delete blogs" ON public.blogs FOR DELETE TO public
  USING ((EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = ANY (ARRAY['superadmin','member']))) OR ((submitted_by = (SELECT auth.uid())) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft','pending_review']))));

-- ---- blog_comments ----
DROP POLICY IF EXISTS "Customers can insert own comment" ON public.blog_comments;
CREATE POLICY "Customers can insert own comment" ON public.blog_comments FOR INSERT TO public
  WITH CHECK ((user_id = (SELECT auth.uid())) AND (EXISTS (SELECT 1 FROM public.users WHERE users.id = (SELECT auth.uid()))));

-- ---- product_reviews ----
DROP POLICY IF EXISTS "Customers can insert own review" ON public.product_reviews;
CREATE POLICY "Customers can insert own review" ON public.product_reviews FOR INSERT TO public
  WITH CHECK ((user_id = (SELECT auth.uid())) AND (EXISTS (SELECT 1 FROM public.users WHERE users.id = (SELECT auth.uid()))));

-- ---- roles ----
DROP POLICY IF EXISTS "Authenticated can read roles" ON public.roles;
CREATE POLICY "Authenticated can read roles" ON public.roles FOR SELECT TO public
  USING ((SELECT auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "Superadmins can insert roles" ON public.roles;
CREATE POLICY "Superadmins can insert roles" ON public.roles FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = 'superadmin'));
DROP POLICY IF EXISTS "Superadmins can update roles" ON public.roles;
CREATE POLICY "Superadmins can update roles" ON public.roles FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = 'superadmin'));
DROP POLICY IF EXISTS "Superadmins can delete roles" ON public.roles;
CREATE POLICY "Superadmins can delete roles" ON public.roles FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = (SELECT auth.uid()) AND admins.role = 'superadmin'));

-- ---- admins ----
DROP POLICY IF EXISTS "Read admins" ON public.admins;
CREATE POLICY "Read admins" ON public.admins FOR SELECT TO public
  USING ((SELECT is_superadmin()) OR ((SELECT auth.uid()) = id));
DROP POLICY IF EXISTS "Update admins" ON public.admins;
CREATE POLICY "Update admins" ON public.admins FOR UPDATE TO public
  USING ((SELECT is_superadmin()) OR ((SELECT auth.uid()) = id));
DROP POLICY IF EXISTS "Superadmins can insert profiles" ON public.admins;
CREATE POLICY "Superadmins can insert profiles" ON public.admins FOR INSERT TO public
  WITH CHECK ((SELECT is_superadmin()));
DROP POLICY IF EXISTS "Superadmins can delete profiles" ON public.admins;
CREATE POLICY "Superadmins can delete profiles" ON public.admins FOR DELETE TO public
  USING ((SELECT is_superadmin()));

-- ---- stores ----
DROP POLICY IF EXISTS "Read stores" ON public.stores;
CREATE POLICY "Read stores" ON public.stores FOR SELECT TO public
  USING ((status = 'active') OR (SELECT is_superadmin()));
DROP POLICY IF EXISTS "Insert stores" ON public.stores;
CREATE POLICY "Insert stores" ON public.stores FOR INSERT TO public
  WITH CHECK ((SELECT is_superadmin()));
DROP POLICY IF EXISTS "Update stores" ON public.stores;
CREATE POLICY "Update stores" ON public.stores FOR UPDATE TO public
  USING ((SELECT is_superadmin())) WITH CHECK ((SELECT is_superadmin()));
DROP POLICY IF EXISTS "Delete stores" ON public.stores;
CREATE POLICY "Delete stores" ON public.stores FOR DELETE TO public
  USING ((SELECT is_superadmin()));

-- ---- revert hook to admins-only + drop the auth-admin users policy ----
DROP POLICY IF EXISTS "Auth admin can read users for token hook" ON public.users;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  claims jsonb; v_role text; v_force boolean;
BEGIN
  SELECT role, force_password_reset INTO v_role, v_force
  FROM public.admins WHERE id = (event->>'user_id')::uuid;
  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', CASE WHEN v_role IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_role) END);
  claims := jsonb_set(claims, '{force_password_reset}', to_jsonb(COALESCE(v_force, false)));
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

DROP FUNCTION IF EXISTS public.is_store_admin(uuid);
DROP FUNCTION IF EXISTS public.is_store_superadmin(uuid);
