-- =============================================================
-- media_assets — per-store media library (images uploaded via /dashboard/media).
-- One row per uploaded object: the file lives in the GCS media bucket, this row
-- is the library record used to list / view / delete / copy-URL. The object URL
-- is public (public bucket), but the LISTING is admin-only (this metadata table
-- is not exposed to anon/customers).
--
-- ⚠ Run as `postgres` against the target Cloud SQL instance (through the Cloud
-- SQL Auth Proxy), exactly like the other migrations. New public-schema tables
-- created by postgres inherit app_user/app_service grants from the
-- ALTER DEFAULT PRIVILEGES in drizzle/manual/0000_compat_setup.sql, so no
-- explicit GRANTs are needed here. Idempotent.
-- =============================================================

CREATE TABLE IF NOT EXISTS media_assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,               -- public object URL
  path         TEXT NOT NULL,               -- in-bucket GCS path (used for deletion)
  filename     TEXT NOT NULL DEFAULT '',    -- original filename (display/search)
  content_type TEXT NOT NULL DEFAULT '',
  size_bytes   INTEGER NOT NULL DEFAULT 0,  -- stored (optimized) size in bytes
  created_by   TEXT,                        -- uploader uid (Firebase uid = text, Phase 6)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Newest-first listing scoped to a store (the library query's shape).
CREATE INDEX IF NOT EXISTS media_assets_store_created_idx
  ON media_assets (store_id, created_at DESC);

-- ---- RLS: store admins manage their own store's media; NOT public ----
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store admins manage media_assets" ON media_assets;
CREATE POLICY "Store admins manage media_assets"
  ON media_assets FOR ALL
  USING ((SELECT is_store_admin(store_id)))
  WITH CHECK ((SELECT is_store_admin(store_id)));

-- =============================================================
-- Rollback:
--   DROP TABLE IF EXISTS media_assets CASCADE;
-- =============================================================
