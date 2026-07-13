"use server";

// Merchant plan subscriptions (Razorpay autopay). Phase 1: create a
// subscription + collect the mandate, then activate the plan on the client
// callback. Renewals, cancellation and plan changes (Phase 2) run off Razorpay
// webhooks. Billing runs on the PLATFORM's Razorpay account (revenue is
// StoreMink's), never a store's BYO checkout gateway.

import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";
import { STORE_TAG } from "@/lib/store/resolve";
import { PLAN_META, type Plan } from "@/lib/plans";
import { getPlatformRazorpayCreds } from "@/lib/payments/provider";
import {
  rzpCreateSubscription,
  rzpFetchSubscription,
  rzpCancelSubscription,
  rzpUpdateSubscription,
  verifySubscriptionSignature,
} from "@/lib/payments/razorpay";
import {
  resolveRazorpayPlanId,
  totalCyclesFor,
  mandateMaxPaise,
  planAmountPaise,
  type BillingPeriod,
} from "@/lib/payments/subscription";
import {
  resolveBillingEmail,
  sendBillingEmail,
  manageUrl,
  planActivatedTemplate,
} from "@/lib/email/billing-emails";

const PERIODS: BillingPeriod[] = ["monthly", "yearly"];

// Terminal subscription states — no live mandate to cancel/change.
const TERMINAL = new Set(["cancelled", "completed"]);

function isPaidPlan(p: string): p is Exclude<Plan, "free"> {
  return p === "basic" || p === "pro";
}

export interface SubscriptionState {
  plan: string | null;
  period: BillingPeriod | null;
  status: string | null;
  currentEnd: string | null;
  cancelAtPeriodEnd: boolean;
  scheduledPlan: string | null;
  /** True when there's a live mandate the merchant can cancel / change. */
  active: boolean;
}

export async function getSubscriptionState(): Promise<SubscriptionState> {
  const storeId = await getActingStoreId();
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_subscriptions")
    .select(
      "plan, period, status, current_end, cancel_at_period_end, scheduled_plan, rzp_subscription_id",
    )
    .eq("store_id", storeId)
    .maybeSingle();
  const status = (data?.status as string) ?? null;
  return {
    plan: (data?.plan as string) ?? null,
    period: (data?.period as BillingPeriod) ?? null,
    status,
    currentEnd: (data?.current_end as string) ?? null,
    cancelAtPeriodEnd: !!data?.cancel_at_period_end,
    scheduledPlan: (data?.scheduled_plan as string) ?? null,
    active: !!data?.rzp_subscription_id && !TERMINAL.has(status ?? ""),
  };
}

export type StartSubscriptionResult =
  | {
      success: true;
      subscriptionId: string;
      keyId: string;
      planName: string;
      amountPaise: number;
    }
  | { error: string };

/**
 * Create a Razorpay Subscription for the chosen paid plan + period and return
 * the params to open the mandate-authorisation checkout. Does NOT change the
 * store's plan — that happens in confirmSubscription after the mandate is
 * authorised (or, in Phase 2, via the webhook).
 */
