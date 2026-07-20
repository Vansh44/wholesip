-- =============================================================
-- Online payments (Razorpay) — order columns.
--
-- placeOrder creates the Razorpay Order server-side (amount always the
-- server-computed total) and stores its id here; the payment id is written by
-- confirmOnlinePayment after HMAC verification, or by the reconcile paths
-- (success-page check / expire-pending-payments reaper) when the client
-- callback was dropped.
--
-- payment_method gains 'razorpay' alongside 'cash_on_delivery' (the column is
-- free text — no CHECK existed; the app allowlists values).
--
-- Apply by hand in the Supabase SQL Editor / MCP. Idempotent: safe to re-run.
-- =============================================================

alter table public.orders add column if not exists razorpay_order_id text;
alter table public.orders add column if not exists razorpay_payment_id text;

-- One of our orders per Razorpay order (and a fast reconcile lookup).
create unique index if not exists orders_razorpay_order_idx
  on public.orders (razorpay_order_id)
  where razorpay_order_id is not null;

-- The reaper scans razorpay orders still awaiting payment.
create index if not exists orders_pending_payment_idx
  on public.orders (created_at)
  where payment_method = 'razorpay' and payment_status = 'pending';

-- ───────────────────────── ROLLBACK ─────────────────────────
-- drop index if exists public.orders_pending_payment_idx;
-- drop index if exists public.orders_razorpay_order_idx;
-- alter table public.orders drop column if exists razorpay_payment_id;
-- alter table public.orders drop column if exists razorpay_order_id;
