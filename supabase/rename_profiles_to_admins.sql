-- =============================================================
-- ONE-TIME migration: rename the `profiles` table to `admins`.
-- Run this ONCE, by hand, in the Supabase SQL Editor.
--
-- Postgres tracks dependencies by OID, so RLS policies and foreign keys that
-- reference this table (in coupons, user_groups, blogs, etc.) keep working
-- automatically after the rename — they do NOT need to be recreated.
--
-- The EXCEPTION is the custom access-token hook: it's a plpgsql function whose
-- body resolves table names at RUNTIME, so we recreate it to read from `admins`.
-- If you skip that step, login breaks (the hook errors on a missing table).
--
-- Idempotent-ish: the ALTER fails harmlessly if already renamed — guard with
-- the IF check below so re-running is safe.
-- =============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admins'
  ) THEN
    ALTER TABLE public.profiles RENAME TO admins;
  END IF;
END $$;

-- Recreate the access-token hook so it reads from the renamed table.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  v_role text;
  v_force boolean;
BEGIN
  SELECT role, force_password_reset
    INTO v_role, v_force
  FROM public.admins
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';

  claims := jsonb_set(
    claims,
    '{user_role}',
    CASE WHEN v_role IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_role) END
  );
  claims := jsonb_set(
    claims,
    '{force_password_reset}',
    to_jsonb(COALESCE(v_force, false))
  );

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Re-grant read access on the renamed table to the auth admin (grants follow
-- the table by OID, but this is explicit + safe to re-run).
GRANT SELECT ON TABLE public.admins TO supabase_auth_admin;

DROP POLICY IF EXISTS "Auth admin can read profiles for token hook" ON public.admins;
DROP POLICY IF EXISTS "Auth admin can read admins for token hook" ON public.admins;
CREATE POLICY "Auth admin can read admins for token hook"
  ON public.admins FOR SELECT
  TO supabase_auth_admin
  USING (true);