export async function startPlanSubscription(
  plan: string,
  period: string,
): Promise<StartSubscriptionResult> {
  const userId = await getManagerUserId("ai");
  if (!userId) return { error: "You don't have permission to do this." };

  if (!isPaidPlan(plan)) return { error: "Choose a paid plan to subscribe." };
  if (!PERIODS.includes(period as BillingPeriod)) {
    return { error: "Invalid billing period." };
  }
  const billingPeriod = period as BillingPeriod;

  const creds = getPlatformRazorpayCreds();
  if (!creds) {
    return { error: "Subscriptions aren't available right now." };
  }

  const resolved = await resolveRazorpayPlanId(plan, billingPeriod);
  if (!resolved) {
    return { error: "Couldn't set up the plan. Please try again." };
  }

  const storeId = await getActingStoreId();
  const sub = await rzpCreateSubscription(creds, {
    planId: resolved.rzpPlanId,
    totalCount: totalCyclesFor(billingPeriod),
    notes: { store_id: storeId, plan, period: billingPeriod },
  });
  if (!sub.ok) {
    console.error("startPlanSubscription (create):", sub.error);
    return { error: "Couldn't start the subscription. Please try again." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("store_subscriptions").upsert(
    {
      store_id: storeId,
      plan,
      period: billingPeriod,
      rzp_subscription_id: sub.data.id,
      rzp_plan_id: resolved.rzpPlanId,
      status: sub.data.status || "created",
      mandate_max_paise: mandateMaxPaise(),
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id" },
  );
  if (error) {
    console.error("startPlanSubscription (persist):", error.message);
    return { error: "Couldn't start the subscription. Please try again." };
  }

  return {
    success: true,
    subscriptionId: sub.data.id,
    keyId: creds.keyId,
    planName: PLAN_META[plan].name,
    amountPaise: planAmountPaise(plan, billingPeriod),
  };
}

export interface ConfirmSubscriptionResult {
  success?: boolean;
  plan?: string;
  error?: string;
}

/**
 * After the merchant authorises the mandate, verify the signature and activate
 * the plan. The store is resolved from the caller's session (not the client),
 * and the subscription id must match the row we created for that store — so a
 * client can't confirm someone else's subscription.
 */
export async function confirmSubscription(
  paymentId: string,
  subscriptionId: string,
  signature: string,
): Promise<ConfirmSubscriptionResult> {
  const userId = await getManagerUserId("ai");
  if (!userId) return { error: "You don't have permission to do this." };

  const creds = getPlatformRazorpayCreds();
  if (!creds) return { error: "Subscriptions aren't available right now." };

  if (
    !verifySubscriptionSignature(
      creds.keySecret,
      paymentId,
      subscriptionId,
      signature,
    )
  ) {
    return { error: "Payment verification failed." };
  }

  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("store_subscriptions")
    .select("plan, period, rzp_subscription_id")
    .eq("store_id", storeId)
    .maybeSingle();
  if (!row || row.rzp_subscription_id !== subscriptionId) {
    return { error: "Subscription not found for this store." };
  }
  const plan = row.plan as string;
  if (!isPaidPlan(plan)) return { error: "Invalid subscription." };

  // Ask Razorpay for the authoritative state + cycle end (never trust the
  // client for when access should extend to).
  const fetched = await rzpFetchSubscription(creds, subscriptionId);
  const status = fetched.ok ? fetched.data.status : "authenticated";
  const currentEndUnix = fetched.ok ? fetched.data.current_end : null;
  const currentStartUnix = fetched.ok ? fetched.data.current_start : null;

  // Fallback expiry if Razorpay hasn't set current_end yet (first charge still
  // settling) — the Phase 2 webhook corrects it on subscription.charged.
  const period = (row.period as BillingPeriod) ?? "monthly";
  const expiresAt = currentEndUnix
    ? new Date(currentEndUnix * 1000)
    : fallbackExpiry(period);

  await admin
    .from("store_subscriptions")
    .update({
      status,
      current_start: currentStartUnix
        ? new Date(currentStartUnix * 1000).toISOString()
        : null,
      current_end: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", storeId);

  // Activate the plan (idempotent — re-confirm just re-sets the same values).
  const { data: current } = await admin
    .from("stores")
    .select("plan")
    .eq("id", storeId)
    .maybeSingle();

  const { error: planErr } = await admin
    .from("stores")
    .update({
      plan,
      plan_expires_at: expiresAt.toISOString(),
      plan_source: "paid",
    })
    .eq("id", storeId);
  if (planErr) {
    console.error("confirmSubscription (plan):", planErr.message);
    return { error: "Payment succeeded but activating the plan failed." };
  }

  // Audit trail (best-effort).
  await admin.from("plan_events").insert({
    store_id: storeId,
    from_plan: (current?.plan as string) ?? null,
    to_plan: plan,
    source: "paid",
    actor: "subscription",
    note: `subscription ${subscriptionId} activated (${period})`,
  });

  revalidateTag(STORE_TAG, "max");

  // Welcome / activation email (best-effort — never blocks activation).
  const recip = await resolveBillingEmail(storeId);
  if (recip) {
    await sendBillingEmail(
      recip.email,
      planActivatedTemplate({
        storeName: recip.storeName,
        planName: PLAN_META[plan].name,
        amountInr: planAmountPaise(plan, period) / 100,
        period,
        renewsOn: expiresAt.toISOString(),
        manageUrl: manageUrl(recip.slug),
      }),
    );
  }

  return { success: true, plan };
}

function fallbackExpiry(period: BillingPeriod): Date {
  const d = new Date();
  if (period === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export interface SubscriptionActionResult {
  success?: boolean;
  error?: string;
  message?: string;
}

/**
 * Cancel the autopay subscription at the END of the current paid cycle: no
 * further money is deducted, access continues until the cycle ends, then the
 * plan-expiry cron downgrades the store to free. Cancelling is idempotent.
 */
export async function cancelSubscription(): Promise<SubscriptionActionResult> {
  const userId = await getManagerUserId("ai");
  if (!userId) return { error: "You don't have permission to do this." };

  const creds = getPlatformRazorpayCreds();
  if (!creds) return { error: "Subscriptions aren't available right now." };

  const storeId = await getActingStoreId();
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("store_subscriptions")
    .select("rzp_subscription_id, status")
    .eq("store_id", storeId)
    .maybeSingle();

  if (!row?.rzp_subscription_id) {
    return { error: "No active subscription to cancel." };
  }
  if (TERMINAL.has((row.status as string) ?? "")) {
    return { error: "This subscription is already cancelled." };
  }

  // cancel_at_cycle_end = true → stop future charges, keep access to cycle end.
  const res = await rzpCancelSubscription(
    creds,
    row.rzp_subscription_id as string,
    true,
  );
  if (!res.ok) {
    console.error("cancelSubscription:", res.error);
    return { error: "Couldn't cancel the subscription. Please try again." };
  }

  await admin
    .from("store_subscriptions")
    .update({
      cancel_at_period_end: true,
      status: res.data.status || "active",
      scheduled_plan: null,
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", storeId);

  // Access + plan_expires_at are left as-is: the store keeps its plan until the
  // paid cycle ends, then the cron downgrades to free.
  return {
    success: true,
    message: "Autopay cancelled. You keep your plan until the cycle ends.",
  };
}

/**
 * Change the plan of an EXISTING subscription (e.g. basic → pro) on the same
 * mandate. `when`:
 *   "now"        → prorate + reset the cycle immediately (activated now; the
 *                  webhook confirms the new expiry).
 *   "cycle_end"  → the new plan starts at the next renewal (recorded as a
 *                  scheduled change; the webhook applies it when it bills).
 */
export async function changePlan(
  targetPlan: string,
  when: string,
): Promise<SubscriptionActionResult> {
  const userId = await getManagerUserId("ai");
  if (!userId) return { error: "You don't have permission to do this." };

  if (!isPaidPlan(targetPlan)) return { error: "Choose a paid plan." };
  const scheduleChangeAt = when === "now" ? "now" : "cycle_end";

  const creds = getPlatformRazorpayCreds();
  if (!creds) return { error: "Subscriptions aren't available right now." };

  const storeId = await getActingStoreId();
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("store_subscriptions")
    .select("rzp_subscription_id, plan, period, status, mandate_max_paise")
    .eq("store_id", storeId)
    .maybeSingle();

  if (!row?.rzp_subscription_id || TERMINAL.has((row.status as string) ?? "")) {
    return { error: "No active subscription to change." };
  }
  if (row.plan === targetPlan) {
    return {
      error: `You're already on the ${PLAN_META[targetPlan].name} plan.`,
    };
  }

  const period = (row.period as BillingPeriod) ?? "monthly";
  const targetAmount = planAmountPaise(targetPlan, period);

  // A higher charge than the authorised mandate can't be auto-debited — the
  // merchant would need to re-authorise (we set the mandate to the top plan at
  // signup, so this should never trigger, but guard anyway).
  const mandateMax = (row.mandate_max_paise as number) ?? 0;
  if (mandateMax > 0 && targetAmount > mandateMax) {
    return {
      error:
        "This upgrade exceeds your authorised autopay limit. Please cancel and re-subscribe to the higher plan.",
    };
  }

  const resolved = await resolveRazorpayPlanId(targetPlan, period);
  if (!resolved)
    return { error: "Couldn't set up the plan. Please try again." };

  const res = await rzpUpdateSubscription(
    creds,
    row.rzp_subscription_id as string,
    { planId: resolved.rzpPlanId, scheduleChangeAt },
  );
  if (!res.ok) {
    console.error("changePlan:", res.error);
    return { error: "Couldn't change the plan. Please try again." };
  }

  if (scheduleChangeAt === "now") {
    // Immediate: reflect it now (the webhook is still the authority on expiry).
    const currentEnd = res.data.current_end
      ? new Date(res.data.current_end * 1000)
      : fallbackExpiry(period);
    await admin
      .from("store_subscriptions")
      .update({
        plan: targetPlan,
        rzp_plan_id: resolved.rzpPlanId,
        scheduled_plan: null,
        current_end: currentEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("store_id", storeId);

    const { data: cur } = await admin
      .from("stores")
      .select("plan, plan_source")
      .eq("id", storeId)
      .maybeSingle();
    if (cur?.plan_source !== "comp") {
      await admin
        .from("stores")
        .update({
          plan: targetPlan,
          plan_expires_at: currentEnd.toISOString(),
          plan_source: "paid",
        })
        .eq("id", storeId);
      await admin.from("plan_events").insert({
        store_id: storeId,
        from_plan: (cur?.plan as string) ?? null,
        to_plan: targetPlan,
        source: "paid",
        actor: "subscription",
        note: "plan change (now)",
      });
      revalidateTag(STORE_TAG, "max");
    }
    return {
      success: true,
      message: `You're now on the ${PLAN_META[targetPlan].name} plan.`,
    };
  }

  // Scheduled for cycle end — record it; the webhook applies it at renewal.
  await admin
    .from("store_subscriptions")
    .update({
      scheduled_plan: targetPlan,
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", storeId);
  return {
    success: true,
    message: `${PLAN_META[targetPlan].name} will start at your next renewal.`,
  };
}
