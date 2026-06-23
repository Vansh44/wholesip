-- =============================================================
-- Supabase migration: user groups (segments of storefront users)
-- Managed from the dashboard (Users → User Groups). A customer can belong
-- to many groups; a group can hold many users (many-to-many via
-- user_group_members). Groups are reused to restrict coupons to specific
-- users and to target marketing emails.
-- Apply by hand in the Supabase SQL Editor (service key can't run DDL).
-- Idempotent: safe to re-run.
-- =============================================================

CREATE TABLE IF NOT EXISTS user_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  description  TEXT,
  color        TEXT NOT NULL DEFAULT 'blue',     -- badge tone: grey|blue|green|amber|violet
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_groups_name ON user_groups (name);

-- Membership join table. Composite PK keeps a customer in a group at most once.
CREATE TABLE IF NOT EXISTS user_group_members (
  group_id     UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ugm_customer ON user_group_members (user_id);
CREATE INDEX IF NOT EXISTS idx_ugm_group ON user_group_members (group_id);

-- -------------------------------------------------------------
-- updated_at trigger (reuses the shared catalog function; redefined
-- here so this file is self-contained)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_groups_updated_at_trigger ON user_groups;
CREATE TRIGGER user_groups_updated_at_trigger
  BEFORE UPDATE ON user_groups
  FOR EACH ROW EXECUTE FUNCTION update_catalog_updated_at();

-- =============================================================
-- Row Level Security
-- Dashboard reads/writes go through the service-role admin client (bypasses
-- RLS). These policies cover the session-scoped paths: admins managing in the
-- dashboard with their own session, and a logged-in shopper reading their own
-- memberships so coupon validation can check group membership at checkout.
-- =============================================================
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_group_members ENABLE ROW LEVEL SECURITY;

-- ---- user_groups: admin-only ----
DROP POLICY IF EXISTS "Admins can read user_groups" ON user_groups;
CREATE POLICY "Admins can read user_groups"
  ON user_groups FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM admins
    WHERE admins.id = auth.uid()
      AND admins.role IN ('superadmin', 'member')
  ));

DROP POLICY IF EXISTS "Admins can write user_groups" ON user_groups;
CREATE POLICY "Admins can write user_groups"
  ON user_groups FOR ALL
  USING (EXISTS (
    SELECT 1 FROM admins
    WHERE admins.id = auth.uid()
      AND admins.role IN ('superadmin', 'member')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM admins
    WHERE admins.id = auth.uid()
      AND admins.role IN ('superadmin', 'member')
  ));

-- ---- user_group_members ----
-- A logged-in customer may read the rows that are theirs — coupon validation
-- (server action, customer session) checks this to enforce group-restricted
-- coupons. They cannot see other users' memberships.
DROP POLICY IF EXISTS "Customers can read own memberships" ON user_group_members;
CREATE POLICY "Customers can read own memberships"
  ON user_group_members FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read memberships" ON user_group_members;
CREATE POLICY "Admins can read memberships"
  ON user_group_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM admins
    WHERE admins.id = auth.uid()
      AND admins.role IN ('superadmin', 'member')
  ));

DROP POLICY IF EXISTS "Admins can write memberships" ON user_group_members;
CREATE POLICY "Admins can write memberships"
  ON user_group_members FOR ALL
  USING (EXISTS (
    SELECT 1 FROM admins
    WHERE admins.id = auth.uid()
      AND admins.role IN ('superadmin', 'member')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM admins
    WHERE admins.id = auth.uid()
      AND admins.role IN ('superadmin', 'member')
  ));
