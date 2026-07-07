// ---------------------------------------------------------------------------
// Feature-settings registry — the single source of truth for every per-store
// configurable feature flag on the platform.
//
// StoreMink is settings-based by design: features ship with per-store toggles
// instead of hardcoded behavior. Add a new setting by appending to SETTING_KEYS
// and SETTINGS below — validation in the save action and plan gating derive
// from this catalog. Settings render on their OWNING FEATURE's settings page
// (e.g. the Blogs group lives at /dashboard/blogs/settings), gated by that
// feature's dashboard `section` permission.
//
// Values are stored per store under stores.settings.features (jsonb), e.g.
//   { "blogs.customerSubmissions": false }
// Anything not overridden falls back to the default here, so a brand-new store
// behaves sensibly with an empty settings object.
//
// Pure module (no server imports) so it can be shared by server components,
// server actions, client editors, and tests alike — mirrors permissions.ts.
// ---------------------------------------------------------------------------

export type Plan = "free" | "starter" | "growth" | "pro";

const PLAN_RANK: Record<Plan, number> = {
  free: 0,
  starter: 1,
  growth: 2,
  pro: 3,
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

/** Where per-store overrides live inside stores.settings (jsonb). */
export const FEATURES_KEY = "features";

export const SETTING_KEYS = [
  "blogs.customerSubmissions",
  "blogs.requireApproval",
  "pages.customCode",
  "marketing.showAllCoupons",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export interface SettingDef {
  key: SettingKey;
  label: string;
  description: string;
  /** Display group in the settings editor (e.g. "Blogs"). */
  group: string;
  /** Dashboard permission section that governs this setting (permissions.ts).
   *  Viewing/saving it requires view/manage on this section. */
  section: string;
  type: "boolean";
  defaultValue: boolean;
  /** Minimum plan required to change this setting (locked to default below). */
  minPlan?: Plan;
  /** Another boolean setting this one only applies under (UI dims it when the
   *  parent is off; consumers must check the parent themselves). */
  dependsOn?: SettingKey;
}

export const SETTINGS: readonly SettingDef[] = [
  {
    key: "blogs.customerSubmissions",
    label: "Customer blog submissions",
    description:
      "Let signed-in customers write and submit their own blog posts on your storefront.",
    group: "Blogs",
    section: "blogs",
    type: "boolean",
    defaultValue: true,
  },
  {
    key: "blogs.requireApproval",
    label: "Require approval before publishing",
    description:
      "Customer submissions wait in a review queue until an admin approves them. Turn off to let customer blogs go live immediately.",
    group: "Blogs",
    section: "blogs",
    type: "boolean",
    defaultValue: true,
    dependsOn: "blogs.customerSubmissions",
  },
  {
    key: "pages.customCode",
    label: "Allow custom code",
    description:
      "Let admins add custom HTML/CSS/JavaScript sections to pages. Code runs in a secure sandbox. Turn off to disable custom-code sections store-wide.",
    group: "Website",
    section: "builder",
    type: "boolean",
    defaultValue: true,
    // minPlan intentionally unset for now — gate to a paid plan when billing ships.
  },
  {
    key: "marketing.showAllCoupons",
    label: "Show all active coupons on storefront",
    description:
      "If enabled, all active coupons will be displayed to shoppers in the cart, overriding individual coupon visibility settings.",
    group: "Marketing",
    section: "marketing",
    type: "boolean",
    defaultValue: false,
  },
];

const SETTING_BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));

export function getSettingDef(key: string): SettingDef | undefined {
  return SETTING_BY_KEY.get(key as SettingKey);
}

/** Resolved values for every setting in the catalog. */
export type StoreSettingValues = Record<SettingKey, boolean>;

/**
 * Resolve a store's feature settings from its raw settings jsonb + plan:
 * defaults ← overridden by settings.features, except plan-locked settings,
 * which always resolve to their default. Unknown/non-boolean overrides are
 * ignored, so junk in the column can never break a storefront.
 */
export function resolveStoreSettings(
  settings: Record<string, unknown> | null | undefined,
  plan: unknown,
): StoreSettingValues {
  const p = normalizePlan(plan);
  const overrides = (settings?.[FEATURES_KEY] ?? {}) as Record<string, unknown>;
  const out = {} as StoreSettingValues;
  for (const def of SETTINGS) {
    const stored = overrides[def.key];
    out[def.key] =
      planAllows(p, def.minPlan) && typeof stored === "boolean"
        ? stored
        : def.defaultValue;
  }
  return out;
}
