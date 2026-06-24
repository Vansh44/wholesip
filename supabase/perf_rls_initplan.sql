-- =============================================================
-- Performance: fix the Supabase advisor's `auth_rls_initplan` warnings.
-- Wraps auth.uid()/auth.role()/auth.jwt()/auth.email()/is_superadmin() inside
-- a scalar (SELECT ...) so Postgres evaluates them ONCE per query (initplan)
-- instead of once per row. Semantically identical (these are STABLE within a
-- statement); the only change is evaluation count.
--
-- Rebuilds each affected policy FROM ITS LIVE DEFINITION, preserving command,
-- roles, and PERMISSIVE/RESTRICTIVE. Atomic (one transaction). Idempotent:
-- re-running is a no-op once everything is already wrapped (the regex only
-- matches bare calls). Already applied to the live DB via MCP.
-- =============================================================
DO $$
DECLARE
  r record;
  stmt text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check,
      regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(qual,''),
        'auth\.uid\(\)','(SELECT auth.uid())','g'),
        'auth\.role\(\)','(SELECT auth.role())','g'),
        'auth\.jwt\(\)','(SELECT auth.jwt())','g'),
        'auth\.email\(\)','(SELECT auth.email())','g'),
        'is_superadmin\(\)','(SELECT is_superadmin())','g') AS q2,
      regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(with_check,''),
        'auth\.uid\(\)','(SELECT auth.uid())','g'),
        'auth\.role\(\)','(SELECT auth.role())','g'),
        'auth\.jwt\(\)','(SELECT auth.jwt())','g'),
        'auth\.email\(\)','(SELECT auth.email())','g'),
        'is_superadmin\(\)','(SELECT is_superadmin())','g') AS wc2
    FROM pg_policies
    WHERE schemaname = 'public'
      AND ( qual ~ 'auth\.(uid|role|jwt|email)\(\)' OR qual ~ 'is_superadmin\(\)'
         OR with_check ~ 'auth\.(uid|role|jwt|email)\(\)' OR with_check ~ 'is_superadmin\(\)' )
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    stmt := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
                   r.policyname, r.tablename, r.permissive, r.cmd,
                   array_to_string(r.roles, ', '));
    IF r.cmd IN ('SELECT','DELETE','UPDATE','ALL') AND nullif(r.qual,'') IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', r.q2);
    END IF;
    IF r.cmd IN ('INSERT','UPDATE','ALL') AND nullif(r.with_check,'') IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', r.wc2);
    END IF;
    EXECUTE stmt;
  END LOOP;
END $$;
