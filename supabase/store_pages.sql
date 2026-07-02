-- =============================================================
-- store_pages — the website builder's per-store custom pages.
--
-- Each row is one storefront page (slug unique per store) built from an
-- ordered `sections` jsonb array ([{id,type,enabled,config}] — shapes validated
-- in the app layer, see lib/sections/registry.ts). Draft vs live:
--   `sections`            = the working draft (edited in /dashboard/builder)
--   `published_sections`  = the live snapshot shown to visitors
-- Publishing copies sections -> published_sections and stamps published_at.
--
-- slug '' is reserved as the future homepage sentinel (phase 4 migration);
-- it is not creatable through the builder today.
--
-- Apply via Supabase MCP / SQL editor. Idempotent: safe to re-run.
-- =============================================================

CREATE TABLE IF NOT EXISTS store_pages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  slug               TEXT NOT NULL
                       CHECK (slug = '' OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title              TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'published')),
  seo_title          TEXT NOT NULL DEFAULT '',
  seo_description    TEXT NOT NULL DEFAULT '',
  seo_noindex        BOOLEAN NOT NULL DEFAULT FALSE,
  sections           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- working draft
  published_sections JSONB NOT NULL DEFAULT '[]'::jsonb,  -- live snapshot
  published_at       TIMESTAMPTZ,
  created_by         UUID,
  updated_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_store_pages_store
  ON store_pages (store_id, status);

-- Reuse the shared catalog updated_at trigger fn (products_categories.sql).
DROP TRIGGER IF EXISTS store_pages_updated_at_trigger ON store_pages;
CREATE TRIGGER store_pages_updated_at_trigger
  BEFORE UPDATE ON store_pages
  FOR EACH ROW EXECUTE FUNCTION update_catalog_updated_at();

-- =============================================================
-- Row Level Security.
--   • public (anon) may read only PUBLISHED rows;
--   • store admins (incl. platform admins, via is_store_admin) may do anything
--     to their own store's rows.
-- =============================================================
ALTER TABLE store_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published store_pages" ON store_pages;
CREATE POLICY "Public read published store_pages"
  ON store_pages FOR SELECT
  USING (status = 'published' OR (SELECT is_store_admin(store_id)));

DROP POLICY IF EXISTS "Admins insert store_pages" ON store_pages;
CREATE POLICY "Admins insert store_pages"
  ON store_pages FOR INSERT
  WITH CHECK ((SELECT is_store_admin(store_id)));

DROP POLICY IF EXISTS "Admins update store_pages" ON store_pages;
CREATE POLICY "Admins update store_pages"
  ON store_pages FOR UPDATE
  USING ((SELECT is_store_admin(store_id)))
  WITH CHECK ((SELECT is_store_admin(store_id)));

DROP POLICY IF EXISTS "Admins delete store_pages" ON store_pages;
CREATE POLICY "Admins delete store_pages"
  ON store_pages FOR DELETE
  USING ((SELECT is_store_admin(store_id)));

-- =============================================================
-- Column-level hardening. RLS is ROW-level: the public-read policy would
-- otherwise expose the DRAFT `sections` column (and audit columns) of a
-- published row to anyone via PostgREST. So we revoke blanket SELECT and grant
-- back only the columns the storefront needs — WITHOUT `sections`. The draft
-- column is therefore unreadable by anon AND by logged-in customers; the
-- builder and preview loaders read it with the service-role client only, after
-- an app-layer permission check (see app/actions/page-actions.ts,
-- lib/pages/preview.ts). Consequently, storefront reads MUST select named
-- columns, never `*`.
-- =============================================================
REVOKE SELECT ON store_pages FROM anon, authenticated;
GRANT SELECT (
  id, store_id, slug, title, status,
  seo_title, seo_description, seo_noindex,
  published_sections, published_at, created_at, updated_at
) ON store_pages TO anon, authenticated;

-- =============================================================
-- ROLLBACK (uncomment to fully undo):
-- DROP TABLE IF EXISTS store_pages CASCADE;
-- =============================================================
