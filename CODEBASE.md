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

### Tenant resolution — `lib/store/`

- `host.ts` — pure host classification (`parseHost`, `isPlatformHost`, `isHelpHost`, `cookieDomainForHost`). No Node imports; safe on edge. `ROOT_DOMAIN` from `NEXT_PUBLIC_ROOT_DOMAIN` (default `storemink.com`). Cookies are scoped to `.storemink.com` so a session spans platform + all store subdomains.
- `resolve.ts` — DB-backed store lookup, cached with `unstable_cache` (tag `STORE_TAG = "stores"`, 300 s revalidate). `getCurrentStore()` never returns null — falls back to WholeSip. `getCurrentStoreId()` is what gets threaded into every query. **Call `revalidateTag(STORE_TAG)` after any store create/settings/domain change.**
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
│   │   ├── page.tsx           # Store homepage (dynamic sections, see lib/homepage/)
│   │   ├── storefront-theme.css
│   │   ├── (pages)/           # All customer-facing pages:
│   │   │   ├── shop/          #   product listing + [slug] product detail (reviews, related)
│   │   │   ├── cart/          #   cart page (CartProvider-driven)
│   │   │   ├── blogs/         #   blog listing, [slug] detail (comments/reactions),
│   │   │   │                  #   write/ (TipTap customer blog editor), my-submissions/
│   │   │   ├── enquiries/     #   enquiry form (tested)
│   │   │   ├── profile/       #   customer profile
│   │   │   ├── [pageSlug]/    #   ★ merchant-built custom pages from store_pages (see §11):
│   │   │   │                  #   published path (cached) + ?preview=1 draft path
│   │   │   │                  #   (uncached, admin-session-gated) + preview-bridge.tsx
│   │   │   └── …static pages: our-story, faqs, contact, careers, find-us, gift-packs,
│   │   │       ingredients, process, sustainability, wholesale, track-order, returns,
│   │   │       shipping, terms, privacy-policy, cookie-policy, refund-policy
│   │   │       (App Router serves these static siblings before [pageSlug]; all their
│   │   │        slugs are RESERVED — see lib/sections/registry.ts + drift test)
│   │   └── components/
│   │       ├── auth/          # AuthModal + AuthProvider (customer auth context)
│   │       ├── cart/          # CartProvider, CartDrawer, CouponField
│   │       ├── header/ footer/ hero/
│   │       ├── homepage/      # Section renderer + section components (featured products,
│   │       │                  # blog carousel, promo banner, shop-by-category…)
│   │       ├── sections/      # ★ Generalized section renderer shared by homepage + pages:
│   │       │                  # page-section-renderer, custom-code-frame (sandboxed iframe),
│   │       │                  # custom-code-section, rich-text-section (see §11)
│   │       ├── brand-provider.tsx   # Injects per-store branding CSS vars
│   │       ├── shop-card.tsx / share-buttons.tsx / structured-data.tsx
│   │
│   ├── dashboard/             # ★ STORE ADMIN DASHBOARD (per-store, auth-gated)
│   │   ├── layout.tsx         # Sidebar + topbar shell (dashboard.css)
│   │   ├── page.tsx           # Overview: metrics, revenue chart, activity, inventory…
│   │   ├── components/        # Dashboard widgets (executive-metrics, revenue-chart,
│   │   │                      # recent-orders-table, activity-feed, bulk-actions…)
│   │   ├── lib/               # access.ts, permissions.ts (role → allowed nav/actions),
│   │   │                      # list-params.ts, use-row-selection.ts
│   │   ├── products/          # CRUD + @modal intercepted route for quick edit
│   │   ├── categories/ colors/ blogs/ media/ homepage/   # content management
│   │   │   └── blogs/settings/  # blog feature toggles + per-store categories/tags manager
│   │   ├── builder/           # ★ Website Builder full-tab experience (see §11): pages list
│   │   │                      # + live preview iframe + per-section editing. builder-client,
│   │   │                      # pages-panel, sections-panel, section-form (shared editor forms),
│   │   │                      # code-editor(+-lazy) (CodeMirror), builder.css
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
│   │   │                      # review/enquiry/homepage/customer/customer-profile/
│   │   │                      # account-settings/set-password/invite-user/user-management/
│   │   │                      # user-group/role actions
│   │   ├── store-signup.ts    # Creates a new store (tenant onboarding)
│   │   ├── store-branding.ts  # Per-store branding updates
│   │   ├── store-settings.ts  # Read/save per-store feature settings (see lib/settings)
│   │   ├── blog-taxonomy-actions.ts  # Per-store blog categories/tags CRUD (+ propagation into blogs)
│   │   ├── store-domain.ts    # Custom domain connect + DNS verification (Resend)
│   │   ├── page-actions.ts    # ★ Custom-page CRUD + draft/publish (see §11): createPage/
│   │   │                      # updatePageMeta/savePageDraft/publishPage/unpublishPage/
│   │   │                      # deletePage, gated getManagerUserId("builder"), service-role
│   │   ├── platform.ts        # Platform-admin actions
│   │   └── _test-helpers.ts   # Shared mocks for action tests (co-located *.test.ts)
│   │
│   └── api/
│       ├── cron/send-emails/  # Daily email campaign worker (Vercel cron)
│       ├── og-image/          # Dynamic OG image generation
│       └── upload/            # File upload → Supabase Storage
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
│   │                          # resolve-data.ts (batched product/category/blog resolution
│   │                          # shared by homepage / [pageSlug] / preview). Tested (drift test).
│   ├── pages/                 # ★ preview.ts — uncached, cookie-authenticated draft loader
│   │                          # for the builder preview (getManagerUserId("builder") gate)
│   ├── email/                 # sender, layout, campaign-worker, coupon-campaign,
│   │                          # trigger-worker, blog/enquiry notifications
│   ├── homepage/section-types.ts  # Section schema (typed, tested) — shared by homepage AND
│   │                          # custom pages; types incl. rich_text + custom_code (see §11)
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
│   │                          # product_reviews, homepage_sections, email_campaigns,
│   │                          # rate_limits, card_colors, blog_comments/likes…
│   ├── blog_taxonomy.sql      # per-store blog_categories + blog_tags (+ RLS + seed)
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
   `blogs.customerSubmissions`, `blogs.requireApproval`.
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
    shared by the homepage AND custom pages. `rich_text` (inline sanitized
    HTML, SEO-friendly) and `custom_code` (merchant HTML/CSS/JS) are section
    types alongside the product/blog/banner ones. `lib/sections/registry.ts`
    re-exports it and adds page-level helpers: `PageSectionItem`,
    `validateSections`, `RESERVED_PAGE_SLUGS`, `validatePageSlug`. - **Custom pages** live in `store_pages` (draft `sections` jsonb +
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
    (registry, section `builder`), enforced **server-side** in BOTH
    `page-actions.ts` and `homepage-actions.ts`. - **Builder UI** at `/dashboard/builder` (permission section `builder`, group
    Content; sidebar link opens a new tab). A `fixed inset-0` overlay over the
    dashboard shell — kept at `z-index:40`, BELOW the shared `z-50` dialog layer,
    so the builder's own dialogs (new page, type chooser, section editor with its
    code editors) render above it with a working backdrop (the shell has no
    z-index, so the overlay still fully covers it). Pages panel + sections panel + center preview iframe
    (`/{slug}?preview=1`). Draft edits are local client state; **Save draft**
    writes the jsonb once (with `expectedUpdatedAt` stale-tab guard);
    **Publish** copies draft → published + `updateTag(TAGS.pages)` +
    `revalidatePath`. Code editing uses CodeMirror 6 lazy-loaded
    (`code-editor-lazy.tsx`, ssr:false, the TipTap `write-blog-editor-lazy`
    pattern) with a live `CustomCodeFrame` pane. - **Phase 4 (not built yet, by design)**: migrate the homepage into
    `store_pages` as slug `""`, seed the 17 hardcoded WholeSip static pages as
    rows, retire hardcoded pages, add a nav/footer menu builder.

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
- **Vercel**: hosting + cron. Wildcard domain `*.storemink.com` → store subdomains.
- **Resend**: transactional email + custom-domain DNS verification.
- **Gemini**: AI copy generation.

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
- **The website is dashboard-editable** (convention #11): the homepage and
  merchant-built custom pages are per-store data (sections + custom HTML/CSS/JS),
  edited in the Website Builder (`/dashboard/builder`) with live preview and a
  draft → publish workflow. Merchant JS is sandbox-isolated. This is the
  settings-based philosophy applied to the storefront itself; Phase 4 will fold
  the homepage + the remaining hardcoded static pages into this system.
- **Templates**: at signup the merchant picks a storefront template (filter by
  business category + free/paid, preview, plan-gated — e.g. "For STARTER and
  above"). Multiple visual templates are a planned core feature; today there is
  one storefront with per-store branding.
- **Deliberately later phases** (not built yet, by choice): orders + checkout +
  payments (BYO gateway — merchant connects own Razorpay/Cashfree), merchant
  subscription billing for StoreMink plans.
- **WholeSip cleanup is ongoing**: the product started as the WholeSip site and
  was converted into StoreMink; remaining WholeSip traces (`config/site.ts`,
  `brand/`, hardcoded storefront static pages, repo name) are being removed
  gradually as features become per-store/settings-based.
