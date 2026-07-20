# Payments, Plans & AI Credits — Implementation Plan

> Scope: (1) per-store Razorpay BYO gateway → online payments at checkout,
> (2) plan catalog rework (free / basic ₹500 / pro ₹1500, timed operator
> upgrades), (3) purchasable non-expiring AI credits + AI-usage dashboard,
> (4) operator console: full plan/credit visibility & control.
>
> Status: **IMPLEMENTED** (all phases P1–P5, 2026-07-11, branch `f1`). Open
> questions in §8 were answered by the owner and are reflected in the code.
> Pending manual steps before go-live:
>
> 1. Apply the new SQL to Supabase (in order): `plans_02_basic_and_expiry.sql`,
>    `ai_credits.sql`, `payment_providers.sql`, `payments_01_orders.sql`.
> 2. Set env vars: `PAYMENT_CRED_KEY` (`openssl rand -base64 32`),
>    `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (platform account, credits
>    only), and ensure `CRON_SECRET` is set (crons 401 without it).
> 3. Vercel picks up the two new crons from `vercel.json` on deploy
>    (`/api/cron/plan-expiry` daily, `/api/cron/expire-pending-payments`
>    hourly).

---

## 0. Current state (verified in code)

| Area         | Today                                                                                                                                                                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plans        | `lib/plans.ts`: `free / starter / pro` (₹0 / ₹499 / ₹1499), AI caps 10 / 100 / unlimited. `stores.plan` CHECK-constrained (`plans_01_schema.sql`), `plan_source`, append-only `plan_events`. `setStorePlan` (platform.ts) is **upgrade-only**, no expiry concept. |
| Landing page | `app/platform/page.tsx` hardcodes **4 plans** (Free ₹0 / Starter ₹399 / Growth ₹999 / Pro B2B ₹2,499) — already drifted from the real catalog.                                                                                                                    |
| AI metering  | `lib/ai/quota.ts` — `consumeAiQuota` reads `stores.plan`, meters via atomic `try_ai_generation` RPC + `ai_usage(store_id, period, used)` (brand_voice_01_schema.sql). Fails open. Called before Gemini in every AI action.                                        |
| Checkout     | COD only. `placeOrder` writes `payment_method: "cash_on_delivery"`, `payment_status: "pending"`. Orders table already has `payment_method` / `payment_status` columns. Stock/coupon reserve + rollback machinery exists (`stock_status` reserved/released).       |
| Cron         | One Vercel cron (daily `/api/cron/send-emails`). Multiple crons are supported.                                                                                                                                                                                    |
| Secrets rule | ⚠ `stores.settings` is **anon-readable** (CODEBASE §5.9). Razorpay secrets must live in a service-role-only table (the `store_brand_profiles` pattern), never in settings.                                                                                        |

---

## 1. Phase P1 — Plan catalog rework + timed plans (foundation for everything else)

### 1.1 Catalog (`lib/plans.ts`)

- `PLAN_IDS = ["free", "basic", "pro"]` — **rename `starter` → `basic`**.
- `PLAN_META`: Basic ₹500/mo, Pro ₹1500/mo (yearly: proposal ₹5,000 / ₹15,000 — see §8 Q1).
- `PLAN_LIMITS.aiGenerationsPerMonth`: **free 3, basic 10, pro 50** (pro loses
  `null`/unlimited — this makes metering apply to every plan).
- Keep `normalizePlan` mapping unknown → free, but add a legacy alias
  `"starter" → "basic"` so any un-migrated row degrades safely during rollout.
- Remove/relax `isUpgrade`-only helpers where the console consumes them
  (operator may now set ANY plan — see 1.3).

### 1.2 SQL — `supabase/plans_02_basic_and_expiry.sql`

```sql
-- rename starter → basic + widen CHECK
update public.stores set plan = 'basic' where plan = 'starter';
alter table public.stores drop constraint if exists stores_plan_check;
alter table public.stores
  add constraint stores_plan_check check (plan in ('free','basic','pro'));

