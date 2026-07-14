# GCP Migration — Phase 5 (Database) + Phase 6 (Auth)

> Detailed implementation plan for the hard spine of the Supabase → Google Cloud
> migration. Decisions locked 2026-07-14: **1A** (GCP-native managed products) +
> **2A** (keep DB-level RLS, enforced via a `SET LOCAL` session variable instead
> of Supabase's `auth.uid()`). Query builder: **Drizzle**.
>
> Target end-state: Cloud SQL for Postgres + Drizzle in server actions; Google
> Cloud **Identity Platform** for auth. Email (Resend) and payments (Razorpay)
> are intentionally NOT migrated.

## 0. The organising insight — the `SET LOCAL` seam decouples DB from Auth

RLS enforcement today lives entirely inside three `SECURITY DEFINER` helpers
(`is_store_admin`, `is_store_superadmin`, `is_superadmin`) that call `auth.uid()`,
plus a handful of direct `auth.uid()` policy branches. The JWT `store_id` claim is
**decorative** — RLS never reads it (confirmed by the header comment in
`multitenant_03_rls.sql` and by `perf_rls_initplan.sql`).

Under 2A, enforcement becomes `current_setting('app.current_user_id')`. That value
is **just a verified user id** — its _source_ is irrelevant. Therefore:

- **Phase 5** can move the database to Cloud SQL + Drizzle while **still using the
  existing Supabase session** as the identity source (verify the Supabase JWT
  server-side, extract `sub`, `SET LOCAL`). Supabase Auth keeps running, untouched.
- **Phase 6** then swaps _only_ the identity provider feeding that id
  (Supabase → Identity Platform). The data layer is already done and doesn't move.

This converts a coupled big-bang into two independent, individually-reversible
migrations. **Do Phase 5 fully before starting Phase 6.**

### The compatibility shim that saves ~23 files of policy edits

Rather than rewrite every `auth.uid()` reference across 23 SQL files, define
compatibility functions in Cloud SQL that read the GUC:

```sql
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
  $$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_user_email', true), '')
  $$;
```

With these in place, **every existing RLS policy and helper ports verbatim** —
`is_store_admin`, `is_store_superadmin`, `is_superadmin`, `is_platform_admin`
(uses `auth.email()`), `is_platform_superadmin`, and the direct customer-own
branches (`blogs`, `product_reviews`, `blog_comments`, `orders`, `customer_addresses`,
`user_group_members`, `users`, …). The only new work is the per-request wrapper
that sets the two GUCs. `true` as the 2nd arg to `current_setting` makes it return
NULL (not error) when unset, so anon/storefront reads with no GUC set correctly
fall through to the public `published`/`active` policy branches.

---

## PHASE 5 — Supabase Postgres → Cloud SQL + Drizzle

### Surface (measured)

- **455** `.from()` call sites (73 `.single()`, 84 `.maybeSingle()`).
- Client factories: `server.ts` (48 importers, RLS-scoped) · `client.ts` (10, browser RLS) · `admin.ts` (44, RLS-bypass) · `public.ts` (5, anon cached).
- **14 distinct RPCs / 18 call sites** — all already parameter-driven (`p_store_id`, `p_store`, …), none use `auth.uid()`. **They port to Cloud SQL unchanged.**
- **1 Supabase-platform-specific dependency**: Realtime (`realtime-refresher.tsx`).

### 5.1 — Provision & data move

1. **Cloud SQL for Postgres**, matching Supabase's major version (check the live
   project; Supabase is PG15/16). Enable the **Cloud SQL Auth Proxy** / Go
   connector for secure connections from Cloud Run and local dev.
2. **Schema + data**: `pg_dump --schema=public --no-owner --no-privileges` from
   Supabase → restore into Cloud SQL. Do the `auth` schema separately — in Cloud
   SQL it is replaced by the two shim functions above, NOT the Supabase auth
   tables (those belong to Identity Platform in Phase 6).
3. **Extensions**: recreate what the schema uses (`pgcrypto` for `gen_random_uuid`,
   etc.). Verify `gen_random_uuid()` availability (core in PG13+, fine).
4. **Roles**: create two DB roles —
   - `app_user` — RLS **enforced** (no `BYPASSRLS`). Used by the user/anon path.
   - `app_service` — `BYPASSRLS`. Replaces the service-role key path.

