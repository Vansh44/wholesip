-- =============================================================================
-- Phase 6 — Convert uid-holding columns from uuid -> text
-- =============================================================================
-- WHY: auth uids are now Identity Platform (Firebase) uids, which are 28-char
-- alphanumeric STRINGS, not UUIDs (Google/OAuth users cannot be forced to a
-- UUID uid). `admins.id` / `users.id` (and every column that stores a uid)
-- were `uuid` from the Supabase era, so new signups fail to insert. This
-- retypes exactly the 25 uid-holding columns to `text`, and retypes the
-- `auth.uid()` shim to return `text` (dropping its `::uuid` cast).
--
-- WHAT STAYS uuid: every entity PK (`*.id` with a gen_random_uuid default),
-- every `store_id` (-> stores.id, unchanged), and all entity-ref FKs
-- (order_id, product_id, blog_id, group_id, tax_class_id, ...). Only columns
-- that hold an admins/users uid are converted. `platform_admins.invited_by`
-- is intentionally left uuid: it has no FK, is never written by app code
-- (always NULL), and if anything refers to platform_admins.id (a random uuid).
--
-- SCOPE (verified against the live schema via pg_depend):
--   * 25 columns retyped uuid -> text
--   * auth.uid() retyped -> text (its only hard-dependents are the 25 policies)
--   * 7 FKs dropped + recreated (both endpoints become text)
--   * 25 RLS policies dropped + recreated verbatim (text = text still holds)
--   * 2 admin views (customer_admin, enquiry_admin) dropped + recreated
--   * 18 indexes / 3 PKs / 1 unique constraint on these columns are REBUILT
--     automatically by ALTER COLUMN TYPE — no manual drop needed.
--
-- The plpgsql helpers is_store_admin / is_store_superadmin / is_superadmin do
-- `admins.id = auth.uid()`; they self-heal once both sides are text (plpgsql
-- has no hard dependency on auth.uid()). is_platform_admin uses auth.email(),
-- which is untouched.
--
-- MUST RUN AS A SUPERUSER (postgres) — every affected table/view/function is
-- owned by `postgres` and this modifies the `auth` schema. The `app` login
-- role cannot run it (not owner, no CREATE on `auth`, and recreating the views
-- as `app` would change their owner and break their RLS-bypass behavior).
--
-- Idempotent-ish and fully transactional. Rollback block at the bottom (only
-- valid BEFORE any non-UUID Firebase uid has been written — after that, the
-- text->uuid cast fails, which is expected: this is a one-way migration).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Drop the two admin views (they read uid columns). Recreated in step 8.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.customer_admin;
DROP VIEW IF EXISTS public.enquiry_admin;

-- ---------------------------------------------------------------------------
-- 2. Drop the 25 RLS policies that reference auth.uid() / the uid columns.
--    (This is exactly the set that depends on both auth.uid() AND the
--    converted columns — verified identical via pg_depend.) Recreated in
--    step 7 with unchanged expressions.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Read admins" ON public.admins;
DROP POLICY IF EXISTS "Update admins" ON public.admins;
DROP POLICY IF EXISTS "Customers can delete own comment" ON public.blog_comments;
DROP POLICY IF EXISTS "Customers can insert own comment" ON public.blog_comments;
DROP POLICY IF EXISTS "Delete blogs" ON public.blogs;
DROP POLICY IF EXISTS "Insert blogs" ON public.blogs;
DROP POLICY IF EXISTS "Read blogs" ON public.blogs;
DROP POLICY IF EXISTS "Update blogs" ON public.blogs;
DROP POLICY IF EXISTS "Customers delete own addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Customers insert own addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Customers read own addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Customers update own addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Users can insert own enquiry" ON public.enquiries;
DROP POLICY IF EXISTS "Users can read own enquiries" ON public.enquiries;
DROP POLICY IF EXISTS "Admins can view and manage store order items" ON public.order_items;
DROP POLICY IF EXISTS "Customers can view own order items" ON public.order_items;
DROP POLICY IF EXISTS "Admins can view and manage store orders" ON public.orders;
DROP POLICY IF EXISTS "Customers can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Customers can delete own review" ON public.product_reviews;
DROP POLICY IF EXISTS "Customers can insert own review" ON public.product_reviews;
DROP POLICY IF EXISTS "Customers can update own review" ON public.product_reviews;
DROP POLICY IF EXISTS "Read memberships" ON public.user_group_members;
DROP POLICY IF EXISTS "Customers can insert own row" ON public.users;
DROP POLICY IF EXISTS "Customers can read own row" ON public.users;
DROP POLICY IF EXISTS "Customers can update own row" ON public.users;

