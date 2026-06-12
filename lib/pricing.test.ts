import { describe, it, expect } from "vitest";
import { formatPrice, discountPercent, effectivePricing } from "./pricing";

// formatPrice() is the storefront's currency formatter — rupees, Indian
// grouping (lakh/crore commas), no trailing zeros.
describe("formatPrice", () => {
  // Verifies the rupee symbol prefix and the Indian numbering system: 1,00,000
  // (not 100,000) is what users in India expect to see.
  it("formats with rupee prefix and Indian grouping", () => {
    expect(formatPrice(1000)).toBe("₹1,000");
    expect(formatPrice(100000)).toBe("₹1,00,000");
  });

  // Zero must render cleanly — used for "Free shipping" rows and the like.
  it("handles zero", () => {
    expect(formatPrice(0)).toBe("₹0");
  });

  // Whole rupees show no decimals; fractional shows up to two digits with
  // standard rounding.
  it("keeps up to two fractional digits when present", () => {
    expect(formatPrice(99.5)).toBe("₹99.5");
    expect(formatPrice(99.456)).toBe("₹99.46");
  });
});

// discountPercent() drives the "X% off" badge on product cards and PDPs.
describe("discountPercent", () => {
  // Standard sale math — base 100, selling 75 → 25% off.
  it("returns rounded percent off when selling < base", () => {
    expect(discountPercent(100, 75)).toBe(25);
    expect(discountPercent(200, 150)).toBe(25);
  });

  // The badge shows whole numbers, so values are rounded (33.5 → 34).
  it("rounds to the nearest integer", () => {
    expect(discountPercent(100, 67)).toBe(33);
    expect(discountPercent(100, 66)).toBe(34);
  });

  // No badge when there's no genuine discount (selling equals or exceeds base).
  it("returns 0 when selling >= base", () => {
    expect(discountPercent(100, 100)).toBe(0);
    expect(discountPercent(100, 120)).toBe(0);
  });

  // Guards against divide-by-zero / negative pricing in dirty data.
  it("returns 0 when base is non-positive", () => {
    expect(discountPercent(0, 0)).toBe(0);
    expect(discountPercent(-5, 1)).toBe(0);
  });

  // Defensive — NaN/Infinity must never reach the UI.
  it("returns 0 for non-finite inputs", () => {
    expect(discountPercent(Number.NaN, 50)).toBe(0);
    expect(discountPercent(100, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

// effectivePricing() picks the "from price" shown on product cards. With
// variants it shows the DEFAULT variant (lowest sort_order — the first row
// the admin entered in the editor); without variants, the product-level pair.
describe("effectivePricing", () => {
  // Simple no-variant product: pass through base/selling and compute discount.
  it("returns product-level pricing when no variants", () => {
    const out = effectivePricing({ base_price: 100, selling_price: 80 });
    expect(out).toEqual({
      base: 100,
      selling: 80,
      discount: 20,
      hasVariants: false,
    });
  });

  // If selling_price isn't set, fall back to base — never show a free product.
  it("falls back to base when selling is zero/unset", () => {
    const out = effectivePricing({ base_price: 100, selling_price: 0 });
    expect(out.base).toBe(100);
    expect(out.selling).toBe(100);
    expect(out.discount).toBe(0);
  });

  // Defensive — if dirty data has selling > base, clamp it (never INCREASE).
  it("clamps selling so it never exceeds base", () => {
    const out = effectivePricing({ base_price: 100, selling_price: 150 });
    expect(out.selling).toBe(100);
    expect(out.discount).toBe(0);
  });

  // With variants the card shows the DEFAULT variant — the one with the
  // lowest sort_order. The admin re-orders rows in the editor to change
  // which variant is the default; pricing has nothing to do with the pick.
  it("picks the variant with the lowest sort_order when variants present", () => {
    const out = effectivePricing({
      base_price: 500,
      selling_price: 500,
      variants: [
        // Cheaper variant intentionally placed second — must NOT be picked.
        { base_price: 200, selling_price: 180, sort_order: 1 },
        { base_price: 300, selling_price: 240, sort_order: 0 },
        { base_price: 100, selling_price: 90, sort_order: 2 },
      ],
    });
    expect(out.hasVariants).toBe(true);
    // sort_order=0 → base 300, selling 240, 20% off.
    expect(out.base).toBe(300);
    expect(out.selling).toBe(240);
    expect(out.discount).toBe(20);
  });

  // Legacy rows that pre-date the sort_order column (or that all share
  // sort_order=0) fall back to array order so the result stays stable.
  it("falls back to array order when sort_order is missing", () => {
    const out = effectivePricing({
      base_price: 500,
      selling_price: 500,
      variants: [
        { base_price: 100, selling_price: 90 }, // first → default
        { base_price: 200, selling_price: 180 },
      ],
    });
    expect(out.selling).toBe(90);
    expect(out.base).toBe(100);
  });

  // An empty `variants: []` array shouldn't be treated as "has variants" — it
  // means none exist yet, so fall back to product-level pricing.
  it("treats an empty variant array as no variants", () => {
    const out = effectivePricing({
      base_price: 50,
      selling_price: 40,
      variants: [],
    });
    expect(out.hasVariants).toBe(false);
    expect(out.selling).toBe(40);
  });
});
