-- =============================================================
-- store_menus — per-store navigation (header + footer), edited in
-- /dashboard/navigation and read by the storefront Header/Footer.
-- One row per store; jsonb link lists. See lib/menus.ts for the shape.
-- Apply via Supabase MCP apply_migration. Idempotent.
-- =============================================================

CREATE TABLE IF NOT EXISTS store_menus (
  store_id      UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  header        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- MenuLink[]
  footer_groups JSONB NOT NULL DEFAULT '[]'::jsonb,  -- FooterGroup[]
  footer_legal  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- MenuLink[]
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID
);

-- Reuse the catalog updated_at trigger fn (products_categories.sql).
DROP TRIGGER IF EXISTS store_menus_updated_at_trigger ON store_menus;
CREATE TRIGGER store_menus_updated_at_trigger
  BEFORE UPDATE ON store_menus
  FOR EACH ROW EXECUTE FUNCTION update_catalog_updated_at();

-- ---- RLS: public read (nav is public), admin write ----
ALTER TABLE store_menus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read store_menus" ON store_menus;
CREATE POLICY "Anyone can read store_menus"
  ON store_menus FOR SELECT USING (true);

DROP POLICY IF EXISTS "Store admins manage store_menus" ON store_menus;
CREATE POLICY "Store admins manage store_menus"
  ON store_menus FOR ALL
  USING ((SELECT is_store_admin(store_id)))
  WITH CHECK ((SELECT is_store_admin(store_id)));

-- ---- Seed WholeSip with its original hardcoded nav (matches DEFAULT_MENUS) ----
INSERT INTO store_menus (store_id, header, footer_groups, footer_legal)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  '[
    {"label":"Shop","href":"/shop"},
    {"label":"Track Order","href":"/track-order"},
    {"label":"Find Us","href":"/find-us"},
    {"label":"Enquiries","href":"/enquiries"},
    {"label":"Blogs","href":"/blogs"}
  ]'::jsonb,
  '[
    {"title":"Shop","links":[
      {"label":"All Products","href":"/shop"},
      {"label":"Gift Packs","href":"/gift-packs"}
    ]},
    {"title":"Company","links":[
      {"label":"Our Story","href":"/our-story"},
      {"label":"Blog","href":"/blogs"},
      {"label":"Contact Us","href":"/contact"}
    ]},
    {"title":"Support","links":[
      {"label":"FAQs","href":"/faqs"},
      {"label":"Track My Order","href":"/track-order"},
      {"label":"Returns & Refunds","href":"/returns"},
      {"label":"Shipping Info","href":"/shipping"}
    ]}
  ]'::jsonb,
  '[
    {"label":"Privacy Policy","href":"/privacy-policy"},
    {"label":"Terms of Use","href":"/terms"},
    {"label":"Refund Policy","href":"/refund-policy"},
    {"label":"Cookie Policy","href":"/cookie-policy"}
  ]'::jsonb
)
ON CONFLICT (store_id) DO NOTHING;

-- =============================================================
-- Rollback:
--   DROP TABLE IF EXISTS store_menus CASCADE;
-- =============================================================
