-- =============================================================
-- Per-store brand voice + AI usage quota.
--
-- store_brand_profiles holds each store's brand "soul" — the identity text fed
-- to Gemini as the system instruction for every AI copy feature (product
-- descriptions, SEO, coupon emails). Replaces the hardcoded brand/brand.md
-- (which becomes the WholeSip store's row — see the seed note below).
--   content_md — the brand guide itself (markdown, merchant-editable)
--   structured — the guided-setup answers it was generated from
--                ({ sell, audience, personality, avoid, why })
--
-- ai_usage + try_ai_generation() meter AI generations per store per calendar
-- month, so a store's plan cap (lib/plans.ts aiGenerationsPerMonth) is enforced
-- atomically — the increment_coupon_usage single-UPDATE pattern. The app skips
-- the RPC entirely for plans with an unlimited (null) cap.
--
-- Both tables are SERVICE-ROLE ONLY (revoked from anon/authenticated, no RLS
-- policies): a brand guide is internal business content and a usage counter
-- leaks activity — neither belongs in the anon-readable surface. Dashboard
-- actions read/write through the admin client AFTER an app-layer manager
-- check, mirroring the store_pages draft-column pattern.
--
-- Idempotent (safe to re-run).
-- =============================================================

create table if not exists public.store_brand_profiles (
  store_id   uuid primary key references public.stores(id) on delete cascade,
  content_md text not null default '',
  structured jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.store_brand_profiles enable row level security;
revoke all on public.store_brand_profiles from anon, authenticated;

create table if not exists public.ai_usage (
  store_id uuid not null references public.stores(id) on delete cascade,
  period   text not null, -- calendar month, 'YYYY-MM' (UTC)
  used     integer not null default 0,
  primary key (store_id, period)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- Reserve one AI generation atomically: true = under the cap (and counted),
-- false = the month's budget is spent. The conditional UPDATE is the whole
-- concurrency story — two simultaneous calls can never both take the last slot.
create or replace function public.try_ai_generation(
  p_store  uuid,
  p_period text,
  p_cap    integer
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  insert into public.ai_usage (store_id, period, used) values (p_store, p_period, 0)
    on conflict (store_id, period) do nothing;
  update public.ai_usage set used = used + 1
    where store_id = p_store and period = p_period and used < p_cap
    returning used into v;
  return v is not null;
end; $$;

grant execute on function public.try_ai_generation(uuid, text, integer) to service_role;

-- SEED (run once, done via MCP alongside this migration): the WholeSip fallback
-- store's profile is seeded from the legacy brand/brand.md so its AI voice is
-- unchanged; every other store starts empty and falls back to the generic
-- default template in lib/ai/brand-voice.ts until it saves its own.

-- ───────────────────────── ROLLBACK ─────────────────────────
-- drop function if exists public.try_ai_generation(uuid, text, integer);
-- drop table if exists public.ai_usage;
-- drop table if exists public.store_brand_profiles;
