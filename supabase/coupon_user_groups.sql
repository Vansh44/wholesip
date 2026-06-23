-- =============================================================
-- Supabase migration: coupon ↔ user group restrictions
-- A coupon with NO rows here is public (anyone can apply it, as today).
-- A coupon WITH rows here is restricted: only logged-in users who belong
-- to one of the listed groups may apply it (enforced in validateCoupon).
-- Apply by hand in the Supabase SQL Editor (service key can't run DDL).
-- Idempotent: safe to re-run. Depends on coupons_table.sql + user_groups_table.sql.
-- =============================================================

CREATE TABLE IF NOT EXISTS coupon_user_groups (
  coupon_id  UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (coupon_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_cug_coupon ON coupon_user_groups (coupon_id);
CREATE INDEX IF NOT EXISTS idx_cug_group ON coupon_user_groups (group_id);

-- =============================================================
-- Row Level Security
-- =============================================================
ALTER TABLE coupon_user_groups ENABLE ROW LEVEL SECURITY;

-- Public SELECT: validateCoupon (callable by anonymous shoppers) needs to know
-- whether a coupon is restricted and to which groups. The group IDs alone are
-- not sensitive — the actual membership check happens against the shopper's
-- own (RLS-protected) rows in user_group_members.
DROP POLICY IF EXISTS "Public can read coupon group links" ON coupon_user_groups;
CREATE POLICY "Public can read coupon group links"
  ON coupon_user_groups FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can write coupon group links" ON coupon_user_groups;
CREATE POLICY "Admins can write coupon group links"
  ON coupon_user_groups FOR ALL
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
