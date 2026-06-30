-- =============================================================
-- ROLLBACK for multitenant_07_platform_admins.sql
-- Restores the store helpers to their non-platform form and drops the
-- platform_admins table + helpers. Idempotent.
-- =============================================================

CREATE OR REPLACE FUNCTION public.is_store_admin(target_store uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
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
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE id = auth.uid() AND role = 'superadmin' AND store_id = target_store
  );
END;
$$;

DROP FUNCTION IF EXISTS public.is_platform_admin();
DROP FUNCTION IF EXISTS public.is_platform_superadmin();
DROP TABLE IF EXISTS public.platform_admins;
