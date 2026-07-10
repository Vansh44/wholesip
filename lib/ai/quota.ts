import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { limitsFor, normalizePlan, PLAN_META } from "@/lib/plans";

// Per-store AI generation quota — the first real enforcement of a plan limit.
// Every AI copy feature (product description, SEO, coupon email, brand-voice
// setup) consumes one generation; the monthly cap comes from the store's plan
// (lib/plans.ts aiGenerationsPerMonth; null = unlimited → no metering at all).
//
// Counting is atomic via the try_ai_generation RPC (single conditional UPDATE,
// the increment_coupon_usage pattern) so concurrent clicks can never overshoot
// the cap. A transient RPC error fails OPEN — the quota is a cost guard rail,
// not a security boundary, and must never break a merchant's save flow.

/** Calendar month bucket, UTC — e.g. "2026-07". */
export function currentPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export interface QuotaResult {
  allowed: boolean;
  /** Friendly, plan-aware message when blocked. */
  error?: string;
}

/**
 * Reserve one AI generation for the store, enforcing its plan's monthly cap.
 * Call BEFORE the Gemini request in every AI action.
 */
export async function consumeAiQuota(storeId: string): Promise<QuotaResult> {
  const admin = createAdminClient();

  const { data: store, error: storeErr } = await admin
    .from("stores")
    .select("plan")
    .eq("id", storeId)
    .maybeSingle();
  if (storeErr) {
    console.error(
      "consumeAiQuota (plan read, failing open):",
      storeErr.message,
    );
    return { allowed: true };
  }

  const plan = normalizePlan(store?.plan);
  const cap = limitsFor(plan).aiGenerationsPerMonth;
  if (cap === null) return { allowed: true }; // unlimited — nothing to meter

  const { data: ok, error } = await admin.rpc("try_ai_generation", {
    p_store: storeId,
    p_period: currentPeriod(),
    p_cap: cap,
  });
  if (error) {
    console.error("consumeAiQuota (RPC, failing open):", error.message);
    return { allowed: true };
  }
  if (ok === true) return { allowed: true };

  return {
    allowed: false,
    error: `You've used all ${cap} AI generations included in the ${PLAN_META[plan].name} plan this month. Upgrade your plan for more.`,
  };
}

export interface AiUsageSummary {
  used: number;
  /** null = unlimited on this plan. */
  cap: number | null;
}

/** Current month's usage for the dashboard ("X of Y used this month"). */
export async function getAiUsage(storeId: string): Promise<AiUsageSummary> {
  const admin = createAdminClient();

  const [{ data: store }, { data: usage }] = await Promise.all([
    admin.from("stores").select("plan").eq("id", storeId).maybeSingle(),
    admin
      .from("ai_usage")
      .select("used")
      .eq("store_id", storeId)
      .eq("period", currentPeriod())
      .maybeSingle(),
  ]);

  return {
    used: (usage?.used as number) ?? 0,
    cap: limitsFor(normalizePlan(store?.plan)).aiGenerationsPerMonth,
  };
}
