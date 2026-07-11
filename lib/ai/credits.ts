// ---------------------------------------------------------------------------
// AI credit packs — the single place credits are priced (repricing is a
// one-file change, like lib/plans.ts). Pure module: imported by server
// actions, the dashboard AI-usage page, and tests alike.
//
// Credits are per-store top-ups that never expire; the monthly plan allowance
// is always consumed first (lib/ai/quota.ts). Purchases settle to the
// PLATFORM's own Razorpay account (env RAZORPAY_KEY_ID/SECRET) — entirely
// separate from any store's BYO order gateway.
//
// Pricing rationale (docs/payments-plans-credits-plan.md §7): COGS ≈ ₹0.9 per
// generation incl. GST + gateway fees; packs price at ~2.3–2.7× marginal cost
// while staying far below the plan ladder's bundled per-generation value.
// ---------------------------------------------------------------------------

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  priceInr: number;
  /** Highlighted in the buy panel. */
  popular?: boolean;
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "small", name: "Small", credits: 25, priceInr: 59 },
  { id: "popular", name: "Popular", credits: 60, priceInr: 129, popular: true },
  { id: "bulk", name: "Bulk", credits: 150, priceInr: 299 },
] as const;

export function getCreditPack(packId: unknown): CreditPack | null {
  if (typeof packId !== "string") return null;
  return CREDIT_PACKS.find((p) => p.id === packId) ?? null;
}
