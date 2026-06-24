-- =============================================================
-- Source of truth for the is_superadmin() helper used by the superadmin RLS
-- policies on public.admins (read-all / insert / update / delete).
--
-- This function was originally created directly in Supabase (not in this repo).
-- During the profiles -> admins rename it kept querying public.profiles, and
-- because plpgsql resolves table names at RUNTIME it errored on every
-- evaluation — which broke the Admins list ("Failed to load users"). Keep this
-- file so a fresh/rebuilt database gets the correct definition.
--
-- SECURITY DEFINER so the lookup bypasses RLS on `admins` (no recursion).
-- search_path is pinned and every reference is schema-qualified.
-- Apply by hand in the Supabase SQL Editor. Idempotent (CREATE OR REPLACE).
-- =============================================================

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE id = auth.uid() AND role = 'superadmin'
  );
END;
$$;