-- timed plans: NULL = indefinite
alter table public.stores add column if not exists plan_expires_at timestamptz;
```

`plan_events` gains nothing structurally (note goes in `note`, e.g.
"expires 2026-10-11"). Rollback block included as usual.

### 1.3 Timed upgrades + any-direction plan set (operator)

- `setStorePlan(storeId, plan, { expiresAt?: string | null })` —
  superadmin-gated as today, **drops the upgrade-only restriction** (owner
  requirement: "upgrade any store to whatever plan I want"), records
  `plan_events` with the expiry in `note`, busts `STORE_TAG`.
  Downgrades stay _soft_ (existing data never deleted — convention already
  documented in plans.ts).
- **Expiry enforcement, two layers**:
  1. **Read-time guard (precise):** pure helper in `lib/plans.ts`:
     `effectivePlan({ plan, plan_expires_at })` → expired ⇒ `"free"`.
     Threaded through the ~5 plan read-sites: `lib/ai/quota.ts`,
     `lib/settings/resolve.ts`, product/staff/coupon cap checks in their
     actions, storefront badge logic.
  2. **Durable flip (cron):** new `/api/cron/plan-expiry` (daily, vercel.json)
     — flips expired stores to `free`, clears `plan_expires_at`, writes a
     `plan_events` row (`source: "system"`), busts `STORE_TAG`.
- Console UI (stores-console): plan dialog = plan picker (all 3) + duration
  (1 / 3 / 6 / 12 months / custom date / indefinite), shows current expiry.

### 1.4 Landing page

Replace the hardcoded 4-plan `PLANS` array in `app/platform/page.tsx` with a
3-plan array **derived from `PLAN_META` + `PLAN_LIMITS`** (price and AI counts
render from the catalog so they can never drift again). Feature bullets per
plan include the AI generation counts (3 / 10 / 50 per month).

### 1.5 Tests / docs

- Update `lib/plans.test.ts` (ids, ranks, alias, `effectivePlan` boundary
  cases: exactly-now, null, past, future).
- `setStorePlan` tests: downgrade allowed, expiry persisted, audit row.
- CODEBASE.md §15 rewrite.

**Est: ~1 day. No dependency on payments.**

---

## 2. Phase P2 — AI credits (ledger + consumption + store dashboard)

### 2.1 Model

- Monthly plan allowance (resets, from P1 caps) is consumed **first**; the
  purchased/granted credit balance (never expires) is consumed **second**.
  Rationale: burn the expiring resource before the permanent one.
- Credits are integers, per store, no expiry (owner requirement).

### 2.2 SQL — `supabase/ai_credits.sql`

```text
ai_credit_balances (store_id PK → stores, balance int NOT NULL DEFAULT 0 CHECK (balance >= 0), updated_at)
ai_credit_ledger   (id uuid PK, store_id, delta int, kind CHECK IN ('purchase','grant','spend'),
                    ref text,            -- razorpay payment id / operator email / action name
                    note text, created_at)
  + UNIQUE partial index ON (kind, ref) WHERE kind = 'purchase'   -- idempotent purchase grants
ai_credit_purchases(id uuid PK, store_id, pack_id text, credits int, amount_inr int,
                    rzp_order_id text UNIQUE, rzp_payment_id text,
                    status CHECK IN ('pending','paid','failed'), created_at, updated_at)
