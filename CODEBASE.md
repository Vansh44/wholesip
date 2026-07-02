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

| Layer     | Tech                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework | Next.js 16 (App Router, `--turbopack` dev) — **breaking-changes version; read `node_modules/next/dist/docs/` before writing code** (see AGENTS.md) |
| UI        | React 19, Tailwind CSS v4, shadcn/ui (`components/ui/`), Base UI, lucide-react, sonner (toasts), recharts (charts), TipTap (rich-text editor)      |
| Backend   | Supabase (Postgres + Auth + Storage + RLS), server actions in `app/actions/`                                                                       |
| Email     | Resend + nodemailer (`lib/email/`), Vercel cron `/api/cron/send-emails` (daily, `vercel.json`)                                                     |
| AI        | Gemini (`lib/ai/gemini.ts`) for AI copy actions; brand voice files in `brand/`                                                                     |
| Testing   | Vitest + Testing Library + jsdom, coverage via v8 (`coverage/` is generated output — never edit)                                                   |
| Deploy    | Vercel; CI on GitHub Actions (`.github/workflows/ci.yml`: lint → typecheck → test → prettier → build)                                              |

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
│   │   │   └── …static pages: our-story, faqs, contact, careers, find-us, gift-packs,
│   │   │       ingredients, process, sustainability, wholesale, track-order, returns,
│   │   │       shipping, terms, privacy-policy, cookie-policy, refund-policy
│   │   └── components/
│   │       ├── auth/          # AuthModal + AuthProvider (customer auth context)
│   │       ├── cart/          # CartProvider, CartDrawer, CouponField
│   │       ├── header/ footer/ hero/
│   │       ├── homepage/      # Section renderer + section components (featured products,
│   │       │                  # blog carousel, promo banner, shop-by-category…)
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
│   │   ├── marketing/coupons/ # coupon CRUD + coupon email campaigns
│   │   ├── enquiries/         # enquiry inbox + @modal detail
│   │   ├── users/             # customers + user_groups/ (segments)  [superadmin only]
│   │   ├── admins/ roles/     # staff invites + role management
│   │   ├── branding/          # per-store branding editor (logo, colors)
│   │   └── settings/          # account/ + domain/ (custom-domain connect + verify)
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
│   │   ├── store-domain.ts    # Custom domain connect + DNS verification (Resend)
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
│   ├── supabase/              # Client factories — pick the right one:
│   │   ├── server.ts          #   RSC/server-action client (cookie-based session)
│   │   ├── client.ts          #   Browser client
│   │   ├── admin.ts           #   Service-role client (bypasses RLS — server only!)
│   │   ├── public.ts          #   Anonymous client (cacheable, no cookies)
│   │   ├── middleware.ts      #   updateSession() used by proxy.ts (JWT claims fast-path)
│   │   ├── storage.ts / storage-cleanup.ts
│   ├── storefront/            # queries.ts (cached storefront reads), tags.ts (cache tags)
│   ├── email/                 # sender, layout, campaign-worker, coupon-campaign,
│   │                          # trigger-worker, blog/enquiry notifications
│   ├── homepage/section-types.ts  # Homepage section schema (typed, tested)
│   ├── ai/gemini.ts           # Gemini client for AI copy
│   ├── pricing.ts / slug.ts / sanitize.ts / rate-limit.ts / og-image.ts
│   ├── blog-config.ts / blog-reactions.ts / phone-labels.ts / use-otp-throttle.ts
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
