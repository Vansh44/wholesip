-- Add first_name (NOT NULL with default) and last_name (nullable) to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Backfill existing users: derive first_name from email
UPDATE profiles
SET first_name = INITCAP(SPLIT_PART(SPLIT_PART(email, '@', 1), '.', 1))
WHERE first_name = '' OR first_name IS NULL;