```

RLS: `revoke all from anon, authenticated` on all three — service-role only
(the `store_counters` / `plan_events` pattern; a live balance/ledger leaks
usage volume).

RPCs (atomic, the `increment_coupon_usage` pattern):

- `add_ai_credits(p_store, p_delta, p_kind, p_ref, p_note)` — upsert balance +
  ledger row; **no-op returning false if a `purchase` ref already exists**
  (idempotency under webhook/callback races).
- `try_spend_ai_credit(p_store)` — single conditional
  `UPDATE … SET balance = balance - 1 WHERE balance > 0 RETURNING true` +
  ledger `spend` row.

### 2.3 Quota integration (`lib/ai/quota.ts`)

`consumeAiQuota` becomes: monthly `try_ai_generation` → if exhausted,
`try_spend_ai_credit` → if that also fails, blocked with a plan-aware message
("Buy AI credits" for basic/pro, "Upgrade" for free). Returns which source was
consumed (for UI copy). Still fails OPEN on transient RPC errors.
`getAiUsage` returns `{ used, cap, creditBalance }`.

### 2.4 Store dashboard — AI usage section

- New nav section `ai` (label "AI usage", group Administration) in
  `app/dashboard/lib/permissions.ts`; route `/dashboard/ai`.
- Page shows: monthly bar (used / cap from plan), credit balance, recent
  ledger (purchases/grants/spends), and the **Buy credits** panel —
  rendered only when `planAllows(effectivePlan, "basic")`; free plan sees an
  upgrade prompt instead. Enforcement is server-side in the purchase action,
  not just hidden UI (convention #9).

**Est: ~1–1.5 days. Depends on P1 (caps + effectivePlan). Purchases wired in P4.**

---

## 3. Phase P3 — BYO Razorpay per store (Channels) + online checkout

The security-sensitive phase. Merchant connects their OWN Razorpay account;
money settles directly with them (platform never touches order funds).

### 3.1 Credential storage — `supabase/payment_providers.sql`

```text
store_payment_providers (
  store_id uuid PK → stores,
  provider text NOT NULL DEFAULT 'razorpay' CHECK (provider = 'razorpay'),
  key_id text NOT NULL,
  key_secret_enc text NOT NULL,   -- AES-256-GCM, app-layer encrypted
  enabled boolean NOT NULL DEFAULT false,
  created_at, updated_at
)
```

- `revoke all from anon, authenticated` — service-role only. **NEVER** in
  `stores.settings` (anon-readable — CODEBASE §5.9 warning).
- App-layer encryption: `lib/payments/crypto.ts` — AES-256-GCM with env
  `PAYMENT_CRED_KEY` (32-byte base64). Defense in depth over an already
  non-granted table; key rotation = decrypt-reencrypt script.

### 3.2 Razorpay server lib — `lib/payments/razorpay.ts` (server-only, no SDK — plain fetch + basic auth)

- `rzpCreateOrder(creds, { amountPaise, receipt, notes })`
- `rzpFetchOrderPayments(creds, orderId)` — reconciliation source of truth
- `verifyCheckoutSignature(creds, orderId, paymentId, signature)` — HMAC-SHA256
- `validateCredentials(creds)` — cheap authenticated GET (used by "Verify & save")
- Pure signature helpers unit-tested.

### 3.3 Channels UI

- New permission section `channels` (group Administration) → route
  `/dashboard/channels`: "Digital payments" card → Razorpay panel.
- `app/actions/payment-provider-actions.ts` (gated `getManagerUserId("channels")`):
  - `getChannelState()` → `{ connected, keyId, enabled }` — **secret never
    returned** (write-only; masked display).
  - `saveRazorpayCredentials(keyId, keySecret)` — validates against the
    Razorpay API before saving (bad keys rejected immediately), encrypts,
    upserts.
  - `setRazorpayEnabled(bool)`, `disconnectRazorpay()`.
- Plan gate: `PLAN_LIMITS.onlinePayments` (basic+; see §8 Q2) enforced
  server-side in save/enable AND at checkout-time.

### 3.4 Checkout flow (Razorpay Standard Checkout)

1. **Availability:** new `getCheckoutConfig()` server action → the checkout
   client gets `{ onlinePayments: boolean, keyId?: string }` — computed
   server-side: provider row exists + `enabled` + plan allows. If false, the
   payment-method selector doesn't render (COD-only, exactly today's UI).
2. **Method selector:** COD (default) | "Pay online — UPI / cards / netbanking".
3. **`placeOrder(form, items, coupon, paymentMethod)`:**
   - `cod` → unchanged path.
   - `razorpay` → all existing validation/repricing/coupon/stock-reserve
     machinery runs identically, order row inserted with
     `payment_method: 'razorpay'`, `payment_status: 'pending'`; then a
     Razorpay Order is created with the **server-computed total** (never the
     client's), `receipt = order_ref`, `notes = { order_id, store_id }`;
     `razorpay_order_id` stored on our order (new columns —
     `supabase/payments_01_orders.sql`: `razorpay_order_id text`,
     `razorpay_payment_id text`, partial unique index on `razorpay_order_id`).
     RZP-order-creation failure → existing rollback chain (stock → order →
     coupon). Returns `{ orderId, orderRef, rzpOrderId, keyId, amountPaise }`.
4. **Client:** loads `https://checkout.razorpay.com/v1/checkout.js`, opens the
   modal; on success calls `confirmOnlinePayment(orderId, rzpPaymentId,
rzpSignature)` → server verifies HMAC with the store's decrypted secret →
   idempotent `payment_status = 'paid'` (+ payment id) → success page.
   Modal dismissed → "Payment not completed" + retry (same RZP order accepts
   another attempt) — order stays `pending` for the reaper.
