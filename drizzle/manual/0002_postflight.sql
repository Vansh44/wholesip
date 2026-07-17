-- Phase 5 — postflight: run AFTER 0001_schema.sql on a fresh DB.
--
-- 1. Remove the auth.users scaffold. The dump created FOREIGN KEYs to auth.users
--    (created_by / updated_by / users.id); identity lives OUTSIDE the DB
--    (Supabase now, Identity Platform in Phase 6), so the DB must not own that
--    reference. The columns stay as plain uuids — referential integrity to the
--    identity system is enforced by the app.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname
    FROM pg_constraint c
    JOIN pg_class ct ON ct.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = ct.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'auth' AND ct.relname = 'users'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

DROP TABLE IF EXISTS auth.users;

-- 2. Final grants to the app roles for the objects 0001 just created (belt-and-
--    suspenders alongside the ALTER DEFAULT PRIVILEGES in 0000). RLS still gates
--    app_user's row visibility on top of these.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO app_user, app_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, app_service;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user, app_service;