### 5.2 — Drizzle foundation (`lib/db/`)

1. Add deps: `drizzle-orm`, `drizzle-kit`, `pg`, `@google-cloud/cloud-sql-connector`.
2. `drizzle-kit introspect` against the migrated DB → generates typed schema from
   existing tables (no hand-authoring). Hand-add **relations** for the nested reads
   (see 5.4-D).
3. Two pooled entrypoints in `lib/db/`:
   - `db()` — pool as `app_service` (BYPASSRLS). Drop-in for `createAdminClient()`.
   - `dbAsUser(uid, email?)` — pool as `app_user`, returns a helper that runs work
     **inside a transaction** that first issues `SET LOCAL app.current_user_id = $uid`
     (and `app.current_user_email` when present). Replaces `server.ts`/`client.ts`
     server usage. For anon/storefront, `dbAnon()` runs with **no GUC set**.

> **Pooling discipline (critical):** `SET LOCAL` is transaction-scoped, so identity
> can never leak across pooled connections **as long as every user-scoped query
> runs inside the transaction that set it.** `dbAsUser` must own the BEGIN/COMMIT.
> This is compatible with PgBouncer transaction-mode pooling if you add it later.

### 5.3 — Identity source during Phase 5 (temporary)

Server-side, keep verifying the **Supabase** access token to get the uid/email that
feed `dbAsUser`. Concretely, replace the ~35 `supabase.auth.getUser()` gate sites
with a single `getServerUser()` helper that (for now) validates the Supabase JWT
and returns `{ id, email, phone, claims }`. In Phase 6 you swap the _insides_ of
this one helper; its callers never change. **Build this helper first** — it is the
seam both phases pivot on.

### 5.4 — Port the data layer (the bulk of the work)

Port **domain by domain**, running each domain's existing Vitest suite as you go.
Recommended order (leaf/low-risk → transactional/high-risk):

1. Count pages & simple reads: `colors`, `categories`, `enquiries` counts (validate the RPC-via-Drizzle pattern).
2. Storefront cached reads (`lib/storefront/queries.ts`, `resolve.ts`) — `public.ts` → `dbAnon()`.
3. CRUD actions: products, blogs, coupons, reviews, users, addresses.
4. `order-actions.ts`, then `checkout-actions.ts` **last** (RPCs + multi-step rollback + coupon/stock reservation — the riskiest, most-tested file).

Pattern translations:

- **A. list + count + range**: `.select(cols,{count:'exact'}).eq().order().range()` → Drizzle `select().where(eq()).orderBy().limit().offset()` + a `count()` query.
- **B. `.in()` store-scoped**: → `where(and(inArray(t.id, ids), eq(t.store_id, storeId)))`.
- **C. conditional-update "claim"**: `.update().eq().eq().select('id')` → `db.update(t).set().where(and(...)).returning({id:t.id})` (the atomic reserve/release pattern is preserved).
- **D. nested embeds (joins)** — the PostgREST feature needing the most care.
  `"*, category:categories(...), variants:product_variants(*)"` → Drizzle relational
  query `db.query.products.findMany({ with: { category:true, variants:true }})`.
  Requires declaring `relations()` in the schema. `!inner` embeds → `.innerJoin`.
- **RPCs (14)**: call the _unchanged_ Postgres functions via
  `db.execute(sql\`select _ from reserve_stock(${p_store}, …)\`)`. Keep every
`_.sql` function file as-is; they already take explicit params.
- **`.single()` / `.maybeSingle()`**: Drizzle returns arrays — add tiny
  `one()`/`maybeOne()` helpers so the 157 call sites read cleanly.

### 5.5 — Realtime replacement (the one true gap)

`realtime-refresher.tsx` uses Supabase `postgres_changes`; Cloud SQL has no
equivalent socket. Options, cheapest first:

- **(a) Poll + `visibilitychange`** — a 15–30s `router.refresh()` interval plus the
  existing visibility trigger. ~10 lines, ships day one, slightly less live.
- **(b) Postgres `LISTEN/NOTIFY` → SSE** — a small Cloud Run endpoint holding a
  `LISTEN` connection, streaming to the client via Server-Sent Events; DB triggers
  `NOTIFY` on the watched tables. True realtime, moderate build.

