-- =============================================================
-- MULTI-TENANT — Phase 1b·3: store-scoped RLS (the isolation backstop)
--
-- Makes the DATABASE enforce that a signed-in admin can only read/write rows
-- belonging to THEIR store. Until now isolation was app-layer only; this is the
-- backstop that holds even if app code has a bug.
--
-- Design:
--   * Two SECURITY DEFINER helpers resolve "is the current user an admin /
--     superadmin OF THIS row's store" by reading admins directly via auth.uid().
--     They do NOT read the JWT store_id claim — so currently-signed-in admins
--     are never locked out waiting for a token refresh, and it's correct at once.
--   * Every admin branch in every policy is swapped to the store-scoped helper.
--   * PUBLIC/anon read branches (status='published'/'active'/true) are LEFT
--     store-agnostic on purpose: anon carries no store identity, so the storefront
--     scopes public reads in the app layer (lib/storefront/queries.ts). The DB
--     backstop is for AUTHENTICATED access.
--   * The JWT hook additionally embeds store_id (admins, then users) for future
--     client-side use; RLS does not depend on it.
--
-- Idempotent (DROP POLICY IF EXISTS + CREATE). Reversible via the _rollback file.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Store-membership helpers (mirror is_superadmin's security model)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_store_admin(target_store uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE id = auth.uid()
      AND role = ANY (ARRAY['superadmin', 'member'])
      AND store_id = target_store
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_store_superadmin(target_store uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE id = auth.uid()
      AND role = 'superadmin'
      AND store_id = target_store
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_store_admin(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_store_superadmin(uuid) TO anon, authenticated;

-- -------------------------------------------------------------
-- 2. JWT hook: also embed store_id (admins first, else users)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  claims jsonb;
  v_role text;
  v_force boolean;
  v_store uuid;
BEGIN
  SELECT role, force_password_reset, store_id
    INTO v_role, v_force, v_store
  FROM public.admins
  WHERE id = (event->>'user_id')::uuid;

  -- Customers (no admin row) carry their store too.
  IF v_store IS NULL THEN
    SELECT store_id INTO v_store
    FROM public.users
    WHERE id = (event->>'user_id')::uuid;
  END IF;

  claims := event->'claims';
  claims := jsonb_set(
    claims, '{user_role}',
    CASE WHEN v_role IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_role) END);
  claims := jsonb_set(
    claims, '{force_password_reset}', to_jsonb(COALESCE(v_force, false)));
  claims := jsonb_set(
    claims, '{store_id}',
    CASE WHEN v_store IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_store) END);

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- The hook now also reads users; grant the auth admin access to it.
GRANT SELECT ON TABLE public.users TO supabase_auth_admin;
DROP POLICY IF EXISTS "Auth admin can read users for token hook" ON public.users;
CREATE POLICY "Auth admin can read users for token hook"
  ON public.users FOR SELECT TO supabase_auth_admin USING (true);

-- -------------------------------------------------------------
-- 3. Policy rewrites — admin branch becomes store-scoped.
--    Public/customer-own branches preserved verbatim.
-- -------------------------------------------------------------

-- ---- products ----
DROP POLICY IF EXISTS "Read products" ON public.products;
CREATE POLICY "Read products" ON public.products FOR SELECT TO public
  USING ((status = 'published') OR (SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
CREATE POLICY "Admins can insert products" ON public.products FOR INSERT TO public
  WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can update products" ON public.products;
CREATE POLICY "Admins can update products" ON public.products FOR UPDATE TO public
  USING ((SELECT is_store_admin(store_id))) WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can delete products" ON public.products;
CREATE POLICY "Admins can delete products" ON public.products FOR DELETE TO public
  USING ((SELECT is_store_admin(store_id)));

-- ---- product_variants ----
DROP POLICY IF EXISTS "Read product_variants" ON public.product_variants;
CREATE POLICY "Read product_variants" ON public.product_variants FOR SELECT TO public
  USING (
    (EXISTS (SELECT 1 FROM public.products WHERE products.id = product_variants.product_id AND products.status = 'published'))
    OR (SELECT is_store_admin(store_id))
  );
DROP POLICY IF EXISTS "Admins can insert variants" ON public.product_variants;
CREATE POLICY "Admins can insert variants" ON public.product_variants FOR INSERT TO public
  WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can update variants" ON public.product_variants;
CREATE POLICY "Admins can update variants" ON public.product_variants FOR UPDATE TO public
  USING ((SELECT is_store_admin(store_id))) WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can delete variants" ON public.product_variants;
CREATE POLICY "Admins can delete variants" ON public.product_variants FOR DELETE TO public
  USING ((SELECT is_store_admin(store_id)));

-- ---- categories ----
DROP POLICY IF EXISTS "Read categories" ON public.categories;
CREATE POLICY "Read categories" ON public.categories FOR SELECT TO public
  USING ((status = 'active') OR (SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can insert categories" ON public.categories;
CREATE POLICY "Admins can insert categories" ON public.categories FOR INSERT TO public
  WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can update categories" ON public.categories;
CREATE POLICY "Admins can update categories" ON public.categories FOR UPDATE TO public
  USING ((SELECT is_store_admin(store_id))) WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can delete categories" ON public.categories;
CREATE POLICY "Admins can delete categories" ON public.categories FOR DELETE TO public
  USING ((SELECT is_store_admin(store_id)));

-- ---- coupons ----
DROP POLICY IF EXISTS "Read coupons" ON public.coupons;
CREATE POLICY "Read coupons" ON public.coupons FOR SELECT TO public
  USING ((status = 'active') OR (SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can insert coupons" ON public.coupons;
CREATE POLICY "Admins can insert coupons" ON public.coupons FOR INSERT TO public
  WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can update coupons" ON public.coupons;
CREATE POLICY "Admins can update coupons" ON public.coupons FOR UPDATE TO public
  USING ((SELECT is_store_admin(store_id))) WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can delete coupons" ON public.coupons;
CREATE POLICY "Admins can delete coupons" ON public.coupons FOR DELETE TO public
  USING ((SELECT is_store_admin(store_id)));

-- ---- coupon_user_groups (public read kept) ----
DROP POLICY IF EXISTS "Admins insert coupon group links" ON public.coupon_user_groups;
CREATE POLICY "Admins insert coupon group links" ON public.coupon_user_groups FOR INSERT TO public
  WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins update coupon group links" ON public.coupon_user_groups;
CREATE POLICY "Admins update coupon group links" ON public.coupon_user_groups FOR UPDATE TO public
  USING ((SELECT is_store_admin(store_id))) WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins delete coupon group links" ON public.coupon_user_groups;
CREATE POLICY "Admins delete coupon group links" ON public.coupon_user_groups FOR DELETE TO public
  USING ((SELECT is_store_admin(store_id)));

-- ---- card_colors (public read kept) ----
DROP POLICY IF EXISTS "Admins can insert card_colors" ON public.card_colors;
CREATE POLICY "Admins can insert card_colors" ON public.card_colors FOR INSERT TO public
  WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can update card_colors" ON public.card_colors;
CREATE POLICY "Admins can update card_colors" ON public.card_colors FOR UPDATE TO public
  USING ((SELECT is_store_admin(store_id))) WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can delete card_colors" ON public.card_colors;
CREATE POLICY "Admins can delete card_colors" ON public.card_colors FOR DELETE TO public
  USING ((SELECT is_store_admin(store_id)));

-- ---- homepage_sections (public read kept) ----
DROP POLICY IF EXISTS "Admins can insert homepage_sections" ON public.homepage_sections;
CREATE POLICY "Admins can insert homepage_sections" ON public.homepage_sections FOR INSERT TO public
  WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can update homepage_sections" ON public.homepage_sections;
CREATE POLICY "Admins can update homepage_sections" ON public.homepage_sections FOR UPDATE TO public
  USING ((SELECT is_store_admin(store_id))) WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins can delete homepage_sections" ON public.homepage_sections;
CREATE POLICY "Admins can delete homepage_sections" ON public.homepage_sections FOR DELETE TO public
  USING ((SELECT is_store_admin(store_id)));

-- ---- user_groups ----
DROP POLICY IF EXISTS "Admins can read user_groups" ON public.user_groups;
CREATE POLICY "Admins can read user_groups" ON public.user_groups FOR SELECT TO public
  USING ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins insert user_groups" ON public.user_groups;
CREATE POLICY "Admins insert user_groups" ON public.user_groups FOR INSERT TO public
  WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins update user_groups" ON public.user_groups;
CREATE POLICY "Admins update user_groups" ON public.user_groups FOR UPDATE TO public
  USING ((SELECT is_store_admin(store_id))) WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins delete user_groups" ON public.user_groups;
CREATE POLICY "Admins delete user_groups" ON public.user_groups FOR DELETE TO public
  USING ((SELECT is_store_admin(store_id)));

-- ---- user_group_members ----
DROP POLICY IF EXISTS "Read memberships" ON public.user_group_members;
CREATE POLICY "Read memberships" ON public.user_group_members FOR SELECT TO public
  USING (((SELECT auth.uid()) = user_id) OR (SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins insert memberships" ON public.user_group_members;
CREATE POLICY "Admins insert memberships" ON public.user_group_members FOR INSERT TO public
  WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins update memberships" ON public.user_group_members;
CREATE POLICY "Admins update memberships" ON public.user_group_members FOR UPDATE TO public
  USING ((SELECT is_store_admin(store_id))) WITH CHECK ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Admins delete memberships" ON public.user_group_members;
CREATE POLICY "Admins delete memberships" ON public.user_group_members FOR DELETE TO public
  USING ((SELECT is_store_admin(store_id)));

-- ---- blogs (admin branch scoped; customer-own branch keeps store check) ----
DROP POLICY IF EXISTS "Read blogs" ON public.blogs;
CREATE POLICY "Read blogs" ON public.blogs FOR SELECT TO public
  USING (
    (status = 'published')
    OR ((submitted_by = (SELECT auth.uid())) AND (is_customer_submission = true))
    OR (SELECT is_store_admin(store_id))
  );
DROP POLICY IF EXISTS "Insert blogs" ON public.blogs;
CREATE POLICY "Insert blogs" ON public.blogs FOR INSERT TO public
  WITH CHECK (
    (SELECT is_store_admin(store_id))
    OR (
      EXISTS (SELECT 1 FROM public.users WHERE users.id = (SELECT auth.uid()) AND users.store_id = blogs.store_id)
      AND (status = ANY (ARRAY['draft', 'pending_review']))
      AND (submitted_by = (SELECT auth.uid()))
      AND (is_customer_submission = true)
    )
  );
DROP POLICY IF EXISTS "Update blogs" ON public.blogs;
CREATE POLICY "Update blogs" ON public.blogs FOR UPDATE TO public
  USING (
    (SELECT is_store_admin(store_id))
    OR ((submitted_by = (SELECT auth.uid())) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft', 'pending_review'])))
  )
  WITH CHECK (
    (SELECT is_store_admin(store_id))
    OR ((submitted_by = (SELECT auth.uid())) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft', 'pending_review'])))
  );
DROP POLICY IF EXISTS "Delete blogs" ON public.blogs;
CREATE POLICY "Delete blogs" ON public.blogs FOR DELETE TO public
  USING (
    (SELECT is_store_admin(store_id))
    OR ((submitted_by = (SELECT auth.uid())) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft', 'pending_review'])))
  );

-- ---- blog_comments (public read kept; customer insert scoped to own store) ----
DROP POLICY IF EXISTS "Customers can insert own comment" ON public.blog_comments;
CREATE POLICY "Customers can insert own comment" ON public.blog_comments FOR INSERT TO public
  WITH CHECK (
    (user_id = (SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.users WHERE users.id = (SELECT auth.uid()) AND users.store_id = blog_comments.store_id)
  );

-- ---- product_reviews (public read kept; customer insert scoped to own store) ----
DROP POLICY IF EXISTS "Customers can insert own review" ON public.product_reviews;
CREATE POLICY "Customers can insert own review" ON public.product_reviews FOR INSERT TO public
  WITH CHECK (
    (user_id = (SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.users WHERE users.id = (SELECT auth.uid()) AND users.store_id = product_reviews.store_id)
  );

-- ---- roles (store-scoped) ----
DROP POLICY IF EXISTS "Authenticated can read roles" ON public.roles;
CREATE POLICY "Authenticated can read roles" ON public.roles FOR SELECT TO public
  USING ((SELECT is_store_admin(store_id)));
DROP POLICY IF EXISTS "Superadmins can insert roles" ON public.roles;
CREATE POLICY "Superadmins can insert roles" ON public.roles FOR INSERT TO public
  WITH CHECK ((SELECT is_store_superadmin(store_id)));
DROP POLICY IF EXISTS "Superadmins can update roles" ON public.roles;
CREATE POLICY "Superadmins can update roles" ON public.roles FOR UPDATE TO public
  USING ((SELECT is_store_superadmin(store_id))) WITH CHECK ((SELECT is_store_superadmin(store_id)));
DROP POLICY IF EXISTS "Superadmins can delete roles" ON public.roles;
CREATE POLICY "Superadmins can delete roles" ON public.roles FOR DELETE TO public
  USING ((SELECT is_store_superadmin(store_id)));

-- ---- admins (a store's superadmin manages that store's admins; self always) ----
DROP POLICY IF EXISTS "Read admins" ON public.admins;
CREATE POLICY "Read admins" ON public.admins FOR SELECT TO public
  USING ((SELECT is_store_superadmin(store_id)) OR ((SELECT auth.uid()) = id));
DROP POLICY IF EXISTS "Update admins" ON public.admins;
CREATE POLICY "Update admins" ON public.admins FOR UPDATE TO public
  USING ((SELECT is_store_superadmin(store_id)) OR ((SELECT auth.uid()) = id));
DROP POLICY IF EXISTS "Superadmins can insert profiles" ON public.admins;
CREATE POLICY "Superadmins can insert profiles" ON public.admins FOR INSERT TO public
  WITH CHECK ((SELECT is_store_superadmin(store_id)));
DROP POLICY IF EXISTS "Superadmins can delete profiles" ON public.admins;
CREATE POLICY "Superadmins can delete profiles" ON public.admins FOR DELETE TO public
  USING ((SELECT is_store_superadmin(store_id)));

-- ---- stores (only the store's own superadmin manages it; anon reads active) ----
DROP POLICY IF EXISTS "Read stores" ON public.stores;
CREATE POLICY "Read stores" ON public.stores FOR SELECT TO public
  USING ((status = 'active') OR (SELECT is_store_superadmin(id)));
DROP POLICY IF EXISTS "Insert stores" ON public.stores;
CREATE POLICY "Insert stores" ON public.stores FOR INSERT TO public
  WITH CHECK ((SELECT is_store_superadmin(id)));
DROP POLICY IF EXISTS "Update stores" ON public.stores;
CREATE POLICY "Update stores" ON public.stores FOR UPDATE TO public
  USING ((SELECT is_store_superadmin(id))) WITH CHECK ((SELECT is_store_superadmin(id)));
DROP POLICY IF EXISTS "Delete stores" ON public.stores;
CREATE POLICY "Delete stores" ON public.stores FOR DELETE TO public
  USING ((SELECT is_store_superadmin(id)));

-- =============================================================
-- NOTE: enquiries, blog_likes, email_campaigns(+recipients) are read/written by
-- the dashboard via the SERVICE ROLE (RLS bypassed), so their cross-store
-- isolation is enforced in the app layer (queries filter by store_id), NOT here.
-- Tightening those dashboard reads is the next app-layer step.
-- =============================================================
