-- =============================================================
-- Plans v2 — rename "starter" → "basic" and add timed plans.
--
--   free / basic / pro   (the former "starter" id becomes "basic";
--                          pricing + limits live in lib/plans.ts)
--
-- plan_expires_at bounds an operator-granted plan (NULL = indefinite).
-- Enforcement is two-layered:
--   1. read-time: every gate resolves through effectivePlan() (lib/plans.ts)
--      — an expired plan behaves as free immediately;
--   2. durable:  /api/cron/plan-expiry (daily) flips expired rows to free,
--      clears the expiry and writes a plan_events audit row (source 'system').
--
-- Requires plans_01_schema.sql (plan CHECK, plan_source, plan_events).
-- Idempotent (safe to re-run).
-- =============================================================

-- 1. Rename the plan id. The OLD check (free/starter/pro) must be dropped
--    BEFORE the update — writing 'basic' would violate it — and the new one
--    added after, once no 'starter' rows remain.
alter table public.stores drop constraint if exists stores_plan_check;

update public.stores set plan = 'basic' where plan = 'starter';

alter table public.stores
  add constraint stores_plan_check check (plan in ('free', 'basic', 'pro'));

-- 2. Timed plans: when the granted plan lapses (NULL = indefinite).
--    Note: the stores table is anon-readable for active stores ("Read stores"
--    policy) — an expiry date is display-safe, like the plan id itself.
alter table public.stores add column if not exists plan_expires_at timestamptz;

-- The expiry cron scans for lapsed paid plans; keep that scan off a seq scan.
create index if not exists stores_plan_expiry_idx
  on public.stores (plan_expires_at)
  where plan_expires_at is not null;

-- ───────────────────────── ROLLBACK ─────────────────────────
-- (same ordering rule: drop the check BEFORE renaming the plan ids back)
-- drop index if exists public.stores_plan_expiry_idx;
-- alter table public.stores drop column if exists plan_expires_at;
-- alter table public.stores drop constraint if exists stores_plan_check;
-- update public.stores set plan = 'starter' where plan = 'basic';
-- alter table public.stores
--   add constraint stores_plan_check check (plan in ('free', 'starter', 'pro'));