5. **Reconcile-on-read instead of merchant webhooks (v1 decision):**
   requiring every merchant to configure a webhook + secret in their Razorpay
   dashboard is the #1 onboarding killer. Instead:
   - Success/confirmation page (and the dashboard order view) can trigger a
     server-side `rzpFetchOrderPayments` check when an order is still
     `pending` — a captured payment found ⇒ mark paid.
   - **Reaper cron** `/api/cron/expire-pending-payments` (hourly): for
     razorpay orders `pending` older than 45 min → query Razorpay first;
     captured ⇒ mark paid (never lose a paid order); nothing captured ⇒
     release stock (existing `reserved → released` conditional transition),
     release coupon, `payment_status = 'failed'`, `status = 'cancelled'`.
   - A per-store webhook endpoint is a **later enhancement** (optional
     instant capture), not a v1 requirement.
6. **Refunds:** out of scope v1 — merchant refunds from their own Razorpay
   dashboard; our order status is updated manually (documented).

### 3.5 Tests

- Signature verify (known-vector HMAC), amount always server-derived,
  placeOrder razorpay branch (mock fetch): success, RZP-create failure
  rollback, confirm-payment idempotency + bad-signature rejection, reaper
  logic (captured vs not).

**Est: ~2.5–3 days. Depends on P1 (plan gate) only.**

---

## 4. Phase P4 — Buying AI credits (platform's own Razorpay account)

Reuses P3's client checkout bits + P2's ledger. Credits revenue is
**StoreMink's**, so this uses PLATFORM env credentials
(`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`), completely separate from any
store's BYO gateway (a store does NOT need Channels configured to buy credits).

### 4.1 Pack catalog — `lib/ai/credits.ts` (pure, one place to reprice)

See §7 for the pricing analysis. Proposed:

| Pack    | Credits | Price | ₹/credit |
| ------- | ------- | ----- | -------- |
| Small   | 25      | ₹59   | 2.36     |
| Popular | 60      | ₹129  | 2.15     |
| Bulk    | 150     | ₹299  | 1.99     |

### 4.2 Flow (`app/actions/ai-credit-actions.ts`)

- `startCreditPurchase(packId)` — gated: dashboard manager + plan allows
  (`basic`+, server-side; free → upgrade error). Creates
  `ai_credit_purchases` row (`pending`) + platform Razorpay order
  (`notes: { store_id, purchase_id }`); returns checkout params.
- `confirmCreditPurchase(purchaseId, paymentId, signature)` — HMAC verify with
  platform secret → mark purchase `paid` → `add_ai_credits(kind:'purchase',
ref: paymentId)` (idempotent — double-confirm is a no-op).
- Dropped-callback recovery: on AI-usage page load, any `pending` purchase
  older than a few minutes is reconciled against the Razorpay API
  (same reconcile-on-read pattern as P3) — no webhook needed for v1.

**Est: ~1 day. Depends on P2 + P3's razorpay lib.**

---

## 5. Phase P5 — Operator console (platform dashboard)

Extend `stores-console.tsx` + `app/actions/platform.ts` (all superadmin-gated,
service-role, audited):

- **Columns/row detail per store:** plan, plan_source, plan expiry, AI monthly
  used/cap (join `ai_usage` current period), credit balance
  (`ai_credit_balances`).
- **Set plan** dialog (from P1): any plan + duration.
- **Grant credits** dialog: `grantAiCredits(storeId, amount, note)` →
  `add_ai_credits(kind:'grant', ref: operatorEmail)` — free of cost, audited
  in the ledger (owner requirement).
- **Audit drawer** per store: `plan_events` + `ai_credit_ledger` history.
- (Visibility of Channels status — connected/enabled — read-only flag in the
  row detail; never the keys.)

**Est: ~0.5–1 day. Depends on P1 + P2.**

---

## 6. Cross-cutting

- **Env additions** (document in CODEBASE §7): `PAYMENT_CRED_KEY` (32-byte
  base64, credential encryption), `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`
  (platform account, credits only).
- **vercel.json**: + `/api/cron/plan-expiry` (daily), +
  `/api/cron/expire-pending-payments` (hourly). Cron routes must be protected
  (Vercel cron header check / CRON_SECRET), matching send-emails.
