-- =============================================================
-- BYO payment gateway credentials (Channels → Digital payments).
--
-- A merchant connects their OWN Razorpay account; order money settles
-- directly with them (the platform never touches order funds). One row per
-- store; `enabled` is the merchant's on/off switch shown at checkout.
--
-- SECURITY:
--   • SERVICE-ROLE ONLY — `revoke all from anon, authenticated`. Credentials
--     must NEVER live in stores.settings (that column is anon-readable via
--     the "Read stores" policy — see CODEBASE.md §5.9).
--   • key_secret_enc is ADDITIONALLY encrypted at the app layer
--     (lib/payments/crypto.ts, AES-256-GCM with env PAYMENT_CRED_KEY), so a
--     leaked DB dump alone never yields a usable secret.
--
-- Apply by hand in the Supabase SQL Editor / MCP. Idempotent: safe to re-run.
-- =============================================================

create table if not exists public.store_payment_providers (
  store_id       uuid primary key references public.stores(id) on delete cascade,
  provider       text not null default 'razorpay' check (provider = 'razorpay'),
  key_id         text not null,
  key_secret_enc text not null, -- AES-256-GCM (lib/payments/crypto.ts)
  enabled        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.store_payment_providers enable row level security;
revoke all on public.store_payment_providers from anon, authenticated;

-- ───────────────────────── ROLLBACK ─────────────────────────
-- drop table if exists public.store_payment_providers;
