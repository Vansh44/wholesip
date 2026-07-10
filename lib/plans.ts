// ---------------------------------------------------------------------------
// Plan catalog — the single source of truth for StoreMink's subscription plans.
//
// Three plans, gated by business maturity:
//   free    → try it        (COD only, subdomain, small catalog)
//   starter → run a business (custom domain, online payments, AI copy)
//   pro     → scale it       (no limits, staff roles, campaigns)
//
// `stores.plan` holds one of PLAN_IDS (DB CHECK constraint, plans_01_schema.sql).
// Feature gating goes through planAllows()/limits here + the settings registry's
// per-setting `minPlan`. Pricing lives ONLY in this file so repricing is a
// one-line change; billing (Razorpay subscriptions) will consume these values.
//
// Pure module (no server/React imports) — shared by server actions, client
// components, and tests alike. Mirrors lib/settings/registry.ts.
// ---------------------------------------------------------------------------

export const PLAN_IDS = ["free", "starter", "pro"] as const;
export type Plan = (typeof PLAN_IDS)[number];

export const PLAN_RANK: Record<Plan, number> = {
  free: 0,
  starter: 1,
  pro: 2,
};

/** Coerce an arbitrary stores.plan value to a known plan (unknown → free). */
export function normalizePlan(plan: unknown): Plan {
  return typeof plan === "string" && plan in PLAN_RANK
    ? (plan as Plan)
    : "free";
}

/** Is `plan` at or above `minPlan`? (No minPlan = available on every plan.) */
export function planAllows(plan: Plan, minPlan?: Plan): boolean {
  if (!minPlan) return true;
  return PLAN_RANK[plan] >= PLAN_RANK[minPlan];
}

/** True when moving from → to is a strict upgrade (never same or downward). */
export function isUpgrade(from: Plan, to: Plan): boolean {
  return PLAN_RANK[to] > PLAN_RANK[from];
}

/** The plans a store may be promoted to from its current plan (upgrade-only:
 *  free → starter/pro, starter → pro, pro → none). */
export function upgradeTargets(from: Plan): Plan[] {
  return PLAN_IDS.filter((p) => isUpgrade(from, p));
}

/** How a store came to be on its plan — a comp (operator-granted) plan must
 *  never be overwritten by billing webhooks, and vice versa. */
export const PLAN_SOURCES = ["comp", "paid", "trial"] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

// ── Display metadata (pricing page, upgrade dialogs, billing) ──────────────

export interface PlanMeta {
  id: Plan;
  name: string;
  tagline: string;
  /** INR per month, billed monthly. 0 = free. */
  monthlyInr: number;
  /** INR per year, billed yearly (≈2 months free). 0 = free. */
  yearlyInr: number;
}

export const PLAN_META: Record<Plan, PlanMeta> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Try StoreMink and set up your store",
    monthlyInr: 0,
    yearlyInr: 0,
  },
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "Run a real business — domain, payments, AI",
    monthlyInr: 499,
    yearlyInr: 4999,
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Scale with your team — no limits",
    monthlyInr: 1499,
    yearlyInr: 14999,
  },
};

// ── Limits & feature matrix ─────────────────────────────────────────────────
// `null` = unlimited. Enforced SERVER-SIDE in the owning action (a limit that
// only exists in the UI is a suggestion, not a limit). Enforcement is
// soft-on-downgrade: existing data is never deleted; creating NEW rows past the
// cap is blocked with an upgrade prompt.

export interface PlanLimits {
  /** Max products a store may have (null = unlimited). */
  maxProducts: number | null;
  /** Max staff accounts incl. the owner (null = unlimited). */
  maxStaff: number | null;
  /** AI generations per calendar month (null = unlimited). */
  aiGenerationsPerMonth: number | null;
  /** Max simultaneously-active coupons (null = unlimited). */
  maxActiveCoupons: number | null;
  /** May connect a custom domain. */
  customDomain: boolean;
  /** May connect a payment gateway (Razorpay) for online payments. */
  onlinePayments: boolean;
  /** May send coupon email campaigns. */
  emailCampaigns: boolean;
  /** "Powered by StoreMink" badge is removed from the storefront footer. */
  removeBadge: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxProducts: 25,
    maxStaff: 1,
    aiGenerationsPerMonth: 10,
    maxActiveCoupons: 3,
    customDomain: false,
    onlinePayments: false,
    emailCampaigns: false,
    removeBadge: false,
  },
  starter: {
    maxProducts: 500,
    maxStaff: 3,
    aiGenerationsPerMonth: 100,
    maxActiveCoupons: null,
    customDomain: true,
    onlinePayments: true,
    emailCampaigns: false,
    removeBadge: true,
  },
  pro: {
    maxProducts: null,
    maxStaff: null,
    aiGenerationsPerMonth: null,
    maxActiveCoupons: null,
    customDomain: true,
    onlinePayments: true,
    emailCampaigns: true,
    removeBadge: true,
  },
};

/** The resolved limits for a raw stores.plan value (unknown plans → free). */
export function limitsFor(plan: unknown): PlanLimits {
  return PLAN_LIMITS[normalizePlan(plan)];
}