Recommend **(a) for cutover**, **(b)** later if the dashboard needs live updates.

### 5.6 — Cutover

Dry-run the dump/restore and a full test pass against Cloud SQL. Then a short
maintenance window: final `pg_dump` (or logical replication to minimise
downtime) → restore → flip `lib/db` connection env → deploy. Rollback = point
`lib/db` back at Supabase's Postgres (the Drizzle code works against either, since
the shim functions can also be created in Supabase's DB).

---

## PHASE 6 — Supabase Auth → Identity Platform

### Surface (measured)

Auth methods in use: `signUp`, `signInWithPassword`, `signInWithOtp` (phone + email),
`signInWithOAuth` (Google), `verifyOtp` (`sms` / `phone_change`), `getUser`,
`getSession`, `updateUser` (password/phone/email), `refreshSession`, `signOut`,
`onAuthStateChange`, `exchangeCodeForSession`, `resetPasswordForEmail`,
`auth.admin.{createUser,deleteUser,updateUserById}`. Two custom JWT claims only:
`user_role`, `force_password_reset`. Cross-subdomain cookie: `.storemink.com`.

### 6.1 — Provision Identity Platform

Enable Identity Platform; turn on providers: **Email/Password**, **Google**,
**Phone (SMS)**. Phone auth requires reCAPTCHA (dovetails with the pending
Auth-CAPTCHA hardening item). Add the Firebase Admin SDK (`firebase-admin`) for
server, and the client SDK (`firebase/auth`) for the wizard/login components.

### 6.2 — User import (preserves every FK)

`admins.id` / `users.id` currently equal the Supabase auth uid, and are foreign
keys throughout. **Import users into Identity Platform preserving the same uid**
via `admin.auth().importUsers()` — it accepts an explicit `uid`, `email`, `phone`,
and **bcrypt** password hashes (Supabase uses bcrypt, so passwords carry over with
no reset). Result: `admins.id`/`users.id` keep matching, and the entire data layer
from Phase 5 needs zero key remapping. Export Supabase users via the auth admin API
/ `auth.users` dump.

### 6.3 — Session model (the architectural change)

Supabase SSR cookies → Firebase **session cookies**:

- New route `POST /api/auth/session`: receives a Firebase **ID token** from the
  client after any sign-in, verifies it (`admin.auth().verifyIdToken`), mints a
  session cookie (`admin.auth().createSessionCookie`, ~14-day), sets it
  `httpOnly`, `Secure`, `Domain=.storemink.com` (reuse `cookieDomainForHost`).
- New route `POST /api/auth/signout`: clears the cookie (+ optional `revokeRefreshTokens`).
- **`getServerUser()`** (from 5.3): swap its insides to `verifySessionCookie` and
  return `{ id, email, phone, claims }`. Every server-action gate and the
  `dbAsUser` feed keep working unchanged.

> **Edge-runtime gotcha:** `proxy.ts` is edge middleware; `firebase-admin` is
> Node-only. Verify the session cookie at the edge with **`jose`** against Google's
> public session-cookie certs (session cookies are standard JWTs), OR run the
> middleware on the Node runtime. Confirm the Next.js 16 middleware-runtime options
> in `node_modules/next/dist/docs/` before choosing (per AGENTS.md).

### 6.4 — Custom claims

`role` + `force_password_reset` → Firebase custom claims via
`admin.auth().setCustomUserClaims(uid, {...})`, set on invite, role change, and
password-set (replacing `custom_access_token_hook`). They ride in the ID token →
session cookie → middleware decodes them with `jose` (mirrors `decodeClaims`). The
`refreshSession()` trick in `set-password.ts` becomes: force an ID-token refresh
(`getIdToken(true)`) then re-mint the session cookie so a cleared
`force_password_reset` propagates. **Also fix the `proxy.ts` fallback**, which reads
`profiles` while everything else reads `admins` — standardise on `admins`.

### 6.5 — Flow-by-flow rewrite

