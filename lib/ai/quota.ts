import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { effectivePlan, limitsFor, planAllows, PLAN_META } from "@/lib/plans";

// Per-store AI generation quota — the first real enforcement of a plan limit.
// Every AI copy feature (product description, SEO, coupon email, brand-voice
// setup) consumes one generation; the monthly cap comes from the store's plan
// (lib/plans.ts aiGenerationsPerMonth; null = unlimited → no metering at all).
// Once the month's allowance is spent, purchased/granted AI CREDITS
// (supabase/ai_credits.sql, never expire) are consumed as the fallback —
// the expiring resource burns before the permanent one.
//
// Counting is atomic via the try_ai_generation / try_spend_ai_credit RPCs
// (single conditional UPDATE, the increment_coupon_usage pattern) so
// concurrent clicks can never overshoot the cap. A transient RPC error fails
// OPEN — the quota is a cost guard rail, not a security boundary, and must
// never break a merchant's save flow.

/** Calendar month bucket, UTC — e.g. "2026-07". */
export function currentPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export interface QuotaResult {
  allowed: boolean;
  /** What the generation was drawn from ("plan" allowance or a purchased
   *  "credit") — lets callers phrase UI copy accurately. */
  source?: "plan" | "credit";
  /** Friendly, plan-aware message when blocked. */
  error?: string;
}

/**
 * Reserve one AI generation for the store: the plan's monthly allowance
 * first, then one purchased/granted credit once the month is spent.
 * Call BEFORE the Gemini request in every AI action.
 */
export async function consumeAiQuota(storeId: string): Promise<QuotaResult> {
  const admin = createAdminClient();

  const { data: store, error: storeErr } = await admin
    .from("stores")
    .select("plan, plan_expires_at")
    .eq("id", storeId)
    .maybeSingle();
  if (storeErr) {
    console.error(
      "consumeAiQuota (plan read, failing open):",
      storeErr.message,
    );
    return { allowed: true };
  }

  const plan = effectivePlan(store ?? {});
  const cap = limitsFor(plan).aiGenerationsPerMonth;
  if (cap === null) return { allowed: true, source: "plan" }; // unlimited

  const { data: ok, error } = await admin.rpc("try_ai_generation", {
    p_store: storeId,
    p_period: currentPeriod(),
    p_cap: cap,
  });
  if (error) {
    console.error("consumeAiQuota (RPC, failing open):", error.message);
    return { allowed: true };
  }
  if (ok === true) return { allowed: true, source: "plan" };

  // Monthly allowance spent — fall back to the purchased-credit balance.
  const { data: spent, error: creditErr } = await admin.rpc(
    "try_spend_ai_credit",
    { p_store: storeId },
  );
  if (creditErr) {
    console.error("consumeAiQuota (credits, failing open):", creditErr.message);
    return { allowed: true };
  }
  if (spent === true) return { allowed: true, source: "credit" };

  return {
    allowed: false,
    error: planAllows(plan, "basic")
      ? `You've used all ${cap} AI generations included in the ${PLAN_META[plan].name} plan this month and have no AI credits left. Buy AI credits (Dashboard → Plans & Billing) or upgrade your plan.`
      : `You've used all ${cap} AI generations included in the ${PLAN_META[plan].name} plan this month. Upgrade your plan for more.`,
  };
}

export interface AiUsageSummary {
  used: number;
  /** null = unlimited on this plan. */
  cap: number | null;
  /** Purchased/granted credits remaining (never expire). */
  creditBalance: number;
}

/** Current month's usage for the dashboard ("X of Y used this month"). */
export async function getAiUsage(storeId: string): Promise<AiUsageSummary> {
  const admin = createAdminClient();

  const [{ data: store }, { data: usage }, { data: credits }] =
    await Promise.all([
      admin
        .from("stores")
        .select("plan, plan_expires_at")
        .eq("id", storeId)
        .maybeSingle(),
      admin
        .from("ai_usage")
        .select("used")
        .eq("store_id", storeId)
        .eq("period", currentPeriod())
        .maybeSingle(),
      admin
        .from("ai_credit_balances")
        .select("balance")
        .eq("store_id", storeId)
        .maybeSingle(),
    ]);

  return {
    used: (usage?.used as number) ?? 0,
    cap: limitsFor(effectivePlan(store ?? {})).aiGenerationsPerMonth,
    creditBalance: (credits?.balance as number) ?? 0,
  };
}
