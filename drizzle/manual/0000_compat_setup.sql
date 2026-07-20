-- Phase 5 — prepare a fresh Postgres (Cloud SQL) to accept our schema + the 2A
-- tenancy model. Apply the drizzle/manual/ files IN ORDER on a new environment
-- (local/staging/prod) — see drizzle/manual/README.md:
--   0000_compat_setup.sql  → this file (extensions, shim, roles, stub)
--   0001_schema.sql        → the full faithful schema (functions/tables/policies/triggers)
--   0002_postflight.sql    → drop the auth.users scaffold + final grants
-- Idempotent. NOTE: the drizzle-kit baseline (drizzle/0000_*.sql) is NOT used to
-- build a DB — it drops function/trigger definitions AND some policy WITH CHECK
-- expressions on introspection, so it would create insecure RLS. It survives
-- only as drizzle-kit's snapshot for generating FUTURE incremental migrations.

-- 1. Extensions the schema depends on (pg_trgm backs the users trigram indexes).
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;

-- 2. The auth.uid()/auth.email() compatibility shim — RLS reads the per-request
--    GUC (set by the app via SET LOCAL) instead of Supabase's auth functions.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
  $$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_user_email', true), '')
  $$;

-- 2b. Stub auth.users so 0001_schema.sql's FOREIGN KEY … REFERENCES auth.users
--     statements load. It's a load-time scaffold only — 0002_postflight.sql
--     drops these FKs and this table (identity lives outside the DB: Supabase
--     now, Identity Platform in Phase 6, so the DB must not own that reference).
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  phone text
);

-- 3. Supabase roles the dumped RLS policies target (NOLOGIN placeholders).
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_auth_admin NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. The two application roles (the 2A model):
--    * app_user    — RLS ENFORCED. Member of anon+authenticated so the existing
--                    policies apply to it. Used for user + anonymous requests;
--                    the app SETs app.current_user_id per request (or leaves it
--                    unset for anon → only public policy branches match).
--    * app_service — BYPASSRLS. The service-role path (validated app-layer
--                    store scoping), replaces the Supabase service key.
DO $$ BEGIN CREATE ROLE app_user NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE app_service NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT anon, authenticated TO app_user;

-- 5. Privileges on current + future objects for both app roles (RLS still gates
--    app_user's row visibility on top of these table grants).
GRANT USAGE ON SCHEMA public TO app_user, app_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user, app_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, app_service;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user, app_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, app_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user, app_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO app_user, app_service;

-- 6. Policies call auth.uid()/auth.email() DIRECTLY (the customer-own branches),
--    evaluated as the querying role — so those roles need access to the auth
--    schema (Supabase grants this to authenticated/anon; we mirror it). Placed
--    last, after every role above exists.
GRANT USAGE ON SCHEMA auth TO anon, authenticated, app_user, app_service;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.email()
  TO anon, authenticated, app_user, app_service;