- **CODEBASE.md**: new §18 (Payments/Channels), §15 rewrite (plans), §16
  update (credits), directory tree + actions list + SQL list additions —
  same-commit rule.
- **CSP/embedding**: checkout.js is an external script on the storefront
  checkout page only — verify no CSP header blocks it (none is currently set
  app-wide).
- **Tests run in CI** as usual (lint, typecheck, vitest, build).

### Suggested sequencing

```
P1 (plans+expiry) ──► P2 (credits core) ──► P4 (buy credits)
        │
        └────────────► P3 (BYO razorpay checkout) ──► P5 (operator console polish)
```

P1 first (everything reads the catalog), then P3 can proceed in parallel with
P2/P4. Total ≈ **6–7.5 dev-days**.

---

## 7. Credit pricing analysis (Gemini 2.5 Flash)

**Model cost** (paid tier): $0.30 / 1M input tokens, $2.50 / 1M output tokens —
and note `lib/ai/gemini.ts` uses thinking mode, whose tokens bill as OUTPUT.

**Token profile per generation in this codebase** (brand guide + task prompt +
product data in; copy + thinking out):

| Scenario                          | Input | Output (incl. thinking) | USD     | INR (₹87/$) |
| --------------------------------- | ----- | ----------------------- | ------- | ----------- |
| Typical product desc / SEO        | ~2K   | ~1.5K                   | $0.0044 | **₹0.38**   |
| Heavy (long guide, long thinking) | ~3K   | ~3K                     | $0.0084 | **₹0.73**   |
| Brand-guide generation (worst)    | ~2K   | ~4K                     | $0.0106 | **₹0.92**   |

**⇒ COGS ≈ ₹0.4–0.9 per credit; budget ₹1 with buffer.**

### Credit Pack Pricing

**Other unit economics:** Razorpay MDR is approximately **2% + 18% GST on the MDR (≈2.36%)** of the pack price. Assuming an **average AI generation cost of ₹0.70** (≈₹0.83 including GST if input tax credit is not considered), the proposed credit packs remain profitable while offering a much lower entry price for users.

**Price anchoring against the plan ladder:** The Basic plan includes **10 AI generations for ₹500 (≈₹50/generation)**, while the Pro plan includes **50 AI generations for ₹1,500 (≈₹30/generation)**. Credit packs are intended as **top-ups**, not subscription replacements, so they remain significantly cheaper than the bundled per-generation value while maintaining healthy gross margins.

| Pack        | Price | ₹/Credit | Estimated Cost/Credit\* | Gross Margin |
| ----------- | ----: | -------: | ----------------------: | -----------: |
| 25 Credits  |   ₹59 |    ₹2.36 |                  ~₹0.88 |         ~63% |
| 60 Credits  |  ₹129 |    ₹2.15 |                  ~₹0.88 |         ~59% |
| 150 Credits |  ₹299 |    ₹1.99 |                  ~₹0.87 |         ~56% |

\*Estimated cost per credit assumes:

- Average AI cost: **₹0.70**
- 18% GST on AI cost (worst-case, if input tax credit is not considered): **₹0.13**
- Razorpay processing fee: **~2.36%** of the pack price

Even at these prices, every credit remains profitable while making AI features more accessible to early-stage merchants. Pricing is approximately **2.3–2.7×** the average marginal cost, providing healthy gross margins while encouraging adoption. All pricing is centralized in `lib/ai/credits.ts`, making future repricing a one-file change.

---

## 8. Open questions (owner)

1. **Yearly prices** for Basic/Pro? Proposal: ₹5,000 / ₹15,000 (≈2 months free). - OK
2. **Online payments on Free plan?** Current catalog says basic+ only
   (`PLAN_LIMITS.onlinePayments`). The landing FAQ sells "your own gateway,
   ₹0 platform fee" — decide: keep as a paid-plan feature (default in this
   plan) or open to free. - basic+ only
3. **Existing pro stores lose unlimited AI** (→ 50/month). Confirm. - OK
4. **Existing `starter` stores** simply become `basic` at the new ₹500 price
   (no billing exists yet, so no invoice impact). Confirm. - OK
5. Credit **pack sizes/prices** in §7 — approve or adjust. - OK
6. Plan expiry granularity: date-level (proposed) or exact-time? - date-level
