-- =============================================================
-- Phase 4a — migrate the homepage into the pages system.
--
-- The storefront homepage is now a store_pages row with the empty slug ("" —
-- the "homepage sentinel"), edited in /dashboard/builder like any other page.
-- This converts each store's legacy homepage_sections rows into that row's
-- `sections` + `published_sections` (published), preserving type/enabled/config
-- and order (sort_order).
--
-- The old `homepage_sections` table is left in place (deprecated, no longer
-- read or written by the app) so this migration is reversible — it is the
-- rollback source. Drop it in a later migration once the new homepage is
-- verified in production.
--
-- The WholeSip hero (previously hardcoded Hero.jsx) is seeded separately as a
-- leading custom_code section — see the one-time hero seed (not in this file,
-- because it carries ~500 lines of vendored HTML/CSS/JS).
--
-- Idempotent: re-running re-copies homepage_sections into the sentinel row.
-- Apply via Supabase MCP apply_migration (PITR + this file as the record).
-- =============================================================

WITH converted AS (
  SELECT
    store_id,
    jsonb_agg(
      jsonb_build_object(
        'id', id::text,
        'type', type,
        'enabled', enabled,
        'config', config
      )
      ORDER BY sort_order
    ) AS sections
  FROM homepage_sections
  GROUP BY store_id
)
INSERT INTO store_pages
  (store_id, slug, title, status, sections, published_sections, published_at)
SELECT
  store_id, '', 'Home', 'published', sections, sections, NOW()
FROM converted
ON CONFLICT (store_id, slug) DO UPDATE
  SET sections            = EXCLUDED.sections,
      published_sections  = EXCLUDED.published_sections,
      status              = 'published',
      published_at        = COALESCE(store_pages.published_at, EXCLUDED.published_at),
      updated_at          = NOW();

-- =============================================================
-- Rollback (data): the homepage_sections table is retained, so reverting the
-- code is enough. To also remove the migrated sentinel rows:
--   DELETE FROM store_pages WHERE slug = '';
-- =============================================================
