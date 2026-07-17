import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { aiCreditBalances, aiUsage, stores } from "@/drizzle/schema";
import { effectivePlan, limitsFor, planAllows, PLAN_META } from "@/lib/plans";

// Per-store AI generation quota — the first real enforcement of a plan limit.
// Every AI copy feature (product description, SEO, coupon email, brand-voice
// setup) consumes one generation; the monthly cap comes from the store's plan
// (lib/plans.ts aiGenerationsPerMonth; null = unlimited → no metering at all).
// Once the month's allowance is spent, purchased/granted AI CREDITS
// (supabase/ai_credits.sql, never expire) are consumed as the fallback —
// the expiring resource burns before the permanent one.
//
// Counting is atomic via the try_ai_generation / try_spend_ai_credit functions
// (single conditional UPDATE, the increment_coupon_usage pattern) so
// concurrent clicks can never overshoot the cap. A transient error fails
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
  let storeRow: { plan: string; plan_expires_at: string | null } | undefined;
  try {
    [storeRow] = await withService((db) =>
      db
        .select({ plan: stores.plan, plan_expires_at: stores.planExpiresAt })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1),
    );
  } catch (err) {
    console.error(
      "consumeAiQuota (plan read, failing open):",
      err instanceof Error ? err.message : err,
    );
    return { allowed: true };
  }

  const plan = effectivePlan(storeRow ?? {});
  const cap = limitsFor(plan).aiGenerationsPerMonth;
  if (cap === null) return { allowed: true, source: "plan" }; // unlimited

  let ok: boolean;
  try {
    const res = await withService((db) =>
      db.execute(
        sql`select try_ai_generation(p_store => ${storeId}, p_period => ${currentPeriod()}, p_cap => ${cap}) as ok`,
      ),
    );
    ok = (res.rows[0] as { ok: boolean } | undefined)?.ok === true;
  } catch (err) {
    console.error(
      "consumeAiQuota (RPC, failing open):",
      err instanceof Error ? err.message : err,
    );
    return { allowed: true };
  }
  if (ok) return { allowed: true, source: "plan" };

  // Monthly allowance spent — fall back to the purchased-credit balance.
  let spent: boolean;
  try {
    const res = await withService((db) =>
      db.execute(
        sql`select try_spend_ai_credit(p_store => ${storeId}) as ok`,
      ),
    );
    spent = (res.rows[0] as { ok: boolean } | undefined)?.ok === true;
  } catch (err) {
    console.error(
      "consumeAiQuota (credits, failing open):",
      err instanceof Error ? err.message : err,
    );
    return { allowed: true };
  }
  if (spent) return { allowed: true, source: "credit" };

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
  try {
    return await withService(async (db) => {
      const [storeRows, usageRows, creditRows] = await Promise.all([
        db
          .select({ plan: stores.plan, plan_expires_at: stores.planExpiresAt })
          .from(stores)
          .where(eq(stores.id, storeId))
          .limit(1),
        db
          .select({ used: aiUsage.used })
          .from(aiUsage)
          .where(
            and(
              eq(aiUsage.storeId, storeId),
              eq(aiUsage.period, currentPeriod()),
            ),
          )
          .limit(1),
        db
          .select({ balance: aiCreditBalances.balance })
          .from(aiCreditBalances)
          .where(eq(aiCreditBalances.storeId, storeId))
          .limit(1),
      ]);
      return {
        used: usageRows[0]?.used ?? 0,
        cap: limitsFor(effectivePlan(storeRows[0] ?? {}))
          .aiGenerationsPerMonth,
        creditBalance: creditRows[0]?.balance ?? 0,
      };
    });
  } catch (err) {
    console.error("getAiUsage:", err instanceof Error ? err.message : err);
    return { used: 0, cap: null, creditBalance: 0 };
  }
}
