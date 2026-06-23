-- Create users table for storefront users (separate from admin admins)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at_trigger
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Customers can read their own row
CREATE POLICY "Customers can read own row"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- Customers can update their own row
CREATE POLICY "Customers can update own row"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Customers can insert their own row (for profile completion)
CREATE POLICY "Customers can insert own row"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Allow service_role full access (for admin operations)
-- service_role bypasses RLS by default, so no explicit policy needed.
