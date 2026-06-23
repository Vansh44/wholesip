-- =============================================================
-- ONE-TIME migration: rename the `customers` table to `users`, and the
-- `customer_id` columns to `user_id` on the tables that reference it.
-- Run this ONCE, by hand, in the Supabase SQL Editor.
--
-- Postgres tracks dependencies by OID, so foreign keys and RLS policies that
-- reference these objects keep working after the rename — no policy recreation
-- needed. Each statement is guarded so re-running is safe.
--
-- NOTE: this is the storefront `public.users` table (renamed from customers).
-- It is distinct from Supabase's `auth.users`.
-- =============================================================

-- 1) Rename the table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customers'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    ALTER TABLE public.customers RENAME TO users;
  END IF;
END $$;

-- 2) Rename customer_id -> user_id wherever it exists.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_reviews', 'blog_comments', 'user_group_members']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'customer_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I RENAME COLUMN customer_id TO user_id', t);
    END IF;
  END LOOP;
END $$;
