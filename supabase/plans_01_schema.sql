-- =============================================================
-- Plans — lock stores.plan to the three-plan catalog (lib/plans.ts) and add
-- the audit trail for plan changes.
--
--   free / starter / pro   (the former "growth" id is retired)
--
-- plan_source records HOW a store got its plan, so an operator comp is never
-- overwritten by a billing webhook (and vice versa):
--   comp  — granted from the platform console (default)
--   paid  — active Razorpay subscription (billing phase)
--   trial — time-boxed trial (future)
--
-- plan_events is the append-only audit log: who moved which store from what
-- plan to what plan, when, and via which path. Platform-console reads go
-- through the service role; no anon/authenticated access.
--
-- Idempotent (safe to re-run).
-- =============================================================

-- 1. Normalize any unknown/retired plan value, then constrain the column.
update public.stores set plan = 'free'
 where plan not in ('free', 'starter', 'pro');

alter table public.stores drop constraint if exists stores_plan_check;
alter table public.stores
  add constraint stores_plan_check check (plan in ('free', 'starter', 'pro'));

-- 2. How the store got its plan (see header). Existing rows default to comp.
alter table public.stores add column if not exists plan_source text not null default 'comp';
alter table public.stores drop constraint if exists stores_plan_source_check;
alter table public.stores
  add constraint stores_plan_source_check check (plan_source in ('comp', 'paid', 'trial'));

-- 3. Append-only plan-change audit log.
create table if not exists public.plan_events (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  from_plan  text,
  to_plan    text not null,
  source     text not null check (source in ('operator', 'billing', 'system')),
  actor      text,          -- operator email / 'razorpay' / job name
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists plan_events_store_idx
  on public.plan_events (store_id, created_at desc);

alter table public.plan_events enable row level security;
revoke all on public.plan_events from anon, authenticated;
-- (no RLS policies by design: written/read only via the service role from
--  platform actions — mirrors store_counters.)

-- ───────────────────────── ROLLBACK ─────────────────────────
-- drop table if exists public.plan_events;
-- alter table public.stores drop constraint if exists stores_plan_source_check;
-- alter table public.stores drop column if exists plan_source;
-- alter table public.stores drop constraint if exists stores_plan_check;
