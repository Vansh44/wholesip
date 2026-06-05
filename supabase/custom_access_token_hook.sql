-- =============================================================
-- Custom Access Token Hook
-- Embeds `user_role` and `force_password_reset` from `profiles`
-- into the JWT as custom claims, so the middleware can authorize
-- dashboard routes without a per-request DB query.
--
-- AFTER running this migration you MUST enable the hook:
--   Supabase Dashboard → Authentication → Hooks (Auth Hooks)
--     → "Customize Access Token (JWT) Claims"
--     → select `public.custom_access_token_hook`
--   (Local dev: add to supabase/config.toml:
--     [auth.hook.custom_access_token]
--     enabled = true
--     uri = "pg-functions://postgres/public/custom_access_token_hook")
--
-- NOTE: claims are refreshed only when a token is issued/refreshed
-- (login, refresh, updateUser, refreshSession). A role change therefore
-- takes effect on the user's next token refresh (≤ JWT expiry, default 1h).
-- Privileged *mutations* are still re-checked against the DB in server
-- actions, so a stale claim only affects route-level navigation gating.
-- =============================================================

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
  FROM public.profiles
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';

  -- Always set both claims (use null/false defaults) so the middleware can
  -- reliably detect "claims are present" vs "hook not enabled".
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

-- The auth admin role runs the hook; grant it the minimum needed access.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;

-- Don't let regular API roles invoke the hook directly.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook
  FROM authenticated, anon, public;

-- RLS is enabled on profiles; allow the auth admin to read it for the hook.
DROP POLICY IF EXISTS "Auth admin can read profiles for token hook" ON public.profiles;
CREATE POLICY "Auth admin can read profiles for token hook"
  ON public.profiles FOR SELECT
  TO supabase_auth_admin
  USING (true);
