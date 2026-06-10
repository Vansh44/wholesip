-- =============================================================
-- Roles & Permissions — custom dashboard roles. Each role carries a
-- `permissions` map of { section_key: ["view","manage"] } that controls
-- which dashboard sections an admin holding that role can see and edit.
--
-- profiles.role stores a role *slug* (e.g. 'superadmin', 'member',
-- 'support'). The two system roles below are seeded and cannot be
-- deleted from the UI.
--
-- Apply by hand in the Supabase SQL Editor. Idempotent: safe to re-run.
-- =============================================================

CREATE TABLE IF NOT EXISTS roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,                          -- display label, e.g. 'Support'
  slug         TEXT NOT NULL UNIQUE,                    -- machine key stored in profiles.role
  description  TEXT,
  permissions  JSONB NOT NULL DEFAULT '{}'::jsonb,      -- { "products": ["view","manage"], ... }
  color        TEXT NOT NULL DEFAULT 'grey',            -- pill tone: grey | blue | green | amber | violet
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,          -- system roles can't be deleted / re-slugged
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_name_lower ON roles (LOWER(name));

-- Keep updated_at fresh. Reuse the shared catalog trigger fn if present,
-- otherwise fall back to an inline one.
CREATE OR REPLACE FUNCTION set_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roles_updated_at_trigger ON roles;
CREATE TRIGGER roles_updated_at_trigger
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_roles_updated_at();

-- ---------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Any signed-in user may read roles (the dashboard shell needs the
-- caller's own role to build navigation; the Admins page lists roles).
DROP POLICY IF EXISTS "Authenticated can read roles" ON roles;
CREATE POLICY "Authenticated can read roles"
  ON roles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only superadmins write through RLS. The server actions additionally use
-- the service-role client, so this is a defense-in-depth backstop.
DROP POLICY IF EXISTS "Superadmins can insert roles" ON roles;
CREATE POLICY "Superadmins can insert roles"
  ON roles FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
  ));

DROP POLICY IF EXISTS "Superadmins can update roles" ON roles;
CREATE POLICY "Superadmins can update roles"
  ON roles FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
  ));

DROP POLICY IF EXISTS "Superadmins can delete roles" ON roles;
CREATE POLICY "Superadmins can delete roles"
  ON roles FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
  ));

-- ---------------------------------------------------------------
-- Seed the two system roles (insert only if missing; never clobber
-- edits an admin has made to the member role's permissions).
-- ---------------------------------------------------------------

-- Superadmin: full access is granted in code (bypasses the permission
-- map), but we store a complete map for display.
INSERT INTO roles (name, slug, description, color, is_system, permissions)
SELECT
  'Superadmin', 'superadmin',
  'Full, unrestricted access to every section of the dashboard.',
  'violet', TRUE,
  '{
    "dashboard":["view"],"orders":["view","manage"],"products":["view","manage"],
    "categories":["view","manage"],"colors":["view","manage"],"users":["view","manage"],
    "inventory":["view","manage"],"analytics":["view"],"blogs":["view","manage"],
    "marketing":["view","manage"],"promotions":["view","manage"],"admins":["view","manage"],
    "media":["view","manage"],"roles":["view","manage"],"activity":["view"],"settings":["view","manage"]
  }'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE slug = 'superadmin');

-- Member: a general operational admin — runs the catalog & content, but
-- not the Administration area (admins, roles, settings).
INSERT INTO roles (name, slug, description, color, is_system, permissions)
SELECT
  'Member', 'member',
  'Standard admin. Manages catalog and content, but not the Administration area.',
  'blue', TRUE,
  '{
    "dashboard":["view"],"orders":["view","manage"],"products":["view","manage"],
    "categories":["view","manage"],"colors":["view","manage"],"users":["view"],
    "inventory":["view","manage"],"analytics":["view"],"blogs":["view","manage"],
    "marketing":["view","manage"],"promotions":["view","manage"],"media":["view","manage"]
  }'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE slug = 'member');