-- ---------------------------------------------------------------------------
-- 3. Drop the 7 FKs whose endpoints become text. (The two *_store_id_fkey FKs
--    stay — store_id + stores.id remain uuid.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.admins             DROP CONSTRAINT IF EXISTS profiles_invited_by_fkey;
ALTER TABLE public.blog_comments      DROP CONSTRAINT IF EXISTS blog_comments_customer_id_fkey;
ALTER TABLE public.blogs              DROP CONSTRAINT IF EXISTS blogs_submitted_by_fkey;
ALTER TABLE public.customer_addresses DROP CONSTRAINT IF EXISTS customer_addresses_user_id_fkey;
ALTER TABLE public.orders             DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;
ALTER TABLE public.product_reviews    DROP CONSTRAINT IF EXISTS product_reviews_customer_id_fkey;
ALTER TABLE public.user_group_members DROP CONSTRAINT IF EXISTS user_group_members_customer_id_fkey;

-- ---------------------------------------------------------------------------
-- 4. Retype auth.uid() -> text (drop the ::uuid cast). Safe now that the 25
--    policies are gone; nothing else hard-depends on it.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS auth.uid();
CREATE FUNCTION auth.uid()
  RETURNS text
  LANGUAGE sql
  STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

-- ---------------------------------------------------------------------------
-- 5. Convert the 25 uid-holding columns uuid -> text. Indexes / PKs / the one
--    unique constraint on these columns rebuild automatically.
-- ---------------------------------------------------------------------------
ALTER TABLE public.admins                 ALTER COLUMN id          TYPE text USING id::text;
ALTER TABLE public.admins                 ALTER COLUMN invited_by  TYPE text USING invited_by::text;
ALTER TABLE public.users                  ALTER COLUMN id          TYPE text USING id::text;
ALTER TABLE public.blog_comments          ALTER COLUMN user_id     TYPE text USING user_id::text;
ALTER TABLE public.blogs                  ALTER COLUMN created_by   TYPE text USING created_by::text;
ALTER TABLE public.blogs                  ALTER COLUMN submitted_by TYPE text USING submitted_by::text;
ALTER TABLE public.blogs                  ALTER COLUMN updated_by   TYPE text USING updated_by::text;
ALTER TABLE public.coupons                ALTER COLUMN created_by   TYPE text USING created_by::text;
ALTER TABLE public.coupons                ALTER COLUMN updated_by   TYPE text USING updated_by::text;
ALTER TABLE public.customer_addresses     ALTER COLUMN user_id     TYPE text USING user_id::text;
ALTER TABLE public.email_campaigns        ALTER COLUMN created_by   TYPE text USING created_by::text;
ALTER TABLE public.enquiries              ALTER COLUMN created_by   TYPE text USING created_by::text;
ALTER TABLE public.orders                 ALTER COLUMN customer_id  TYPE text USING customer_id::text;
ALTER TABLE public.product_reviews        ALTER COLUMN user_id     TYPE text USING user_id::text;
ALTER TABLE public.products               ALTER COLUMN created_by   TYPE text USING created_by::text;
ALTER TABLE public.products               ALTER COLUMN updated_by   TYPE text USING updated_by::text;
ALTER TABLE public.stock_movements        ALTER COLUMN created_by   TYPE text USING created_by::text;
ALTER TABLE public.store_billing_settings ALTER COLUMN updated_by   TYPE text USING updated_by::text;
ALTER TABLE public.store_brand_profiles   ALTER COLUMN updated_by   TYPE text USING updated_by::text;
ALTER TABLE public.store_menus            ALTER COLUMN updated_by   TYPE text USING updated_by::text;
ALTER TABLE public.store_pages            ALTER COLUMN created_by   TYPE text USING created_by::text;
ALTER TABLE public.store_pages            ALTER COLUMN updated_by   TYPE text USING updated_by::text;
ALTER TABLE public.user_group_members     ALTER COLUMN added_by     TYPE text USING added_by::text;
ALTER TABLE public.user_group_members     ALTER COLUMN user_id     TYPE text USING user_id::text;
ALTER TABLE public.user_groups            ALTER COLUMN created_by   TYPE text USING created_by::text;

-- ---------------------------------------------------------------------------
-- 6. Recreate the 7 FKs (now text -> text; ON DELETE behavior preserved).
-- ---------------------------------------------------------------------------
ALTER TABLE public.admins             ADD CONSTRAINT profiles_invited_by_fkey        FOREIGN KEY (invited_by)  REFERENCES public.admins(id) ON DELETE SET NULL;
ALTER TABLE public.blog_comments      ADD CONSTRAINT blog_comments_customer_id_fkey  FOREIGN KEY (user_id)     REFERENCES public.users(id)  ON DELETE CASCADE;
ALTER TABLE public.blogs              ADD CONSTRAINT blogs_submitted_by_fkey         FOREIGN KEY (submitted_by) REFERENCES public.users(id)  ON DELETE SET NULL;
ALTER TABLE public.customer_addresses ADD CONSTRAINT customer_addresses_user_id_fkey FOREIGN KEY (user_id)     REFERENCES public.users(id)  ON DELETE CASCADE;
ALTER TABLE public.orders             ADD CONSTRAINT orders_customer_id_fkey         FOREIGN KEY (customer_id)  REFERENCES public.users(id)  ON DELETE CASCADE;
ALTER TABLE public.product_reviews    ADD CONSTRAINT product_reviews_customer_id_fkey FOREIGN KEY (user_id)    REFERENCES public.users(id)  ON DELETE CASCADE;
ALTER TABLE public.user_group_members ADD CONSTRAINT user_group_members_customer_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)  ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 7. Recreate the 25 RLS policies (verbatim — captured from the live schema).
-- ---------------------------------------------------------------------------
CREATE POLICY "Read admins" ON public.admins AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT is_store_superadmin(admins.store_id) AS is_store_superadmin) OR (( SELECT auth.uid() AS uid) = id)));
CREATE POLICY "Update admins" ON public.admins AS PERMISSIVE FOR UPDATE TO public
  USING ((( SELECT is_store_superadmin(admins.store_id) AS is_store_superadmin) OR (( SELECT auth.uid() AS uid) = id)));
