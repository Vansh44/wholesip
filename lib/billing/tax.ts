// ---------------------------------------------------------------------------
// Pure tax math — the single source of truth for turning cart lines + a store's
// tax config into per-line tax, a total, and a per-rate breakdown for invoices.
// No imports, fully deterministic, so it can be unit-tested and shared by the
// checkout server action AND the invoice renderer.
//
// Two modes (store-wide toggle, see BillingSettings.pricesIncludeTax):
//   * EXCLUSIVE — listed prices are net; tax is ADDED on top of the total.
//   * INCLUSIVE — listed prices already contain tax; the tax is CARVED OUT for
//     reporting but NOT added again (the total stays the listed price).
//
// Discounts (coupons) reduce the taxable base: the order discount is allocated
// across lines proportionally to each line's amount, and tax is computed on the
// discounted amount (Shopify applies tax after discounts).
// ---------------------------------------------------------------------------

export interface TaxLineInput {
  /** price * quantity (listed price), before any discount. */
  amount: number;
  /** Tax rate for this line as a percentage (0..100). */
  rate: number;
  /** Optional label (tax class name) for the per-rate breakdown. */
  label?: string;
}

export interface TaxLineResult {
  amount: number;
  rate: number;
  label?: string;
  /** The line amount after its share of the order discount. */
  discountedAmount: number;
  /** Net (ex-tax) taxable value of this line. */
  taxableValue: number;
  /** Tax for this line. */
  tax: number;
}

export interface TaxRateBucket {
  rate: number;
  label: string;
  /** Net taxable value at this rate. */
  taxableValue: number;
  tax: number;
}

export interface TaxResult {
  /** Total tax (ADDED to the total when exclusive; already INCLUDED when inclusive). */
  totalTax: number;
  /** Whether prices were inclusive (echoed back for the caller). */
  inclusive: boolean;
  lines: TaxLineResult[];
  /** Grouped by rate — the invoice tax breakdown. */
  byRate: TaxRateBucket[];
}

/** Round to 2 decimal places (money), guarding float error. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compute tax for a set of lines.
 *
 * @param lines    per-line listed amount (price*qty) + resolved rate
 * @param discount total order discount (>= 0), allocated proportionally
 * @param pricesIncludeTax  inclusive vs exclusive semantics
 * @param enabled  when false, everything is zero-tax (feature off)
 */
export function computeTax({
  lines,
  discount = 0,
  pricesIncludeTax = false,
  enabled = true,
}: {
  lines: TaxLineInput[];
  discount?: number;
  pricesIncludeTax?: boolean;
  enabled?: boolean;
}): TaxResult {
  const safeLines = Array.isArray(lines) ? lines : [];
  const gross = safeLines.reduce(
    (s, l) => s + (Number.isFinite(l.amount) ? Math.max(0, l.amount) : 0),
    0,
  );
  const disc = Number.isFinite(discount)
    ? Math.min(Math.max(0, discount), gross)
    : 0;

  const results: TaxLineResult[] = safeLines.map((l) => {
    const amount = Number.isFinite(l.amount) ? Math.max(0, l.amount) : 0;
    const rate = enabled && Number.isFinite(l.rate) ? Math.max(0, l.rate) : 0;
    // Allocate the order discount proportionally to this line's share.
    const share = gross > 0 ? amount / gross : 0;
    const discountedAmount = round2(amount - disc * share);

    let tax = 0;
    let taxableValue = discountedAmount;
    if (rate > 0) {
      if (pricesIncludeTax) {
        // Tax carved out of the (discounted) gross amount.
        tax = round2((discountedAmount * rate) / (100 + rate));
        taxableValue = round2(discountedAmount - tax);
      } else {
        // Tax added on top of the (discounted) net amount.
        tax = round2((discountedAmount * rate) / 100);
        taxableValue = discountedAmount;
      }
    }

    return {
      amount,
      rate,
      label: l.label,
      discountedAmount,
      taxableValue,
      tax,
    };
  });

  const totalTax = round2(results.reduce((s, r) => s + r.tax, 0));

  // Group by rate for the invoice breakdown.
  const buckets = new Map<number, TaxRateBucket>();
  for (const r of results) {
    if (r.rate <= 0) continue;
    const key = r.rate;
    const existing = buckets.get(key);
    if (existing) {
      existing.taxableValue = round2(existing.taxableValue + r.taxableValue);
      existing.tax = round2(existing.tax + r.tax);
    } else {
      buckets.set(key, {
        rate: r.rate,
        label: r.label || `Tax ${r.rate}%`,
        taxableValue: r.taxableValue,
        tax: r.tax,
      });
    }
  }
  const byRate = [...buckets.values()].sort((a, b) => a.rate - b.rate);

  return { totalTax, inclusive: pricesIncludeTax, lines: results, byRate };
}
