import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORE_TAG } from "@/lib/store/resolve";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";

// Razorpay Subscription webhooks — the source of truth for recurring billing.
// Renewals, failed charges (dunning), cancellations and plan changes all arrive
// here and drive stores.plan / plan_expires_at (the plan-expiry cron then
// downgrades a lapsed plan to free).
//
// Security: the RAW body is HMAC-verified against RAZORPAY_WEBHOOK_SECRET
// (X-Razorpay-Signature). Idempotent: every X-Razorpay-Event-Id is recorded
// once (billing_webhook_events), so redelivered events are no-ops. On a
// processing error we remove the marker and 500 so Razorpay retries.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Grace window after retries are exhausted before we downgrade (owner: 3 days).
const GRACE_DAYS = 3;

type Admin = ReturnType<typeof createAdminClient>;

interface RzpSubEntity {
  id: string;
  status: string;
  plan_id: string | null;
  current_start: number | null;
  current_end: number | null;
}

interface WebhookBody {
  event?: string;
  created_at?: number;
  payload?: { subscription?: { entity?: RzpSubEntity } };
}

async function handle(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("razorpay webhook: RAZORPAY_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const raw = await request.text();
  const sig = request.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(secret, raw, sig)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let event: WebhookBody;
  try {
    event = JSON.parse(raw) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const sub = event.payload?.subscription?.entity;
  const eventId =
    request.headers.get("x-razorpay-event-id") ||
    `${event.event}:${event.created_at}:${sub?.id ?? ""}`;

  const admin = createAdminClient();

  // Idempotency lock: first writer wins; a duplicate insert (unique_violation)
  // means we already handled this event.
  const { error: dupErr } = await admin
    .from("billing_webhook_events")
    .insert({ event_id: eventId, event_type: event.event });
  if (dupErr) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    if (sub?.id && event.event) {
      await processSubscription(admin, event.event, sub);
    }
  } catch (e) {
    // Undo the marker so Razorpay's retry reprocesses this event.
    await admin.from("billing_webhook_events").delete().eq("event_id", eventId);
    console.error(
      "razorpay webhook (process):",
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export const POST = handle;

async function processSubscription(
  admin: Admin,
  eventType: string,
  sub: RzpSubEntity,
) {
  const { data: row } = await admin
    .from("store_subscriptions")
    .select("store_id, plan, scheduled_plan")
    .eq("rzp_subscription_id", sub.id)
    .maybeSingle();
  if (!row) return; // not one of ours

  const storeId = row.store_id as string;
  const currentEnd = sub.current_end ? new Date(sub.current_end * 1000) : null;
  const currentStart = sub.current_start
    ? new Date(sub.current_start * 1000)
    : null;

  // The plan Razorpay is actually billing right now — resolved from the
  // subscription's plan_id (authoritative after an upgrade/downgrade), falling
  // back to our stored plan. This is what makes a "change at cycle end" apply
  // only when the real renewal charge lands with the new plan_id.
  let plan = row.plan as string;
  if (sub.plan_id) {
    const { data: pl } = await admin
      .from("razorpay_plans")
      .select("plan")
      .eq("rzp_plan_id", sub.plan_id)
      .maybeSingle();
    if (pl?.plan) plan = pl.plan as string;
  }
  // A scheduled change is fulfilled once billing actually moves to that plan.
  const clearScheduled =
    row.scheduled_plan && plan === (row.scheduled_plan as string);

  // Always keep the subscription row's status + cycle window (+ resolved plan)
  // in sync.
  await admin
    .from("store_subscriptions")
    .update({
      status: sub.status,
      plan,
      ...(clearScheduled ? { scheduled_plan: null } : {}),
      current_start: currentStart?.toISOString() ?? null,
      current_end: currentEnd?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", storeId);

  let changed = false;
  switch (eventType) {
    // Active / renewed / plan changed → ensure the plan is on and access runs
    // to the paid cycle end.
    case "subscription.authenticated":
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.updated":
      if (currentEnd) {
        changed = await activatePlan(admin, storeId, plan, currentEnd);
      }
      break;

    // A charge failed; Razorpay is retrying. Keep access (still within the paid
    // cycle). Dunning email is Phase 3.
    case "subscription.pending":
      break;

    // Retries exhausted → short grace, then the plan-expiry cron downgrades.
    case "subscription.halted":
      changed = await setExpiry(
        admin,
        storeId,
        addDays(new Date(), GRACE_DAYS),
      );
      break;

    // Cancelled / completed: access remains until current_end (already synced);
    // the cron downgrades to free once it lapses.
    case "subscription.cancelled":
    case "subscription.completed":
      break;

    default:
      break;
  }

  if (changed) revalidateTag(STORE_TAG, "max");
}

// Set plan + expiry, UNLESS the store is on an operator comp plan — a comp
// grant must never be overwritten by billing (CODEBASE §15).
async function activatePlan(
  admin: Admin,
  storeId: string,
  plan: string,
  expiresAt: Date,
): Promise<boolean> {
  const { data: store } = await admin
    .from("stores")
    .select("plan, plan_source")
    .eq("id", storeId)
    .maybeSingle();
  if (store?.plan_source === "comp") return false;

  const from = (store?.plan as string) ?? null;
  await admin
    .from("stores")
    .update({
      plan,
      plan_expires_at: expiresAt.toISOString(),
      plan_source: "paid",
    })
    .eq("id", storeId);

  if (from !== plan) {
    await admin.from("plan_events").insert({
      store_id: storeId,
      from_plan: from,
      to_plan: plan,
      source: "paid",
      actor: "subscription-webhook",
      note: "renewal / activation",
    });
  }
  return true;
}

async function setExpiry(
  admin: Admin,
  storeId: string,
  expiresAt: Date,
): Promise<boolean> {
  const { data: store } = await admin
    .from("stores")
    .select("plan_source")
    .eq("id", storeId)
    .maybeSingle();
  if (store?.plan_source === "comp") return false;
  await admin
    .from("stores")
    .update({ plan_expires_at: expiresAt.toISOString() })
    .eq("id", storeId);
  return true;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