CREATE POLICY "Customers can delete own comment" ON public.blog_comments AS PERMISSIVE FOR DELETE TO public
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Customers can insert own comment" ON public.blog_comments AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.store_id = blog_comments.store_id))))));
CREATE POLICY "Delete blogs" ON public.blogs AS PERMISSIVE FOR DELETE TO public
  USING ((( SELECT is_store_admin(blogs.store_id) AS is_store_admin) OR ((submitted_by = ( SELECT auth.uid() AS uid)) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text])))));
CREATE POLICY "Insert blogs" ON public.blogs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((( SELECT is_store_admin(blogs.store_id) AS is_store_admin) OR ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.store_id = blogs.store_id)))) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text])) AND (submitted_by = ( SELECT auth.uid() AS uid)) AND (is_customer_submission = true))));
CREATE POLICY "Read blogs" ON public.blogs AS PERMISSIVE FOR SELECT TO public
  USING (((status = 'published'::text) OR ((submitted_by = ( SELECT auth.uid() AS uid)) AND (is_customer_submission = true)) OR ( SELECT is_store_admin(blogs.store_id) AS is_store_admin)));
CREATE POLICY "Update blogs" ON public.blogs AS PERMISSIVE FOR UPDATE TO public
  USING ((( SELECT is_store_admin(blogs.store_id) AS is_store_admin) OR ((submitted_by = ( SELECT auth.uid() AS uid)) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text])))))
  WITH CHECK ((( SELECT is_store_admin(blogs.store_id) AS is_store_admin) OR ((submitted_by = ( SELECT auth.uid() AS uid)) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text])))));
