-- =============================================================
-- Merchant plan subscriptions (Razorpay autopay / recurring).
--
-- A merchant upgrades to a paid plan and authorises a Razorpay mandate; the
-- platform's own Razorpay account (env RAZORPAY_KEY_ID/SECRET, same account as
-- AI credits — NOT the store's BYO checkout gateway) auto-charges each cycle.
-- Access is still governed by stores.plan + stores.plan_expires_at (effectivePlan
-- + the plan-expiry cron already downgrade a lapsed plan to free); these tables
-- are the recurring-billing bookkeeping on top of that.
--
--   store_subscriptions  one row per store: the current/last subscription and
--                        the live cycle window (current_end → plan_expires_at).
--   razorpay_plans       cache of Razorpay Plan ids we create per (plan, period,
--                        amount) so we don't recreate them every checkout.
--   billing_webhook_events  processed webhook ids (idempotency) — Phase 2.
--
-- All three are SERVICE-ROLE ONLY (the store_counters / ai_credits pattern):
-- billing state must only ever be written by validated server code + webhooks.
--
-- Apply by hand in the Supabase SQL Editor / MCP. Idempotent: safe to re-run.
-- =============================================================

create table if not exists public.store_subscriptions (
  store_id             uuid primary key references public.stores(id) on delete cascade,
  plan                 text not null check (plan in ('basic', 'pro')),
  period               text not null check (period in ('monthly', 'yearly')),
  rzp_subscription_id  text unique,
  rzp_plan_id          text,
  -- Razorpay subscription lifecycle: created → authenticated → active →
  -- (pending → halted) | cancelled | completed.
  status               text not null default 'created'
                       check (status in ('created', 'authenticated', 'active',
                                         'pending', 'halted', 'cancelled',
                                         'completed')),
  current_start        timestamptz,
  current_end          timestamptz,
  -- The mandate's upper charge limit (paise). Set high enough at authorisation
  -- to cover an upgrade to the top plan, so upgrades don't need re-auth.
  mandate_max_paise    integer,
  -- When a cancel is scheduled for cycle end (Phase 2), remember it.
  cancel_at_period_end boolean not null default false,
  -- A plan change scheduled for the next renewal (basic→pro "at expiry"); the
  -- webhook applies it when the real renewal charge lands, then clears it.
  scheduled_plan       text check (scheduled_plan in ('basic', 'pro')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table public.store_subscriptions enable row level security;
revoke all on public.store_subscriptions from anon, authenticated;

create index if not exists store_subscriptions_rzp_idx
  on public.store_subscriptions (rzp_subscription_id);

-- Cache of Razorpay Plan ids (created on demand via the API, keyed on the
-- price so a reprice makes a new plan rather than silently charging the old one).
create table if not exists public.razorpay_plans (
  plan         text not null check (plan in ('basic', 'pro')),
  period       text not null check (period in ('monthly', 'yearly')),
  amount_paise integer not null,
  rzp_plan_id  text not null,
  created_at   timestamptz not null default now(),
  primary key (plan, period, amount_paise)
);
alter table public.razorpay_plans enable row level security;
revoke all on public.razorpay_plans from anon, authenticated;

-- Idempotency ledger for Razorpay webhooks (Phase 2): every event id is
-- recorded once so a redelivered webhook is a no-op.
create table if not exists public.billing_webhook_events (
  event_id    text primary key,
  event_type  text,
  received_at timestamptz not null default now()
);
alter table public.billing_webhook_events enable row level security;
revoke all on public.billing_webhook_events from anon, authenticated;

-- ───────────────────────── ROLLBACK ─────────────────────────
-- drop table if exists public.billing_webhook_events;
-- drop table if exists public.razorpay_plans;
-- drop table if exists public.store_subscriptions;
