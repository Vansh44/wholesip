-- =============================================================
-- AI credits — purchasable, non-expiring generation top-ups.
--
-- The monthly plan allowance (ai_usage + try_ai_generation, in
-- brand_voice_01_schema.sql) is consumed FIRST; the credit balance here is
-- consumed only once the month's allowance is spent (burn the expiring
-- resource before the permanent one — lib/ai/quota.ts).
--
--   ai_credit_balances  one row per store, the live balance (>= 0)
--   ai_credit_ledger    append-only history: purchase / grant / spend
--   ai_credit_purchases Razorpay purchase lifecycle (pending → paid/failed)
--
-- All three are SERVICE-ROLE ONLY (the store_counters / plan_events pattern):
-- a live balance + ledger leaks usage volume, and grants/purchases must only
-- ever be written by validated server code.
--
-- RPCs (the increment_coupon_usage single-conditional-UPDATE pattern):
--   add_ai_credits(store, delta, kind, ref, note) → boolean
--     credits the balance + appends a ledger row. For kind='purchase' the
--     (kind, ref) pair is UNIQUE — a double-confirm (client callback AND
--     reconcile job both seeing the same payment) is a no-op returning false.
--   try_spend_ai_credit(store) → boolean
--     spends exactly one credit iff balance > 0 (concurrency-safe).
--
-- Apply by hand in the Supabase SQL Editor / MCP. Idempotent: safe to re-run.
-- =============================================================

create table if not exists public.ai_credit_balances (
  store_id   uuid primary key references public.stores(id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);
alter table public.ai_credit_balances enable row level security;
revoke all on public.ai_credit_balances from anon, authenticated;

create table if not exists public.ai_credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  delta      integer not null,
  kind       text not null check (kind in ('purchase', 'grant', 'spend')),
  ref        text, -- razorpay payment id / operator email / action name
  note       text,
  created_at timestamptz not null default now()
);
alter table public.ai_credit_ledger enable row level security;
revoke all on public.ai_credit_ledger from anon, authenticated;

create index if not exists ai_credit_ledger_store_idx
  on public.ai_credit_ledger (store_id, created_at desc);

-- Idempotency for purchase grants: one ledger credit per Razorpay payment id.
create unique index if not exists ai_credit_ledger_purchase_ref_idx
  on public.ai_credit_ledger (kind, ref)
  where kind = 'purchase';

create table if not exists public.ai_credit_purchases (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  pack_id        text not null,
  credits        integer not null check (credits > 0),
  amount_inr     integer not null check (amount_inr > 0),
  rzp_order_id   text unique,
  rzp_payment_id text,
  status         text not null default 'pending'
                 check (status in ('pending', 'paid', 'failed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.ai_credit_purchases enable row level security;
revoke all on public.ai_credit_purchases from anon, authenticated;

create index if not exists ai_credit_purchases_store_idx
  on public.ai_credit_purchases (store_id, created_at desc);
-- The reconcile pass scans for stale pending purchases.
create index if not exists ai_credit_purchases_pending_idx
  on public.ai_credit_purchases (created_at)
  where status = 'pending';

-- Credit the balance + append the ledger row, atomically. Returns false (and
-- writes NOTHING) when a purchase with this ref was already credited — the
-- unique partial index makes double-confirmation a harmless no-op.
create or replace function public.add_ai_credits(
  p_store uuid,
  p_delta integer,
  p_kind  text,
  p_ref   text,
  p_note  text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_delta <= 0 then
    raise exception 'add_ai_credits: delta must be positive';
  end if;

  begin
    insert into public.ai_credit_ledger (store_id, delta, kind, ref, note)
      values (p_store, p_delta, p_kind, p_ref, p_note);
  exception when unique_violation then
    return false; -- this purchase ref was already credited
  end;

  insert into public.ai_credit_balances (store_id, balance, updated_at)
    values (p_store, p_delta, now())
  on conflict (store_id) do update
    set balance = public.ai_credit_balances.balance + excluded.balance,
        updated_at = now();

  return true;
end; $$;

-- Spend exactly one credit iff the balance allows it. The conditional UPDATE
-- is the whole concurrency story — two simultaneous generations can never
-- both take the last credit.
create or replace function public.try_spend_ai_credit(
  p_store uuid
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  update public.ai_credit_balances
     set balance = balance - 1, updated_at = now()
   where store_id = p_store and balance > 0
  returning balance into v;
  if v is null then
    return false;
  end if;

  insert into public.ai_credit_ledger (store_id, delta, kind, ref, note)
    values (p_store, -1, 'spend', 'ai-generation', null);
  return true;
end; $$;

grant execute on function public.add_ai_credits(uuid, integer, text, text, text) to service_role;
grant execute on function public.try_spend_ai_credit(uuid) to service_role;

-- ───────────────────────── ROLLBACK ─────────────────────────
-- drop function if exists public.try_spend_ai_credit(uuid);
-- drop function if exists public.add_ai_credits(uuid, integer, text, text, text);
-- drop table if exists public.ai_credit_purchases;
-- drop table if exists public.ai_credit_ledger;
-- drop table if exists public.ai_credit_balances;
