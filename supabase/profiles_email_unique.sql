-- =============================================================
-- Enforce unique emails on profiles
-- `profiles.email` had no uniqueness guarantee, so two auth accounts could
-- share an email (e.g. a phone account with a manually-inserted profile that
-- reused another user's email). This adds a case-insensitive unique index.
-- =============================================================

-- STEP 1 (run first, inspect output): find existing duplicates.
--   SELECT lower(email) AS email, count(*), array_agg(id) AS profile_ids
--   FROM profiles
--   WHERE email IS NOT NULL AND email <> ''
--   GROUP BY lower(email)
--   HAVING count(*) > 1;
--
-- Resolve each duplicate before continuing — delete the redundant account, e.g.:
--   -- delete the profile row only:
--   DELETE FROM profiles WHERE id = '<redundant-profile-id>';
--   -- or remove the whole auth account (cascades to profiles):
--   -- (run via the dashboard Users screen, or)
--   -- select auth.uid(); then use the Auth admin API / dashboard.

-- STEP 2: normalize blank emails to NULL so they don't collide with each other
-- (a UNIQUE index permits multiple NULLs, but not multiple empty strings).
UPDATE profiles SET email = NULL WHERE email = '';

-- STEP 3: normalize case so Foo@x.com and foo@x.com are treated as one address.
UPDATE profiles SET email = lower(email) WHERE email IS NOT NULL;

-- STEP 4: add the case-insensitive unique index. Fails if STEP 1 duplicates
-- remain — that's intentional.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_ci
  ON profiles (lower(email))
  WHERE email IS NOT NULL;
