-- =============================================================
-- Phase 4b — seed the 17 legacy WholeSip static pages as store_pages rows.
--
-- The hardcoded static routes (our-story, faqs, privacy-policy, …) were removed
-- in this phase; [pageSlug] now serves content pages from store_pages. NEW
-- stores get their pages from the theme at signup (applyTheme), but the legacy
-- WholeSip fallback store (WHOLESIP_STORE_ID, all current production traffic)
-- has no such rows — so without this seed every former static path 404s and the
-- seeded WholeSip header/footer nav (store_menus.sql) links at dead paths,
-- including the legal row (privacy/terms/refund/cookie).
--
-- Each page is one published rich_text section carrying the original heading +
-- copy (verbatim from the deleted page.jsx files). The merchant can edit them in
-- /dashboard/builder afterwards like any other page. The same section id is used
-- for the draft (`sections`) and the live snapshot (`published_sections`) so a
-- later edit → publish keeps ids stable.
--
-- Idempotent + safe: ON CONFLICT (store_id, slug) DO NOTHING, so an already
-- built/edited page is never clobbered. Apply via Supabase MCP apply_migration.
-- =============================================================

WITH pages(slug, title, body) AS (
  VALUES
    ('our-story', 'Our Story',
     'Every jar of wholesip. begins with a simple belief: real food, made slow, tastes better and does more. This is how we started, and where we''re headed.'),
    ('process', 'The Process',
     'Soaking, sprouting, slow-roasting. Discover the craft behind every batch and why we never rush the good stuff.'),
    ('ingredients', 'Our Ingredients',
     'Clean, traceable, and nothing you can''t pronounce. Here''s exactly what goes into wholesip. and where it comes from.'),
    ('sustainability', 'Sustainability',
     'From mindful sourcing to recyclable packaging, here''s how we''re working to leave things better than we found them.'),
    ('gift-packs', 'Gift Packs',
     'Thoughtfully curated bundles of wholesip. goodness, perfect for gifting. Explore our packs.'),
    ('wholesale', 'Bulk / Wholesale',
     'Stocking wholesip. in your store or buying in bulk? Let''s talk partnerships and wholesale pricing.'),
    ('find-us', 'Find Us',
     'Can''t wait? We have a growing network of retail partners who stock wholesip. goodness. Check out the map below to find a store near you.'),
    ('faqs', 'FAQs',
     'Questions about orders, ingredients, or shipping? Find quick answers to the things people ask us most.'),
    ('contact', 'Contact Us',
     'Got a question, a suggestion, or just want to say hi? Reach out and we''ll get back to you soon.'),
    ('careers', 'Careers',
     'Love good food and good people? We''re always looking for talent to join the wholesip team. Check back for open roles.'),
    ('track-order', 'Track Order',
     'Enter your order ID below to check the status of your stone-ground goodness.'),
    ('returns', 'Returns &amp; Refunds',
     'Something not right? Here''s everything you need to know about returns, replacements, and refunds.'),
    ('shipping', 'Shipping Info',
     'Where we ship, how long it takes, and what it costs. All the delivery details in one place.'),
    ('refund-policy', 'Refund Policy',
     'Our policy on refunds, cancellations, and eligibility. Read the details here.'),
    ('privacy-policy', 'Privacy Policy',
     'How we collect, use, and protect your personal information. Your privacy matters to us.'),
    ('terms', 'Terms of Use',
     'The terms and conditions that govern your use of the wholesip. website and services.'),
    ('cookie-policy', 'Cookie Policy',
     'How and why we use cookies to improve your experience on our site.')
),
built AS (
  SELECT
    slug,
    -- title column stays plain text; the heading is escaped inside the HTML.
    replace(title, '&amp;', '&') AS title,
    body,
    jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'type', 'rich_text',
        'enabled', true,
        'config', jsonb_build_object(
          'html', '<h1>' || title || '</h1><p>' || body || '</p>',
          'width', 'contained'
        )
      )
    ) AS sections
  FROM pages
)
INSERT INTO store_pages
  (store_id, slug, title, status, seo_title, seo_description,
   sections, published_sections, published_at)
SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid,  -- WHOLESIP_STORE_ID
  slug,
  title,
  'published',
  title,
  left(body, 300),
  sections,
  sections,
  NOW()
FROM built
ON CONFLICT (store_id, slug) DO NOTHING;

-- =============================================================
-- ROLLBACK (uncomment to undo — only removes untouched seed rows):
-- DELETE FROM store_pages
--  WHERE store_id = 'a0000000-0000-4000-8000-000000000001'
--    AND slug IN ('our-story','process','ingredients','sustainability',
--                 'gift-packs','wholesale','find-us','faqs','contact',
--                 'careers','track-order','returns','shipping',
--                 'refund-policy','privacy-policy','terms','cookie-policy');
-- =============================================================
