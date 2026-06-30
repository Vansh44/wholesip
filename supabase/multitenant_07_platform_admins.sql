-- =============================================================
-- MULTI-TENANT — Phase 3d-1a: platform admins (Storemink operators)
--
-- A platform admin operates the WHOLE platform (storemink.com/dashboard) and
-- can enter ANY store's dashboard — distinct from a store admin, who is scoped
-- to one store. Keyed by EMAIL and checked via auth.email() (the JWT email),
-- so an operator is recognised on first login even before an account exists.
--
-- Grants god access by adding `is_platform_admin() OR ...` to the store RLS
-- helpers, so platform admins pass every store's policies.
-- Idempotent. Reversible via _rollback.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.platform_admins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  role        text NOT NULL DEFAULT 'member'
                CHECK (role IN ('superadmin', 'member')),
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  invited_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Helpers (SECURITY DEFINER; mirror is_superadmin's security model).
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE lower(email) = lower(auth.email())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE lower(email) = lower(auth.email()) AND role = 'superadmin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_superadmin() TO anon, authenticated;
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.platform_admins TO authenticated;

-- Policies: any platform admin can read the roster + own row; only a platform
-- superadmin can change it. (Seeding/self-serve uses the service role.)
DROP POLICY IF EXISTS "Read platform_admins" ON public.platform_admins;
CREATE POLICY "Read platform_admins" ON public.platform_admins FOR SELECT TO public
  USING ((SELECT is_platform_admin()) OR lower(email) = lower(auth.email()));
DROP POLICY IF EXISTS "Insert platform_admins" ON public.platform_admins;
CREATE POLICY "Insert platform_admins" ON public.platform_admins FOR INSERT TO public
  WITH CHECK ((SELECT is_platform_superadmin()));
DROP POLICY IF EXISTS "Update platform_admins" ON public.platform_admins;
CREATE POLICY "Update platform_admins" ON public.platform_admins FOR UPDATE TO public
  USING ((SELECT is_platform_superadmin())) WITH CHECK ((SELECT is_platform_superadmin()));
DROP POLICY IF EXISTS "Delete platform_admins" ON public.platform_admins;
CREATE POLICY "Delete platform_admins" ON public.platform_admins FOR DELETE TO public
  USING ((SELECT is_platform_superadmin()));

-- Seed the founder as platform superadmin.
INSERT INTO public.platform_admins (email, role)
VALUES ('iamvanshgupta01@gmail.com', 'superadmin')
ON CONFLICT (email) DO UPDATE SET role = 'superadmin';

-- A platform admin is an implicit superadmin of EVERY store.
CREATE OR REPLACE FUNCTION public.is_store_admin(target_store uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.admins
    WHERE id = auth.uid()
      AND role = ANY (ARRAY['superadmin', 'member'])
      AND store_id = target_store
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_store_superadmin(target_store uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.admins
    WHERE id = auth.uid() AND role = 'superadmin' AND store_id = target_store
  );
END;
$$;
