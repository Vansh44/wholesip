// Shared catalog pricing helpers — used by the dashboard, shop grid, and PDP.

export function formatPrice(n: number): string {
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

// Percentage off, rounded. Returns 0 when there's no genuine discount.
export function discountPercent(base: number, selling: number): number {
  if (!Number.isFinite(base) || !Number.isFinite(selling)) return 0;
  if (base <= 0 || selling >= base) return 0;
  return Math.round(((base - selling) / base) * 100);
}

export interface PricedVariant {
  base_price: number;
  selling_price: number;
}

export interface PricedLike {
  base_price: number;
  selling_price: number;
  variants?: PricedVariant[];
}

export interface EffectivePricing {
  base: number; // original price (struck through when discounted)
  selling: number; // price actually charged
  discount: number; // percent off, 0 when none
  hasVariants: boolean;
}

// Normalize a single base/selling pair: fall back to base when no selling
// price is set, and never let selling exceed base.
function normalizePair(base: number, selling: number) {
  const b = Number.isFinite(base) && base > 0 ? base : 0;
  let s = Number.isFinite(selling) && selling > 0 ? selling : b;
  if (b > 0 && s > b) s = b;
  return { base: b, selling: s };
}

// The "from" / display pricing for a product: the cheapest sellable option
// (cheapest variant by selling price, or the product-level pair).
export function effectivePricing(p: PricedLike): EffectivePricing {
  const hasVariants = !!(p.variants && p.variants.length > 0);
  const pairs = hasVariants
    ? p.variants!.map((v) => normalizePair(v.base_price, v.selling_price))
    : [normalizePair(p.base_price, p.selling_price)];

  let best = pairs[0];
  for (const pair of pairs) {
    if (pair.selling < best.selling) best = pair;
  }

  return {
    base: best.base,
    selling: best.selling,
    discount: discountPercent(best.base, best.selling),
    hasVariants,
  };
}