CREATE POLICY "Customers delete own addresses" ON public.customer_addresses AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Customers insert own addresses" ON public.customer_addresses AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Customers read own addresses" ON public.customer_addresses AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Customers update own addresses" ON public.customer_addresses AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can insert own enquiry" ON public.enquiries AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((( SELECT auth.uid() AS uid) = created_by));
CREATE POLICY "Users can read own enquiries" ON public.enquiries AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.uid() AS uid) = created_by));
CREATE POLICY "Admins can view and manage store order items" ON public.order_items AS PERMISSIVE FOR ALL TO authenticated
  USING ((order_id IN ( SELECT orders.id
   FROM orders
  WHERE (orders.store_id IN ( SELECT admins.store_id
           FROM admins
          WHERE (admins.id = auth.uid()))))));
CREATE POLICY "Customers can view own order items" ON public.order_items AS PERMISSIVE FOR SELECT TO authenticated
  USING ((order_id IN ( SELECT orders.id
   FROM orders
  WHERE (orders.customer_id = auth.uid()))));
CREATE POLICY "Admins can view and manage store orders" ON public.orders AS PERMISSIVE FOR ALL TO authenticated
  USING ((store_id IN ( SELECT admins.store_id
   FROM admins
  WHERE (admins.id = auth.uid()))));
CREATE POLICY "Customers can view own orders" ON public.orders AS PERMISSIVE FOR SELECT TO authenticated
  USING ((customer_id = auth.uid()));
CREATE POLICY "Customers can delete own review" ON public.product_reviews AS PERMISSIVE FOR DELETE TO public
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Customers can insert own review" ON public.product_reviews AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.store_id = product_reviews.store_id))))));
CREATE POLICY "Customers can update own review" ON public.product_reviews AS PERMISSIVE FOR UPDATE TO public
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Read memberships" ON public.user_group_members AS PERMISSIVE FOR SELECT TO public
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT is_store_admin(user_group_members.store_id) AS is_store_admin)));
CREATE POLICY "Customers can insert own row" ON public.users AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "Customers can read own row" ON public.users AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "Customers can update own row" ON public.users AS PERMISSIVE FOR UPDATE TO public
  USING ((( SELECT auth.uid() AS uid) = id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));

-- ---------------------------------------------------------------------------
-- 8. Recreate the two admin views + their grants (owner = the running
--    superuser = postgres; NOT security_invoker, matching the original).
-- ---------------------------------------------------------------------------
CREATE VIEW public.customer_admin AS
 SELECT u.id,
    u.phone,
    u.email,
    u.first_name,
    u.last_name,
    u.created_at,
    u.updated_at,
    COALESCE(r.cnt, 0::bigint) AS review_count,
    COALESCE(b.cnt, 0::bigint) AS blog_count,
    COALESCE(r.cnt, 0::bigint) + COALESCE(b.cnt, 0::bigint) AS activity_count,
    u.store_id
   FROM users u
     LEFT JOIN ( SELECT product_reviews.user_id,
            count(*) AS cnt
           FROM product_reviews
          GROUP BY product_reviews.user_id) r ON r.user_id = u.id
     LEFT JOIN ( SELECT blogs.submitted_by,
            count(*) AS cnt
           FROM blogs
          WHERE blogs.is_customer_submission
          GROUP BY blogs.submitted_by) b ON b.submitted_by = u.id;

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
   FROM enquiries e;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_admin TO app_user, app_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enquiry_admin  TO app_user, app_service;

COMMIT;

-- =============================================================================
-- ROLLBACK (text -> uuid). ONLY valid while every uid value is still a valid
-- UUID string (i.e. BEFORE any Identity Platform-native signup). Once a 28-char
-- Firebase uid exists, `::uuid` will fail — by design; this is a one-way change.
-- To roll back, run the block below (uncommented) as postgres:
-- =============================================================================
-- BEGIN;
-- DROP VIEW IF EXISTS public.customer_admin;
-- DROP VIEW IF EXISTS public.enquiry_admin;
-- -- (drop the same 25 policies as step 2 above)
-- -- (drop the same 7 FKs as step 3 above)
-- DROP FUNCTION IF EXISTS auth.uid();
-- CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
--   SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid $$;
-- GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
-- -- Reverse the 25 column types (uuid via ::uuid), e.g.:
-- --   ALTER TABLE public.admins ALTER COLUMN id TYPE uuid USING id::uuid;
-- --   ... (repeat for all 25 columns from step 5)
-- -- (recreate the same 7 FKs as step 6, the same 25 policies as step 7,
-- --  and the same 2 views + grants as step 8)
-- COMMIT;
