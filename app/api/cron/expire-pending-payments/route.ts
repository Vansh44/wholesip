import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreGateway } from "@/lib/payments/provider";
import {
  capturedPayment,
  rzpFetchOrderPayments,
} from "@/lib/payments/razorpay";

// Reaper for online-payment orders stuck in `payment_status: 'pending'` —
// v1 has no merchant webhooks (reconcile-on-read instead), so this scheduled
// job is the safety net for shoppers who paid but never triggered
// confirmOnlinePayment, and for orders whose payment simply never happened.
// It runs DAILY on the Vercel Hobby plan (which caps crons at once/day); it's
// only a backstop, since the success page reconciles a real payment instantly.
// On Vercel Pro, bump the vercel.json schedule back to hourly.
//
// For each razorpay order pending longer than the grace window:
//   1. Ask Razorpay first — a CAPTURED payment means the money was taken:
//      mark the order paid (never lose a paid order).
//   2. Otherwise atomically claim the pending → failed transition, then
//      release the reserved stock (the existing reserved → released
//      conditional claim, exactly-once), release the coupon use, and cancel
//      the order.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends it).

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Long enough for a slow UPI approve + the shopper's retry attempts; short
// enough that reserved stock isn't hostage for hours.
const GRACE_MINUTES = 45;
const BATCH_LIMIT = 200;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// placeOrder stores the coupon code as typed; the usage counters key on the
// normalized form (mirror of checkout-actions normalizeCode).
function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

interface PendingOrder {
  id: string;
  store_id: string;
  razorpay_order_id: string | null;
  applied_coupon_code: string | null;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - GRACE_MINUTES * 60_000).toISOString();

  const { data: pending, error: readErr } = await admin
    .from("orders")
    .select("id, store_id, razorpay_order_id, applied_coupon_code")
    .eq("payment_method", "razorpay")
    .eq("payment_status", "pending")
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (readErr) {
    console.error("expire-pending-payments (read):", readErr.message);
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }
  if (!pending?.length) {
    return NextResponse.json({ ok: true, paid: 0, expired: 0 });
  }

  // One gateway lookup (and decrypt) per store, not per order.
  const gateways = new Map<
    string,
    Awaited<ReturnType<typeof getStoreGateway>>
  >();
  const gatewayFor = async (storeId: string) => {
    if (!gateways.has(storeId)) {
      gateways.set(storeId, await getStoreGateway(storeId));
    }
    return gateways.get(storeId) ?? null;
  };

  let paid = 0;
  let expired = 0;

  for (const order of pending as PendingOrder[]) {
    // 1. Razorpay is the source of truth — never cancel a paid order.
    if (order.razorpay_order_id) {
      const gateway = await gatewayFor(order.store_id);
      if (gateway) {
        const res = await rzpFetchOrderPayments(
          gateway.creds,
          order.razorpay_order_id,
        );
        if (!res.ok) {
          // Can't reach Razorpay for this order — skip it this run rather
          // than risk cancelling a captured payment.
          console.error(
            `expire-pending-payments (rzp fetch, order ${order.id}):`,
            res.error,
          );
          continue;
        }
        const captured = capturedPayment(res.data);
        if (captured) {
          const { error } = await admin
            .from("orders")
            .update({
              payment_status: "paid",
              razorpay_payment_id: captured.id,
            })
            .eq("id", order.id)
            .eq("payment_status", "pending");
          if (error) {
            console.error(
              `expire-pending-payments (mark paid, order ${order.id}):`,
              error.message,
            );
          } else {
            paid++;
          }
          continue;
        }
      }
      // Gateway disconnected since the order was placed → nothing captured is
      // verifiable; fall through and expire it (stock shouldn't stay hostage).
    }

    // 2. Claim the pending → failed transition atomically. A shopper's
    //    confirmOnlinePayment racing this loop flips pending → paid first and
    //    this claim then matches nothing — the order is left alone.
    const { data: claimed, error: claimErr } = await admin
      .from("orders")
      .update({ payment_status: "failed", status: "cancelled" })
      .eq("id", order.id)
      .eq("payment_status", "pending")
      .select("id");
    if (claimErr) {
      console.error(
        `expire-pending-payments (claim, order ${order.id}):`,
        claimErr.message,
      );
      continue;
    }
    if (!claimed?.length) continue;
    expired++;

    // 3. Restock exactly once (the order-actions cancellation pattern).
    const { data: stockClaim } = await admin
      .from("orders")
      .update({ stock_status: "released" })
      .eq("id", order.id)
      .eq("stock_status", "reserved")
      .select("id");
    if (stockClaim?.length) {
      const { data: items } = await admin
        .from("order_items")
        .select("product_id, variant_id, quantity")
        .eq("order_id", order.id);
      for (const item of items ?? []) {
        await admin.rpc("release_stock", {
          p_store: order.store_id,
          p_product: item.product_id,
          p_variant: item.variant_id,
          p_qty: item.quantity,
          p_order: order.id,
          p_reason: "payment_expired",
        });
      }
    }

    // 4. Give the coupon use back (best-effort, floors at 0).
    if (order.applied_coupon_code) {
      await admin.rpc("decrement_coupon_usage", {
        p_code: normalizeCode(order.applied_coupon_code),
        p_store_id: order.store_id,
      });
    }
  }

  return NextResponse.json({ ok: true, paid, expired });
}

export const GET = handle;
export const POST = handle;
