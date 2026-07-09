# StoreMink — Codebase Map

> **Read this file first before making any change. Keep it up to date:** whenever you
> add/remove/move routes, server actions, lib modules, SQL files, or change the
> architecture, update the relevant section here in the same commit.

## 1. What this project is

**StoreMink** (storemink.com) is a multi-tenant, no-code D2C SaaS platform — a
Shopify-style product. Anyone can sign up, create their own store, and start
selling within a day. Every store gets:

- A **storefront** on its own subdomain (`{slug}.storemink.com`) or a verified custom domain.
- A full **admin dashboard** (`/dashboard`) to manage products, orders-adjacent data, blogs, marketing, users, branding, and settings — all no-code.

The codebase began as **WholeSip** (a single D2C juice brand, store #1) and was
converted to multi-tenant in phases. WholeSip still exists as the fallback store
(`WHOLESIP_STORE_ID = a0000000-0000-4000-8000-000000000001` in `lib/store/resolve.ts`),
so some naming (repo name `wholesip`, `config/site.ts`, `brand/`) is legacy.

## 2. Tech stack

| Layer     | Tech                                                                                                                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework | Next.js 16 (App Router, `--turbopack` dev) — **breaking-changes version; read `node_modules/next/dist/docs/` before writing code** (see AGENTS.md)                                                                               |
| UI        | React 19, Tailwind CSS v4, shadcn/ui (`components/ui/`), Base UI, lucide-react, sonner (toasts), recharts (charts), TipTap (rich-text editor), CodeMirror 6 (`@uiw/react-codemirror` — website-builder code editor, lazy-loaded) |
| Backend   | Supabase (Postgres + Auth + Storage + RLS), server actions in `app/actions/`                                                                                                                                                     |
| Email     | Resend + nodemailer (`lib/email/`), Vercel cron `/api/cron/send-emails` (daily, `vercel.json`)                                                                                                                                   |
| AI        | Gemini (`lib/ai/gemini.ts`) for AI copy actions; brand voice files in `brand/`                                                                                                                                                   |
| Testing   | Vitest + Testing Library + jsdom, coverage via v8 (`coverage/` is generated output — never edit)                                                                                                                                 |
| Deploy    | Vercel; CI on GitHub Actions (`.github/workflows/ci.yml`: lint → typecheck → test → prettier → build)                                                                                                                            |

## 3. Multi-tenancy architecture (the core concept)

Every request belongs to exactly one store, resolved from the **Host header**.

### Host routing — `proxy.ts` (edge middleware, runs on everything except `_next` statics & `/api`)

| Host                                                         | Behavior                                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `help.storemink.com` / `help.localhost`                      | Rewritten to `/help/*`                                                                                            |
| `storemink.com`, `www.`, `app.`, `localhost`, `*.vercel.app` | **Platform** — all paths rewritten into `/platform/*` (landing, signup, platform login, platform admin dashboard) |
| `{slug}.storemink.com`, `{slug}.localhost`                   | **Store subdomain** — storefront + `/dashboard` + `/auth` served directly                                         |
| Anything else                                                | **Custom domain** — must have `settings.custom_domain_verified === true` to resolve                               |

`proxy.ts` also gates auth: `/dashboard` requires a Supabase session (redirect to
`/auth/login`), enforces `force_password_reset` → `/auth/set-password`, and
restricts `/dashboard/users` + `/dashboard/media` to role `superadmin`.
Storefront paths skip the session check entirely (anonymous + cache-friendly).
Paths with a file extension (public/ assets like `/themes/...webp`) pass
through untouched on EVERY host — the platform/help rewrites would otherwise
404 them.

### Tenant resolution — `lib/store/`

- `host.ts` — pure host classification (`parseHost`, `isPlatformHost`, `isHelpHost`, `cookieDomainForHost`). No Node imports; safe on edge. `ROOT_DOMAIN` from `NEXT_PUBLIC_ROOT_DOMAIN` (default `storemink.com`). Cookies are scoped to `.storemink.com` so a session spans platform + all store subdomains.
- `resolve.ts` — DB-backed store lookup, cached with `unstable_cache` (tag `STORE_TAG = "stores"`, 300 s revalidate). Three resolvers: `getCurrentStoreOrNull()` (honest — null when the host maps to no active store); `getCurrentStore()`/`getCurrentStoreId()` (never-null — fall back to WholeSip; for dashboard/actions/internal callers that must always have a store id); **`requireStorefrontStore()`/`requireStorefrontStoreId()`** (render-only — `notFound()` on an unknown host). **Storefront PAGES must use the `require…` variants** (the `(storefront)` layout guards too, but a layout `notFound()` does NOT abort concurrently-rendering child pages, so each content page guards itself — otherwise an unclaimed subdomain streams the WholeSip fallback content into its HTML). Unknown store host → root `app/not-found.tsx` ("store doesn't exist"); missing page within a real store → `app/(storefront)/not-found.tsx` ("page not found", with store chrome). **Call `revalidateTag(STORE_TAG)` after any store create/settings/domain change.**
- `brand.ts` — per-store branding (colors/logo) consumed by `app/(storefront)/components/brand-provider.tsx`.

**Rule: every DB read/write for store data must be scoped by `store_id`** (RLS also enforces this — see `supabase/multitenant_03_rls.sql`).

## 4. Directory structure

```
wholesip/
├── AGENTS.md / CLAUDE.md      # Agent instructions (CLAUDE.md just imports AGENTS.md)
├── CODEBASE.md                # ← this file
├── proxy.ts                   # Edge middleware: host routing + auth gates (see §3)
├── next.config.ts             # Image formats, brand/ file tracing, optimizePackageImports
├── vercel.json                # Daily cron → /api/cron/send-emails
├── vitest.config.ts / vitest.setup.ts / vitest.server-only-stub.ts
├── eslint.config.mjs / postcss.config.mjs / tsconfig.json / components.json
│
├── app/
│   ├── layout.tsx             # Root layout
│   ├── globals.css
│   ├── loading.tsx
│   ├── robots.ts / sitemap.ts
│   │
│   ├── (storefront)/          # ★ THE STORE WEBSITE (served on store hosts)
│   │   ├── layout.tsx         # Storefront shell: Header/Footer, BrandProvider, Auth+Cart providers
│   │   ├── page.tsx           # Store homepage = store_pages row with slug "" (the
│   │   │                      # "homepage sentinel"); reads published/preview sections
│   │   │                      # just like [pageSlug]. Edited in /dashboard/builder (§11)
│   │   ├── storefront-theme.css
│   │   ├── (pages)/           # Customer-facing pages:
│   │   │   ├── shop/          #   product listing + [slug] product detail (reviews, related)
│   │   │   ├── cart/          #   cart page (CartProvider-driven)
│   │   │   ├── checkout/      #   COD checkout (auth-gated client page → placeOrder) +
│   │   │   │                  #   success/ order-confirmation page. RESERVED slug.
│   │   │   ├── blogs/         #   blog listing, [slug] detail (comments/reactions),
│   │   │   │                  #   write/ (TipTap customer blog editor), my-submissions/
│   │   │   ├── enquiries/     #   enquiry form (tested)
│   │   │   ├── profile/       #   customer profile (personal info + address-book card)
│   │   │   └── [pageSlug]/    #   ★ ALL content pages from store_pages (see §11): merchant
│   │   │                      #   custom pages AND the former hardcoded static pages
│   │   │                      #   (our-story, faqs, …) — retired in Phase 4b, now editable
│   │   │                      #   rows. Published path (cached) + ?preview=1 draft path
│   │   │                      #   (uncached, admin-gated). Only INTERACTIVE routes above
│   │   │                      #   stay in code + RESERVED (registry.ts + drift test).
│   │   └── components/
│   │       ├── auth/          # AuthModal + AuthProvider (customer auth context)
│   │       ├── cart/          # CartProvider, CartDrawer, CouponField
│   │       ├── header/ footer/  # nav from store_menus via MenuProvider (§11 menu builder)
│   │       ├── homepage/      # Shared per-section renderer (featured products,
│   │       │                  # blog carousel, promo banner, shop-by-category…)
│   │       ├── sections/      # ★ Generalized section renderer shared by homepage + pages:
│   │       │                  # page-section-renderer, custom-code-frame (sandboxed iframe),
│   │       │                  # custom-code-section, rich-text-section, hero-section,
│   │       │                  # usp-bar-section, tile-grid-section, faq-accordion-section,
│   │       │                  # preview-bridge, draft-canvas (client-side instant
│   │       │                  # builder preview, §11), builder-overlay
│   │       ├── brand-provider.tsx   # Injects per-store branding CSS vars
│   │       ├── menu-provider.tsx    # Supplies per-store header/footer nav (store_menus)
│   │       ├── shop-card.tsx / share-buttons.tsx
│   │       ├── structured-data.tsx  # homepage Organization + WebSite JSON-LD
│   │       ├── json-ld.tsx          # generic <JsonLd> renderer (builders: lib/seo)
│   │       ├── quick-add-button.tsx # "+ Add" on product cards (theme layout.card
│   │       │                        # = "quick_add"; hidden by CSS otherwise)
│   │
│   ├── dashboard/             # ★ STORE ADMIN DASHBOARD (per-store, auth-gated)
│   │   ├── layout.tsx         # Sidebar + topbar shell (dashboard.css)
│   │   ├── page.tsx           # Overview: metrics, revenue chart, activity, inventory…
│   │   ├── components/        # Dashboard widgets (executive-metrics, revenue-chart,
│   │   │                      # recent-orders-table, activity-feed, bulk-actions…) +
│   │   │                      # feature-toggles (shared settings-group card, convention #9)
│   │   ├── lib/               # access.ts, permissions.ts (role → allowed nav/actions),
│   │   │                      # list-params.ts, use-row-selection.ts
│   │   ├── products/          # CRUD + @modal intercepted route for quick edit
│   │   ├── orders/            # Orders list (server-paginated) — reads order-actions
│   │   ├── categories/ colors/ blogs/ media/   # content management
│   │   │   └── blogs/settings/  # blog feature toggles + per-store categories/tags manager
│   │   │   (homepage editor RETIRED in Phase 4a — the homepage is now edited in builder/)
│   │   ├── navigation/        # ★ Menu builder (§11): edit header + footer nav (store_menus)
│   │   ├── builder/           # ★ Website Builder full-tab experience (see §11): pages list
│   │   │                      # (incl. the pinned Home = slug "") + live preview iframe +
│   │   │                      # per-section editing. builder-client, outline-panel,
│   │   │                      # inspector-panel, section-form + field-group (shared editor
│   │   │                      # forms), section-library + section-thumbs (visual add-section
│   │   │                      # picker), use-autosave, use-history (undo/redo),
│   │   │                      # use-builder-shortcuts, code-editor(+-lazy) (CodeMirror),
│   │   │                      # builder.css (tokenised on --dash-*)
│   │   │   └── settings/      # Website settings ("Website" registry group, e.g.
│   │   │                      # pages.customCode) — linked from the builder top bar
│   │   ├── marketing/coupons/ # coupon CRUD + coupon email campaigns
│   │   ├── enquiries/         # enquiry inbox + @modal detail
│   │   ├── users/             # customers + user_groups/ (segments)  [superadmin only]
│   │   ├── admins/ roles/     # staff invites + role management
│   │   ├── branding/          # per-store branding editor (logo, colors)
│   │   └── settings/          # account/ + domain/ (custom-domain connect + verify);
│   │                          # feature toggles live on their feature's own page
│   │                          # (e.g. blogs → blogs/settings — see convention #9)
│   │
│   ├── platform/              # ★ STOREMINK PLATFORM (served on storemink.com via rewrite)
│   │   ├── page.tsx           # Marketing landing page
│   │   ├── signup/            # Store creation signup journey (template selection…)
│   │   ├── login/             # Platform login
│   │   └── dashboard/         # Platform-admin console: stores-console, operators-console
│   │                          # (guarded by supabase/multitenant_07_platform_admins.sql)
│   │
│   ├── auth/                  # Store-host auth: login, forgot/set/update-password,
│   │                          # callback/route.ts (OAuth/OTP callback)
│   ├── help/                  # Help centre (served at help.storemink.com)
│   │
│   ├── actions/               # ★ ALL SERVER ACTIONS ("use server") — one file per domain:
│   │   │                      # product/category/color/coupon/coupon-email/blog/blog-social/
│   │   │                      # review/enquiry/customer/customer-profile/
│   │   │                      # account-settings/set-password/invite-user/user-management/
│   │   │                      # user-group/role actions  (homepage-actions RETIRED — §11)
│   │   ├── store-signup.ts    # Creates a new store (tenant onboarding)
│   │   ├── store-branding.ts  # Per-store branding updates
│   │   ├── store-settings.ts  # Read/save per-store feature settings (see lib/settings)
│   │   ├── blog-taxonomy-actions.ts  # Per-store blog categories/tags CRUD (+ propagation into blogs)
│   │   ├── store-domain.ts    # Custom domain connect + DNS verification (Resend)
│   │   ├── page-actions.ts    # ★ Custom-page CRUD + draft/publish (see §11): createPage/
│   │   │                      # updatePageMeta/savePageDraft/publishPage/unpublishPage/
│   │   │                      # deletePage/ensureHomepage, gated builder, service-role
│   │   ├── menu-actions.ts    # ★ Per-store nav read/save (see §11 menu builder, store_menus)
│   │   ├── checkout-actions.ts # ★ placeOrder (COD): re-prices from DB, store-scoped by
│   │   │                      # host, re-validates coupon, rate-limited, SERVICE-ROLE
│   │   │                      # writes (no customer INSERT policy — see convention #12). Tested.
│   │   ├── order-actions.ts   # ★ getOrders (paginated) + updateOrderStatus (allowlisted
│   │   │                      # status/payment_status, store-scoped). Tested.
│   │   ├── address-actions.ts # ★ Customer saved-address book (own-row RLS, tested):
│   │   │                      # getMyAddresses, saveAddress (checkout dedup+default),
│   │   │                      # upsertAddress (profile add/edit), setDefaultAddress,
│   │   │                      # deleteAddress. Prefills checkout + /profile address book.
│   │   ├── platform.ts        # Platform-admin actions
│   │   └── _test-helpers.ts   # Shared mocks for action tests (co-located *.test.ts)
│   │
│   └── api/
│       ├── cron/send-emails/  # Daily email campaign worker (Vercel cron)
│       ├── og-image/          # OG image proxy (compresses Supabase images only)
│       ├── og/                # Dynamic branded OG card (ImageResponse; ?d=JSON
│       │                      # {title,subtitle,color}) — default share image for
│       │                      # homepage/custom pages/platform (lib/seo/og-card.ts)
│       └── upload/            # Image upload → Supabase Storage (sharp → WebP);
│           └── sign-video/    # signed-URL minting for VIDEO uploads (≤50MB,
│                              # client uploads DIRECTLY to storage — serverless
│                              # routes can't proxy large bodies)
│
├── lib/
│   ├── store/                 # ★ Tenancy (see §3): host.ts, resolve.ts, brand.ts
│   ├── settings/              # ★ Feature-settings framework (see convention #9):
│   │   ├── registry.ts        #   catalog: every per-store toggle (key, default, plan gate)
│   │   └── resolve.ts         #   getStoreSettings()/getStoreSetting() for the host store
│   ├── supabase/              # Client factories — pick the right one:
│   │   ├── server.ts          #   RSC/server-action client (cookie-based session)
│   │   ├── client.ts          #   Browser client
│   │   ├── admin.ts           #   Service-role client (bypasses RLS — server only!)
│   │   ├── public.ts          #   Anonymous client (cacheable, no cookies)
│   │   ├── middleware.ts      #   updateSession() used by proxy.ts (JWT claims fast-path)
│   │   ├── storage.ts / storage-cleanup.ts
│   ├── storefront/            # queries.ts (cached storefront reads — getPublishedPage/
│   │                          # getPublishedPageSlugs, named columns only), tags.ts
│   │                          # (cache tags incl. TAGS.pages)
│   ├── sections/              # ★ Page-section registry (see §11): re-exports homepage
│   │                          # section-types + adds page helpers (PageSectionItem,
│   │                          # validateSections, RESERVED_PAGE_SLUGS, validatePageSlug),
│   │                          # resolve-data.ts (batched fetch, server) + map-data.ts
│   │                          # (the PURE per-section resolution — shared by the server
│   │                          # render AND the builder's client DraftCanvas). Tested.
│   ├── pages/                 # ★ preview.ts — uncached, cookie-authenticated draft loader
│   │                          # for the builder preview (getManagerUserId("builder") gate)
│   ├── seo/                   # ★ schema.ts — pure JSON-LD builders (productSchema/
│   │                          # articleSchema/breadcrumbSchema), tested. Rendered via the
│   │                          # (storefront) <JsonLd> component on product/blog pages.
│   │                          # og-card.ts — brandOgImageUrl() builds the /api/og URL
│   │                          # (single `d` param) for the branded default share card.
│   │                          # search-engines.ts — pingIndexNow() (Bing/Yandex) +
│   │                          # submitSitemapToGoogle() (Search Console); fired via
│   │                          # after() on store create + publish. Best-effort, dormant
│   │                          # until env is set. IndexNow key: public/<key>.txt.
│   ├── email/                 # sender, layout, campaign-worker, coupon-campaign,
│   │                          # trigger-worker, blog/enquiry notifications
│   ├── homepage/section-types.ts  # Section schema (typed, tested) — shared by homepage AND
│   │                          # custom pages; 10 types incl. hero, tile_grid, usp_bar,
│   │                          # faq_accordion, rich_text + custom_code (see §11)
│   ├── menus.ts               # ★ Per-store nav (§11): StoreMenus types, DEFAULT_MENUS,
│   │                          # normalize/sanitize. Read cached via getStoreMenus.
│   ├── ai/gemini.ts           # Gemini client for AI copy
│   ├── pricing.ts / slug.ts / sanitize.ts / rate-limit.ts / og-image.ts
│   ├── blog-taxonomy.ts   # fetchBlogTaxonomy(): per-store blog categories/tags reader
│   ├── blog-reactions.ts / phone-labels.ts / use-otp-throttle.ts
│   ├── site.ts / utils.ts     # cn() etc.
│
├── components/
│   ├── ui/                    # shadcn/ui primitives (button, dialog, table, sidebar…)
│   └── customer-multiselect.tsx
├── hooks/use-mobile.ts
├── config/site.ts             # LEGACY WholeSip asset URLs (being superseded by per-store branding)
│
├── supabase/                  # ★ SQL — schema, migrations, RLS (run against Supabase manually/MCP)
│   ├── multitenant_01_schema.sql        # stores table + store_id columns (+ rollback)
│   ├── multitenant_03_rls.sql           # store-scoped RLS policies (+ rollback)
│   ├── multitenant_04_admin_views.sql / _05_count_rpcs.sql / _06_drop_store_defaults.sql
│   ├── multitenant_07_platform_admins.sql  # platform_admins table (+ rollback)
│   ├── *_table.sql            # blogs, coupons, enquiries, roles, users, user_groups,
│   │                          # product_reviews, email_campaigns, rate_limits, card_colors,
│   │                          # blog_comments/likes… (homepage_sections DEPRECATED — Phase 4a)
│   ├── orders_table.sql       # ★ orders + order_items (+ RLS + updated_at trigger). NO
│   │                          # customer INSERT policy by design — placeOrder writes with
│   │                          # the service role; customers/admins get SELECT/manage (convention #12).
│   ├── coupons_storefront_visibility.sql  # coupons.show_on_storefront flag (§storefront coupons)
│   ├── customer_addresses.sql # ★ saved shipping addresses (own-row RLS) — checkout book
│   ├── coupon_usage_rpc.sql   # ★ increment_/decrement_coupon_usage: atomic used_count
│   │                          # reserve/release (enforces max_uses under concurrency)
│   ├── blog_taxonomy.sql      # per-store blog_categories + blog_tags (+ RLS + seed)
│   ├── store_menus.sql        # ★ per-store header/footer nav (+ RLS + WholeSip seed) — §11
│   ├── homepage_to_store_pages.sql  # Phase 4a data migration: homepage_sections → slug ""
│   ├── wholesip_static_pages_seed.sql  # Phase 4b: seed the 17 legacy static pages
│   │                          # (our-story, faqs, privacy-policy…) as published
│   │                          # store_pages rows for the WholeSip fallback store
│   ├── homepage_hero_seed.sql  # ★ WholeSip hero carousel as a leading custom_code section
│   │                          # on the homepage row (the "one-time hero seed" — §11). Idempotent,
│   │                          # keyed on a fixed section id. Regen: homepage_hero_seed.gen.py
│   ├── store_pages.sql        # ★ merchant custom pages (draft + published_sections jsonb;
│   │                          # RLS via is_store_admin; anon SELECT REVOKED then GRANTed on
│   │                          # named cols WITHOUT draft `sections` — see §11) (+ rollback)
│   ├── custom_access_token_hook.sql     # JWT claims (role, force_password_reset)
│   └── perf_*.sql             # index / RLS performance migrations
│
├── brand/                     # WholeSip brand voice + AI task prompts (traced into serverless
│                              # bundle via next.config.ts; used by /product-desc & /seo-meta skills)
├── public/                    # Static assets (favicon, svgs)
└── coverage/                  # GENERATED test coverage report — do not edit
```

## 5. Key conventions & rules

1. **Tenancy first**: any new table gets a `store_id` column + RLS policy; any new
   query/action threads `getCurrentStoreId()`. Never leak data across stores.
2. **Server actions** live in `app/actions/<domain>-actions.ts` with a co-located
   `<domain>-actions.test.ts`. Use the right Supabase client (`server` for user
   context, `admin` only when RLS must be bypassed and input is validated).
3. **Route groups**: `(storefront)` = customer site, `dashboard/` = store admin,
   `platform/` = StoreMink itself. Don't put platform pages in the storefront group —
   the proxy rewrite depends on this separation.
4. **Modals via intercepted routes**: dashboard list pages use the `@modal/(.)[id]`
   parallel-route pattern (products, enquiries, users). Follow it for new entities.
5. **Caching**: storefront reads use `unstable_cache` + tags (`lib/storefront/tags.ts`,
   `STORE_TAG`). After mutations, `revalidateTag`/`revalidatePath` accordingly.
6. **Styling**: Tailwind v4 + CSS modules for scoped styles + a few plain `.css`
   files per area (`dashboard.css`, `storefront-theme.css`, `platform.css`).
   Per-store theming = CSS variables injected by `brand-provider.tsx`.
7. **Next.js 16 caution**: APIs may differ from training data — check
   `node_modules/next/dist/docs/` before using unfamiliar APIs (AGENTS.md rule).
8. **Tests**: `npm run test` (vitest, coverage). CI also runs `lint`, `typecheck`,
   `prettier --check`, `build` — all must pass.
9. **Features are settings-based** (see §9): configurable behavior goes through
   `lib/settings/registry.ts` — add the setting there (key, label, default,
   `section` = the dashboard permission section that owns it, optional
   `minPlan`/`dependsOn`), read it via `getStoreSettings()` /
   `getStoreSetting()` from `lib/settings/resolve.ts`. Settings render on their
   OWNING FEATURE's settings page (blogs → `/dashboard/blogs/settings`) via
   `getStoreSettingsForEditor(group)` + `saveStoreSettings`, both gated per
   setting by `can(def.section, …)` — there is no central features page. Values
   live in `stores.settings.features` (jsonb); `saveStoreSettings` validates
   against the registry and busts `STORE_TAG`. Enforce settings **server-side**
   (in the action), not just in the UI. If RLS blocks a setting-dependent write
   (e.g. customers may only insert `pending_review` blogs), do the privileged
   step with the service-role client AFTER checking the setting — see
   direct-publish in `blog-actions.ts`. First consumers:
   `blogs.customerSubmissions`, `blogs.requireApproval` (rendered at
   `/dashboard/blogs/settings`) and `pages.customCode` (rendered at
   `/dashboard/builder/settings`); both pages share the
   `dashboard/components/feature-toggles.tsx` card. `marketing.showAllCoupons`
   (section `marketing`) is another consumer: when on, the storefront cart shows
   all active coupons; otherwise only those with `coupons.show_on_storefront`.
   **⚠ `stores.settings` (which holds `features`) is ANON-READABLE** — the
   "Read stores" RLS policy (`multitenant_03_rls.sql`) grants `SELECT` on every
   active store to `anon`, and the storefront reads it with the public client.
   So NEVER put a secret (API key, token, webhook secret) in `stores.settings`;
   it would be world-readable via PostgREST. Secrets belong in env, or in a
   separate column/table that is NOT granted to `anon` (mirror the `store_pages`
   draft-column pattern: revoke anon, grant only named non-sensitive columns).
10. **Blog categories & tags are per-store data**, not code: `blog_categories` /
    `blog_tags` tables (`supabase/blog_taxonomy.sql`), managed in
    `/dashboard/blogs/settings` via `blog-taxonomy-actions.ts`. Blogs store
    plain names in their `text[]` columns, so rename/delete propagates into
    affected blog rows; customer submissions are validated server-side against
    the store's lists. Editors read them via `fetchBlogTaxonomy`
    (dashboard) / `getBlogTaxonomyNames` (cached storefront,
    tag `TAGS.blogTaxonomy`).
11. **Website Builder — pages & custom code are per-store, dashboard-editable.**
    The storefront itself is a per-store artifact, not hardcoded: - **Section registry**: `lib/homepage/section-types.ts` is the single typed
    section schema (config types, `EMPTY_CONFIG`, `META`, `validateConfig`),
    shared by the homepage AND custom pages. Eleven block types: `hero`
    (banner/split/minimal variants — first-class hero, replaces the old
    custom_code hero hack; optional `video_url` plays muted/looping in place
    of the image with the image as poster), `hero_carousel` (auto-playing
    photo/video slideshow — `slides[]` of HeroSlide, dot + arrow nav,
    client-rendered `hero-carousel-section.tsx`), `featured_products`,
    `shop_by_category` (with a
    `display: circles|cards` tile-shape variant), `promo_banner`, `tile_grid`
    (linked colour/image tiles — offers, collections, 2-up mini banners),
    `usp_bar` (fixed icon catalog `USP_ICONS` + label strip), `faq_accordion`
    (expandable Q/A with optional category-filter pills; plain-text answers),
    `latest_blogs`, `rich_text` (inline sanitized HTML, SEO-friendly) and
    `custom_code` (merchant HTML/CSS/JS). Hero/tile/slide `background` fields
    are strict colours (`safeColor`) because they render into inline style
    attrs; `video_url` fields are `safeHref`-validated.
    `lib/sections/registry.ts` re-exports it and adds page-level helpers:
    `PageSectionItem`, `validateSections`, `RESERVED_PAGE_SLUGS`,
    `validatePageSlug`. - **Custom pages** live in `store_pages` (draft `sections` jsonb +
    `published_sections` snapshot; **publish = copy draft → published**). Served
    by `(pages)/[pageSlug]`; App Router matches static sibling dirs first, and
    every static (pages) dir slug is in `RESERVED_PAGE_SLUGS` (a drift unit test
    `fs.readdir`s the dir and asserts coverage). Published reads are cached
    (`getPublishedPage`, tag `TAGS.pages`, cached nulls for cheap 404s). - **Draft column is sealed from PostgREST**: anon `SELECT` is REVOKEd then
    GRANTed only on named columns WITHOUT `sections`, so drafts can never leak
    via the API — cached storefront queries therefore select named columns,
    never `*`. The builder + preview read drafts with the **service-role
    client** after an app-layer `getManagerUserId("builder")` check. - **Preview**: `?preview=1` + the admin's existing session cookie (dashboard
    and storefront share the host) → uncached `lib/pages/preview.ts` loader;
    unauthorized silently falls back to published. Preview renders `noindex` +
    a `PreviewBridge` client comp that `router.refresh()`es on postMessage from
    the builder. Two disjoint code paths (published cached / draft uncached) ⇒
    no cache poisoning. - **Sandboxed custom code**: merchant JS runs ONLY inside
    `custom-code-frame.tsx` — an iframe with `sandbox="allow-scripts
allow-popups"` + `srcDoc`, **never `allow-same-origin`** (Supabase auth
    cookies are `httpOnly:false`, `Domain=.storemink.com`; same-origin inline
    JS could steal any visitor's session). Auto-height via ResizeObserver →
    `postMessage`, parent clamps 40–4000px. `</script`/`</style` escaped in
    merchant strings; each string capped 64 KB. `rich_text` is the inline/SEO
    counterpart: sanitized at save AND render via `lib/sanitize.ts` (blog trust
    model). Custom-code availability is gated by the `pages.customCode` setting
    (registry, section `builder`), enforced **server-side** in `page-actions.ts`
    (all sections — homepage + custom pages — now save through it); admins
    toggle it at `/dashboard/builder/settings`. - **Builder v3 UI** at `/dashboard/builder` (permission section `builder`,
    group Content; sidebar link opens a new tab; `fixed inset-0` overlay at
    `z-index:40`, below the shared `z-50` dialog layer; all chrome tokenised
    on the dashboard `--dash-*` vars via `--b-*` aliases in `builder.css`).
    Framer/Shopify-style canvas editing: LEFT `outline-panel.tsx`
    (page-switcher dropdown, Header/Footer rows → `/dashboard/navigation`,
    dnd-kit-sortable section outline; collapsible to a 52px icon rail —
    `is-left-collapsed` sets `--b-left`, persisted in localStorage); CENTER
    preview iframe (`/{slug}?preview=1`, viewport toggles) that is **REUSED
    across page switches** (`contentWindow.location.replace` + a translucent
    veil until load/`sm-preview-ready` — never keyed/remounted, no blank
    flash) with the **click-to-edit canvas overlay**
    (`app/(storefront)/components/sections/builder-overlay.tsx` — measured
    hit-layer, NOT event delegation, because sandboxed custom_code iframes
    swallow clicks; MutationObserver+ResizeObserver re-scan survives DOM
    replacement; postMessage protocol sm-select / sm-hover / sm-add-at
    {afterId} / sm-visible / sm-highlight / sm-scroll-to, extending
    sm-preview-refresh/ready); RIGHT `inspector-panel.tsx` (sticky
    header+tabs, only the body scrolls; tabs: Content = shared
    `section-form.tsx` forms folded into `field-group.tsx` disclosures;
    Style = preset chips + per-section `style`
    {background,padding_y,width,anchor} applied by `section-shell.tsx` —
    strict color validation because it renders into an inline style attr;
    Advanced = anchor/duplicate/delete; an idle state with a shortcut
    cheatsheet when nothing is selected). Page settings (title/slug/SEO/
    delete) moved to a topbar-triggered z-50 dialog (`PageSettingsForm`).
    **Instant preview**: preview mode renders sections CLIENT-side in
    `draft-canvas.tsx` — the builder posts `sm-draft {sections}` on every
    mutation (rAF-throttled; ~500ms for custom_code so the sandbox doesn't
    remount per keystroke) and the canvas re-renders with
    `lib/sections/map-data.ts` (the pure resolver, fed full dataset
    snapshots server-passed at preview load) — edits paint in <100ms with
    zero RSC round-trips; `sm-preview-refresh` (router.refresh) remains only
    for publish + slug renames. **Add-section library**
    (`section-library.tsx`): a left slide-over with search (label/
    description/`keywords` in `SECTION_TYPE_META`, which also gained
    `category`), grouped SVG mini-preview cards (`section-thumbs.tsx`),
    ↑/↓/Enter keyboard nav. **Undo/redo** (`use-history.ts`): pre-mutation
    snapshots recorded in `setSections`, 50-entry cap, 800ms coalescing per
    section for typing bursts; undo/redo re-save through the autosave chain.
    **Shortcuts** (`use-builder-shortcuts.ts`): ⌘Z/⇧⌘Z/⌘Y, ⌘S save-now, Esc
    (close library → deselect), ↑/↓ outline nav, ⌘D duplicate, ⌫ delete
    (confirm dialog); suspended while dialogs are open; never intercepts
    inside CodeMirror/TipTap. **Autosave** (`use-autosave.ts`: 350ms debounce
    for content, immediate for structural ops, single-flight latest-wins
    chain, stale-tab token from `savePageDraft`'s returned `updated_at`,
    beforeunload while dirty). The stale-tab block now offers three ways out:
    reload (their version), copy-my-changes (sections → clipboard JSON), or
    take-over (`unblock()` — re-pulls a fresh token, local sections win).
    Validation is split: `validateConfig/validateSections` take a mode —
    "draft" skips completeness (autosave never fails mid-edit), "publish" is
    strict (publishPage + applyTheme). Publish stays explicit, with its own
    token guard. custom_code edits in a wide dialog hosting the lazy
    CodeMirror editors (`code-editor-lazy.tsx`). **Responsive**: ≥1200px
    3-panel; 768–1199px the inspector becomes a fixed right sheet (z-45,
    slides in on selection); <768px a "needs a larger screen" notice. - **Homepage (Phase 4a, done)**: the storefront homepage is the `store_pages`
    row with slug `""` (the "homepage sentinel"). `app/(storefront)/page.tsx`
    reads it (published + `?preview=1` draft) exactly like `[pageSlug]`. It's
    pinned first in the builder as "Home" (`ensureHomepage` creates it on demand;
    `listPages` hides it; slug immutable, not deletable). The old WholeSip hero
    is now a `custom_code` section. Retired: `homepage_sections` reads,
    `homepage-actions.ts`, `/dashboard/homepage`, `Hero.jsx` (the
    `homepage_sections` table is kept, deprecated, as migration rollback). - **Static pages (Phase 4b, done)**: the 17 former hardcoded content pages
    (our-story, faqs, …) are seeded as `store_pages` rows (new stores via the
    theme at signup; the legacy WholeSip fallback store via
    `wholesip_static_pages_seed.sql`) and their route dirs deleted, so
    `[pageSlug]` serves them; `RESERVED_PAGE_SLUGS` now reserves only
    the INTERACTIVE routes that stay in code (blogs, cart, enquiries, profile,
    shop) + system routes. - **Menu builder (Phase 4c, done)**: header + footer nav is per-store in
    `store_menus` (jsonb: `header`, `footer_groups`, `footer_legal`; RLS public
    read / admin write). Read cached via `getStoreMenus` (tag `TAGS.menus`) →
    `MenuProvider` → `Header`/`Footer`. Edited at `/dashboard/navigation`
    (permission section `navigation`) via `menu-actions.ts`; shape + defaults in
    `lib/menus.ts` (`DEFAULT_MENUS` fallback). - **Themes (signup seeding)**: a theme is a DATA PACKAGE in `lib/themes/` —
    `meta.ts` (client-safe catalog for the signup picker: id/name/category/
    previewImage/demoSlug; the picker must NEVER import definitions),
    `definitions/basket.ts` (brand accents, **`design` skin**, pages incl. the
    homepage sentinel, menus, sample categories/products+variants — imagery
    bundled under `public/themes/{id}/`; **basket** is the grocery/F&B
    reference template with real Unsplash photography, per
    docs/vertical-templates-plan.md §9.1, and currently the only/default
    theme — the Arcade/Fresko placeholders were retired 2026-07-04),
    `apply.ts` `applyTheme(storeId, themeId,
    {publish, reset?})` — service-role, idempotent upserts keyed on
    (store_id, slug), best-effort per entity with an errors accumulator;
    `reset` refuses unless `stores.settings.demo === true`. `createStore`
    (signup) calls it with the picked template (published immediately; brand
    NAME preserved). v1 constraints CI-tested in `lib/themes/themes.test.ts`:
    non-id sources only, no latest_blogs, homepage present, strict publish
    validation, every referenced asset exists. **Demo stores**: one per theme
    (`demo-{id}` — the namespace is blocked at signup), seeded/reseeded via
    `seedDemoStore` (platform superadmin action) from the Themes panel on the
    platform stores console; the signup picker's Preview opens
    `https://demo-{id}.{ROOT_DOMAIN}`. - **Theme DESIGN engine (the visual "skin")**: a theme controls the FULL
    design system, not just one accent. `ThemeDesign` (`lib/themes/types.ts`) =
    `palette` (all 14 `--wholesip-*` colour tokens + `onAccent`/`onInk`/
    `shadowRgb`/`success`/`error`/`star`/`highlight` semantic tokens), `fonts`
    (`body`/`display`, pointing at next/font variables loaded in
    `app/layout.tsx` — Inter/Fraunces/Space Grotesk/Plus Jakarta alongside the
    legacy Outfit/Roboto/Stick), and `shape` (`card`/`control`/`sm`/`pill`
    radii). `designToCssVars(design, brandPrimary)` flattens it to a CSS-var map
    the `(storefront)` layout writes **inline on `.storefront-root`** — inline
    specificity beats the globals.css `:root` defaults, so the whole storefront
    re-skins with zero per-component wiring. Fonts re-point the existing
    `--font-outfit`/`--font-stick-no-bills` slots, so all 64 font call-sites
    switch with no find-replace. **Defaults = WholeSip**: the `:root` token
    values in `globals.css` ARE the WholeSip look, and a store with no real
    `settings.template` (the WholeSip fallback, legacy stores) gets only
    `--brand-primary` — untouched. Storefront component CSS is fully
    tokenised (no raw hex; darks→`ink`, mids→`ink-soft`, faints→`ink-faint`,
    on-dark whites→`on-ink`/`on-accent`, panels→`surface`, shadows→
    `rgba(var(--wholesip-shadow-rgb), α)`, radii→shape tokens) so palette +
    shape reach every surface (header, footer, auth modal, shop cards + badges,
    profile/enquiry forms, blog + write-blog editor). CI-guards in
    `themes.test.ts` assert each theme ships a complete, injectable design.
    **Layout variants** (`ThemeDesign.layout`, all optional — absent = classic
    WholeSip chrome): `header: "market"` renders a solid brand-coloured header
    bar with a prominent search box (colours via `--sm-header-bg`/`--sm-header-fg`
    from `designToCssVars`; activated by the `sm-header-market` class the
    storefront layout puts on `.storefront-root`); `card: "quick_add"` shows an
    inline "+ Add" to-cart button on product cards (`quick-add-button.tsx`,
    class `sm-card-quickadd`; multi-variant products fall through to the detail
    page). The header search is FUNCTIONAL on all variants — it submits to
    `/shop?q=`, and the shop grid filters by name/description/category
    (`shop-client.tsx`, synced to the deep link).
    `storefront: "grocery"` is the deepest variant: it swaps the shared
    product cards, the product-detail page and the cart for a distinct
    premium grocery layout, so a store on such a theme looks NOTHING like the
    classic WholeSip storefront. Product cards restyle via the
    `sm-storefront-grocery` root class (CSS-only, in `storefront-theme.css`,
    doubled-class specificity over the per-grid rules). The PDP and cart
    branch to ENTIRELY SEPARATE markup + classes (`grocery-product-detail.tsx`
    / `gpdp-*` in shop.css; `grocery-cart.tsx` / `gcart-*` in cart.css) — the
    page servers read the flag via `lib/store/storefront-layout.ts`
    (`getStorefrontLayout`) and pass a `grocery` prop to the client
    components; the shop listing also drops its WholeSip-branded hero/ticker.
    All of this is GATED, so the WholeSip fallback and any classic theme keep
    today's shared layout untouched. (Basket is the first grocery theme.)
    Design derives from the theme id at RENDER time (no DB column), so no reseed
    is needed when a theme's skin changes. - **Phase 4d (not built, by design)**: nothing pending — homepage, static
    pages, and menus are all migrated. Remaining WholeSip cleanup (config/site.ts,
    brand/) continues opportunistically.

12. **Checkout & orders security model (COD).** A signed-in shopper places an
    order from `/checkout`; `placeOrder` (`app/actions/checkout-actions.ts`) is
    the trust boundary and layers its defenses in order:
    - **Auth**: `supabase.auth.getUser()` on the cookie client — anonymous is
      rejected. **Rate limit**: `rateLimit("checkout:{userId}")` (Postgres,
      cross-instance, fails open) throttles spam/double-submit.
    - **Input validation**: line-item count, per-line integer quantity, and all
      required address fields are validated server-side (the form's `required`
      attr is only a UX hint); stored address values are trimmed + length-capped.
    - **Never trust client prices**: item prices are re-read from `products`/
      `product_variants` **scoped to the host store** (`getCurrentStoreId()` +
      `.eq("store_id", …)`), so another store's product can't be smuggled in and
      the client's claimed price/total is ignored. Coupons are re-validated via
      `validateCoupon` (min-order/date/usage/group checks) and the discount is
      recomputed + rounded to match the cart. A coupon use is then **reserved
      atomically BEFORE the order is created** via the `increment_coupon_usage`
      RPC (`supabase/coupon_usage_rpc.sql`) — a single conditional UPDATE that
      returns false when `max_uses` is already hit, so the cap can never be
      exceeded under concurrent checkouts. The reservation is released
      (`decrement_coupon_usage`) if the order then fails to persist; a transient
      RPC error fails open (never blocks a sale over the counter).
    - **Service-role writes**: `orders`/`order_items` have **no customer INSERT
      RLS policy** by design; the writes run with `createAdminClient()` (service
      role) _after_ all the above validation. Customers get RLS `SELECT` on their
      own orders; store admins get `FOR ALL`. On an items-insert failure the
      order row is deleted (best-effort rollback — no cross-statement txn over
      PostgREST). **If you ever move checkout off the service-role client, add a
      customer INSERT policy first** (see the note in `orders_table.sql`).
    - **Dashboard reads/writes**: `order-actions.ts` gates on
      `getManagerUserId("orders")`, scopes every query by `store_id`, paginates
      `getOrders`, and allowlists `status`/`payment_status` in `updateOrderStatus`.
    - **Checkout UX**: the `/checkout` page opens the auth modal IN PLACE when
      signed out (no redirect) so a signed-in shopper lands straight on the form.
      Saved addresses (`address-actions.ts` + `supabase/customer_addresses.sql`,
      own-row RLS) prefill the default and are picked from cards so the address
      isn't retyped each order.

13. **Inventory System**. Per-store stock tracking. Products and variants have `track_inventory` (bool), `stock` (int), `low_stock_threshold` (int), `allow_backorder` (bool), and `sku` (text, products only). Stock edits go through `supabase/inventory_rpc.sql` (`reserve_stock`, `release_stock`, `adjust_stock`) to ensure atomic correctness and generate an append-only ledger in the `stock_movements` table. `lib/inventory/status.ts` is the SINGLE source of truth for turning stock fields into a display status (`isSoldOut`/`lowStockLeft`/`inventoryStatus` + product-level aggregation) — shared by the dashboard list, its optimistic UI, and the storefront so the per-SKU threshold override and the store-wide default (`inventory.lowStockThreshold`) resolve identically everywhere. The storefront reads these fields to display 'Sold Out' or 'Only X left!' badges on product cards and detail pages (the store default is resolved per request in the shop/product pages + section resolver and threaded down as `storeLowStockThreshold`), and the quick-add button disables itself for out-of-stock items. Checkout (`checkout-actions.ts`) creates the order row **before** calling `reserve_stock` per line (the `stock_movements.order_id` FK requires the order to exist first), and rolls back stock→order→coupon in reverse on any failure. Each order carries a `stock_status` (`none`/`reserved`/`released`) tracking its reservation lifecycle: checkout sets `reserved`; `order-actions.ts` restocks on cancellation by atomically claiming the `reserved`→`released` transition (a single conditional UPDATE), so cancellation restocks **exactly once** and never touches legacy orders (`none`) — reinstating a cancelled order does NOT auto re-reserve. Store admins manage inventory at `/dashboard/inventory` (list view, history drawer, bulk adjustments) and settings at `/dashboard/inventory/settings`. **Cart-side enforcement (layered defense above the DB guarantee).** `reserve_stock` makes overselling impossible at order time, but the cart must not let a shopper pile quantity past stock in the first place. `lib/inventory/status.ts` adds `cartLineMax(snapshot, ceiling=99)` — the camelCase cart counterpart of `maxPurchasable` — and a `CartStockSnapshot` shape. Every `CartItem` (`CartProvider`) carries an optional `{trackInventory, stock, allowBackorder}` snapshot captured at add time (all optional, so older persisted carts parse as untracked/unlimited); `addItem` and `setQuantity` clamp centrally to `cartLineMax`, so ONE choke-point caps every surface: the quick-add button (`quick-add-button.tsx`, toasts at the cap), the PDP quantity selector + Buy Now (`product-detail-client.tsx`), and all three cart steppers (`CartDrawer.tsx`, classic `cart-client.tsx`, `grocery-cart.tsx`) — each disables "+" and shows a "Max available: N" hint at the cap. **Stale carts are reconciled at checkout**: `getCartStock(lines)` (`checkout-actions.ts`, service-role, store-scoped, uncached) re-reads live per-line stock and marks vanished products/variants `exists:false`; `CartProvider.reconcileStock(updates)` refreshes each line's snapshot, clamps over-stock quantities, drops sold-out/vanished lines, and returns a `{removed, reduced}` summary the `/checkout` page toasts on mount. If a reserve still fails at order time, `placeOrder` re-reads the SKU and returns the exact shortfall ("only N left" / "just sold out"), not a generic error.

## 6. Commands

```bash
npm run dev         # next dev --turbopack (test stores via {slug}.localhost:3000)
npm run build       # production build
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run test        # vitest run --coverage
npm run test:watch  # vitest watch
npm run format      # prettier --write
```

## 7. Environments / external services

- **Supabase**: Postgres + Auth + Storage (`media` bucket). Env in `.env`
  (never commit secrets). Supabase MCP server available for SQL/migrations.
  **Auth-hardening (dashboard config — enforce in the Supabase console, not code):**
  (1) enable **CAPTCHA** (hCaptcha/Turnstile) on Auth so signup/OTP endpoints
  (`signUp`, `signInWithOtp`, `updateUser({phone})` — merchant + customer) can't
  be scripted for SMS-pumping / OTP-flooding; (2) turn on **leaked-password
  protection** (HaveIBeenPwned); (3) keep **SMS/email OTP rate limits** tight.
  These auth sends happen client-side against Supabase, so the app's Postgres
  `rateLimit()` can't cover them — the console controls are the real boundary.
  App-side password floor is 8 chars (`app/platform/signup/page.tsx`).
- **Vercel**: hosting + cron. Wildcard domain `*.storemink.com` → store subdomains.
- **Resend**: transactional email + custom-domain DNS verification.
- **Gemini**: AI copy generation.
- **Search-engine indexing** (`lib/seo/search-engines.ts`): IndexNow needs no
  account (public key file `public/<key>.txt`; `INDEXNOW_KEY` overrides it,
  `INDEXNOW_FORCE=1` enables pings outside prod). Google Search Console
  submission is DORMANT until `GOOGLE_SEARCH_CONSOLE_CREDENTIALS` (service-account
  JSON) + `GOOGLE_SEARCH_CONSOLE_PROPERTY` (e.g. `sc-domain:storemink.com`) are
  set. One-time human setup: verify `storemink.com` as a Search Console _Domain
  property_ (covers all `*.storemink.com`) and grant the service account access.

## 8. Multi-tenant rollout status (as of 2026-07)

Phases 1–3c complete: schema + RLS + store resolution + signup journey +
per-store branding + platform admin console are live on branch `multi-tenant`.
Legacy WholeSip fallback remains until all traffic moves to real store hosts.

## 9. Product direction (owner's vision — keep in mind for every design decision)

- **storemink.com is the soul.** `storemink.com/dashboard` (platform operator
  console) sees _everything_: all features plus platform-only controls — Stores
  management (suspend/unsuspend, plan upgrade/downgrade), operators, etc.
  `{slug}.storemink.com/dashboard` sees only that store's own features/settings.
- **Everything must be settings-based.** Feature behavior is configured per
  store, not hardcoded. Canonical example — blogs: a store can toggle (a) whether
  customers may submit blogs at all, and (b) whether submissions need admin
  approval or publish directly, and it owns its blog categories/tags outright
  (convention #10). Every feature should be built with this kind of per-store
  configurability from the start. **The framework for this now exists**
  (`lib/settings/`, rendered on each feature's own settings page — blogs →
  `/dashboard/blogs/settings`; see convention #9), and blogs is the first
  consumer.
- **The website is dashboard-editable** (convention #11): the homepage, the
  former hardcoded static pages, and merchant-built custom pages are ALL per-store
  data (sections + custom HTML/CSS/JS) edited in the Website Builder
  (`/dashboard/builder`) with live preview and a draft → publish workflow;
  header/footer nav is per-store too (`/dashboard/navigation`). Merchant JS is
  sandbox-isolated. Phase 4 completed this fold-in — only genuinely interactive
  routes (shop, cart, blogs, enquiries, profile) remain in code.
- **Templates**: at signup the merchant picks a storefront template (filter by
  business category + free/paid, preview, plan-gated — e.g. "For STARTER and
  above"). Multiple visual templates are a planned core feature; today there is
  one storefront with per-store branding.
- **Checkout (COD, built)**: a signed-in shopper places a Cash-on-Delivery order
  from `/checkout` → `placeOrder` (`app/actions/checkout-actions.ts`), stored in
  `orders`/`order_items` (`supabase/orders_table.sql`) and listed at
  `/dashboard/orders`. See convention #12 for the checkout security model.
- **Deliberately later phases** (not built yet, by choice): online **payments**
  (BYO gateway — merchant connects own Razorpay/Cashfree; checkout is COD-only
  for now), merchant subscription billing for StoreMink plans.
- **WholeSip cleanup is ongoing**: the product started as the WholeSip site and
  was converted into StoreMink; remaining WholeSip traces (`config/site.ts`,
  `brand/`, repo name) are being removed gradually as features become
  per-store/settings-based. (The hardcoded homepage/hero and static pages are
  now migrated — Phase 4.)
