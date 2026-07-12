import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformRazorpayCreds } from "./provider";
import { rzpCreatePlan, type RazorpayCreds } from "./razorpay";
import { PLAN_META, type Plan } from "@/lib/plans";

// Recurring-billing helpers: resolve the Razorpay Plan id for a (tier, period)
// on the PLATFORM account, creating + caching it on first use so we never
// recreate a plan per checkout. The cache is keyed on the price (paise) too, so
// a reprice mints a NEW Razorpay plan rather than charging the stale amount.

export type BillingPeriod = "monthly" | "yearly";

/** Server-computed price (paise) for a paid plan + period — the ONLY source of
 *  the amount a merchant is charged (never trusted from the client). */
export function planAmountPaise(plan: Plan, period: BillingPeriod): number {
  const meta = PLAN_META[plan];
  const inr = period === "yearly" ? meta.yearlyInr : meta.monthlyInr;
  return inr * 100;
}

/** Total billing cycles Razorpay requires up front — set effectively "forever"
 *  (10 years) so the subscription renews until cancelled. */
export function totalCyclesFor(period: BillingPeriod): number {
  return period === "yearly" ? 10 : 120;
}

export interface ResolvedPlan {
  rzpPlanId: string;
  amountPaise: number;
}

/**
 * The Razorpay Plan id for (plan, period), from cache or freshly created.
 * Returns null only when the platform account isn't configured or the create
 * call fails.
 */
export async function resolveRazorpayPlanId(
  plan: Plan,
  period: BillingPeriod,
): Promise<ResolvedPlan | null> {
  if (plan === "free") return null;
  const creds = getPlatformRazorpayCreds();
  if (!creds) return null;

  const amountPaise = planAmountPaise(plan, period);
  const admin = createAdminClient();

  const { data: cached } = await admin
    .from("razorpay_plans")
    .select("rzp_plan_id")
    .eq("plan", plan)
    .eq("period", period)
    .eq("amount_paise", amountPaise)
    .maybeSingle();
  if (cached?.rzp_plan_id) {
    return { rzpPlanId: cached.rzp_plan_id as string, amountPaise };
  }

  const created = await createPlan(creds, plan, period, amountPaise);
  if (!created) return null;

  // Cache best-effort; a lost race just recreates a (harmless) duplicate plan.
  await admin.from("razorpay_plans").upsert(
    {
      plan,
      period,
      amount_paise: amountPaise,
      rzp_plan_id: created,
    },
    { onConflict: "plan,period,amount_paise" },
  );
  return { rzpPlanId: created, amountPaise };
}

async function createPlan(
  creds: RazorpayCreds,
  plan: Plan,
  period: BillingPeriod,
  amountPaise: number,
): Promise<string | null> {
  const res = await rzpCreatePlan(creds, {
    period,
    amountPaise,
    name: `StoreMink ${PLAN_META[plan].name} (${period})`,
  });
  if (!res.ok) {
    console.error("resolveRazorpayPlanId (create):", res.error);
    return null;
  }
  return res.data.id;
}

/** The mandate's upper charge limit (paise). Set to the TOP plan's yearly price
 *  so a later upgrade never exceeds the authorised mandate. */
export function mandateMaxPaise(): number {
  return planAmountPaise("pro", "yearly");
}