| Current (Supabase)                                                                  | Identity Platform replacement                                                                                                                                                                       |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signInWithPassword`                                                                | `signInWithEmailAndPassword` → POST ID token to `/api/auth/session`                                                                                                                                 |
| `signUp` (wizard)                                                                   | `createUserWithEmailAndPassword` → `/api/auth/session`                                                                                                                                              |
| `signInWithOAuth(google)` + `exchangeCodeForSession` (2 callback routes)            | `signInWithPopup`/`signInWithRedirect(GoogleAuthProvider)`; on redirect result, POST ID token to `/api/auth/session`. **The `/auth/callback` + `/platform/auth/callback` PKCE routes are removed.** |
| `signInWithOtp({phone})` + `verifyOtp('sms')` (storefront/AuthModal)                | `signInWithPhoneNumber` (RecaptchaVerifier) + `confirmationResult.confirm(code)`                                                                                                                    |
| `updateUser({phone})` + `verifyOtp('phone_change')` (wizard, set-password, account) | `updatePhoneNumber` via `PhoneAuthProvider.verifyPhoneNumber` + credential                                                                                                                          |
| `updateUser({password/email})`                                                      | `updatePassword` / `updateEmail` (or Admin)                                                                                                                                                         |
| `resetPasswordForEmail`                                                             | `sendPasswordResetEmail`                                                                                                                                                                            |
| `signOut`                                                                           | client `signOut()` + `/api/auth/signout`                                                                                                                                                            |
| `onAuthStateChange` (AuthProvider)                                                  | `onIdTokenChanged` / `onAuthStateChanged`                                                                                                                                                           |
| `auth.admin.createUser` / `deleteUser` / `updateUserById(ban)`                      | `admin.auth().createUser` / `deleteUser` / `updateUser({disabled})`                                                                                                                                 |
| operator email-OTP login (`signInWithOtp` email)                                    | email-link sign-in, or move operators to Google/password                                                                                                                                            |
| enquiries `otpClient()` (verify phone, no login)                                    | phone verify on a secondary Firebase app instance; discard the session                                                                                                                              |

`user.phone_confirmed_at` / `user_metadata.{full_name,name,given_name,family_name}`
(read in `store-signup.ts`) map to Firebase `phoneNumber` + provider `displayName` —
supply equivalents where the wizard reads them.

### 6.6 — Console / redirect config

Configure OAuth redirect/authorised domains in the Identity Platform + Google Cloud
OAuth client for `storemink.com` and `*.storemink.com` (mirrors the Supabase
Redirect-URL matrix in CODEBASE.md §7). Update env: drop
`NEXT_PUBLIC_SUPABASE_*`/`SUPABASE_SERVICE_ROLE_KEY`, add Firebase web config +
Admin service-account credentials.

### 6.7 — Tests

Every auth-mocking test updates to the Firebase contract: `set-password.test`,
`account-settings.test`, `user-management.test`, `customer-actions.test`,
`invite-user.test`, `customer-profile.test`, `blog-actions.test`, `blog-social.test`,
`role-actions.test`, `review-actions.test`, `AuthProvider.test`. Centralising auth
behind `getServerUser()` + the Firebase client wrapper shrinks the mock surface.

---

## Sequencing, risk, effort

**Order:** 5.1 → 5.2 → **5.3 (`getServerUser` seam) → the `auth.uid()`/`auth.email()`
shim** → 5.4 domain-by-domain → 5.5 → 5.6 cutover → **then** all of Phase 6.

**Highest-risk items:** (1) `checkout-actions.ts` port (RPCs + rollback); (2)
transaction-scoped `SET LOCAL` discipline (a leak = cross-tenant exposure — add a
test that asserts identity does not survive across pooled connections); (3) edge
verification of Firebase session cookies; (4) user import preserving uids.

**Rough effort:** Phase 5 ≈ the large majority (455 sites, relations, checkout,
realtime). Phase 6 ≈ smaller but higher-stakes (sessions + import). Neither is a
weekend; plan in domain-sized increments, each shippable and test-gated.

**What does NOT change:** all Postgres RPC/trigger function bodies; the store-per-host
resolution model; `getActingStoreId`/`getManagerUserId`/`requireSectionAccess` call
sites (only their internals shift to `getServerUser` + Drizzle); the `.storemink.com`
cookie-sharing behaviour; RLS _policies_ (thanks to the shim).
