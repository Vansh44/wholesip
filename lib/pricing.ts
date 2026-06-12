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
  sort_order?: number;
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

// The "from" / display pricing for a product. With variants, we show the
// DEFAULT variant — i.e. the lowest sort_order, which is the first row the
// admin entered in the variants editor. (sort_order is stamped from the
// editor's row index in product-actions.sanitizeVariants.) Without variants,
// the product-level base/selling pair is used.
export function effectivePricing(p: PricedLike): EffectivePricing {
  const hasVariants = !!(p.variants && p.variants.length > 0);

  if (!hasVariants) {
    const pair = normalizePair(p.base_price, p.selling_price);
    return {
      base: pair.base,
      selling: pair.selling,
      discount: discountPercent(pair.base, pair.selling),
      hasVariants: false,
    };
  }

  // Pick the default: lowest sort_order. Legacy rows without sort_order fall
  // back to their array index so we still get a stable choice.
  const sorted = [...p.variants!].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const def = normalizePair(sorted[0].base_price, sorted[0].selling_price);

  return {
    base: def.base,
    selling: def.selling,
    discount: discountPercent(def.base, def.selling),
    hasVariants: true,
  };
}
