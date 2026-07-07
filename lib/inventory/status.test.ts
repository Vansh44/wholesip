import { describe, it, expect } from "vitest";
import {
  effectiveLowStockThreshold,
  isSoldOut,
  lowStockLeft,
  maxPurchasable,
  inventoryStatus,
  productIsSoldOut,
  productLowStockLeft,
  type StockFields,
} from "./status";

// Build a SKU with sensible tracked-in-stock defaults.
const sku = (over: Partial<StockFields> = {}): StockFields => ({
  track_inventory: true,
  stock: 100,
  low_stock_threshold: null,
  allow_backorder: false,
  ...over,
});

describe("effectiveLowStockThreshold", () => {
  it("uses the per-SKU override when set, else the store default", () => {
    expect(effectiveLowStockThreshold(3, 5)).toBe(3);
    expect(effectiveLowStockThreshold(null, 5)).toBe(5);
    expect(effectiveLowStockThreshold(0, 5)).toBe(0); // explicit 0 = never low
  });
});

describe("isSoldOut", () => {
  it("is sold out only when tracked, non-backorderable, and empty", () => {
    expect(isSoldOut(sku({ stock: 0 }))).toBe(true);
    expect(isSoldOut(sku({ stock: 0, allow_backorder: true }))).toBe(false);
    expect(isSoldOut(sku({ stock: 0, track_inventory: false }))).toBe(false);
    expect(isSoldOut(sku({ stock: 1 }))).toBe(false);
  });
});

describe("lowStockLeft", () => {
  it("applies the STORE DEFAULT when no per-SKU threshold is set (the #5 fix)", () => {
    // stock 3, no per-SKU threshold, store default 5 → low, "Only 3 left".
    expect(lowStockLeft(sku({ stock: 3, low_stock_threshold: null }), 5)).toBe(
      3,
    );
    // Above the default → not low.
    expect(
      lowStockLeft(sku({ stock: 9, low_stock_threshold: null }), 5),
    ).toBeNull();
  });

  it("lets a per-SKU threshold override the store default", () => {
    expect(lowStockLeft(sku({ stock: 8, low_stock_threshold: 10 }), 5)).toBe(8);
    expect(
      lowStockLeft(sku({ stock: 8, low_stock_threshold: 2 }), 5),
    ).toBeNull();
  });

  it("returns null for out-of-stock or untracked SKUs", () => {
    expect(lowStockLeft(sku({ stock: 0 }), 5)).toBeNull();
    expect(
      lowStockLeft(sku({ stock: 3, track_inventory: false }), 5),
    ).toBeNull();
  });
});

describe("maxPurchasable", () => {
  it("caps a tracked, non-backorderable SKU at its stock (the #7 fix)", () => {
    expect(maxPurchasable(sku({ stock: 3 }))).toBe(3);
    expect(maxPurchasable(sku({ stock: 0 }))).toBe(0);
  });

  it("does not cap untracked or backorderable SKUs (returns the ceiling)", () => {
    expect(maxPurchasable(sku({ track_inventory: false, stock: 0 }))).toBe(99);
    expect(maxPurchasable(sku({ allow_backorder: true, stock: 2 }))).toBe(99);
  });

  it("never exceeds the UI ceiling and respects a custom one", () => {
    expect(maxPurchasable(sku({ stock: 500 }))).toBe(99);
    expect(maxPurchasable(sku({ stock: 500 }), 10)).toBe(10);
  });
});

describe("inventoryStatus (dashboard, backorder-independent)", () => {
  it("classifies untracked / out / low / in", () => {
    expect(inventoryStatus(sku({ track_inventory: false }), 5)).toBe(
      "untracked",
    );
    expect(inventoryStatus(sku({ stock: 0 }), 5)).toBe("out");
    // 'out' even when backorderable — admins want to see the zero.
    expect(inventoryStatus(sku({ stock: 0, allow_backorder: true }), 5)).toBe(
      "out",
    );
    expect(inventoryStatus(sku({ stock: 3 }), 5)).toBe("low");
    expect(inventoryStatus(sku({ stock: 50 }), 5)).toBe("in");
  });
});

describe("productIsSoldOut", () => {
  it("with variants: sold out only when EVERY variant is sold out", () => {
    const soldOut = sku({ stock: 0 });
    const available = sku({ stock: 4 });
    expect(productIsSoldOut([soldOut, soldOut], sku())).toBe(true);
    expect(productIsSoldOut([soldOut, available], sku())).toBe(false);
  });

  it("without variants: uses the product's own fields", () => {
    expect(productIsSoldOut([], sku({ stock: 0 }))).toBe(true);
    expect(productIsSoldOut([], sku({ stock: 2 }))).toBe(false);
  });
});

describe("productLowStockLeft", () => {
  it("simple product: falls back to the per-SKU/store-default resolution", () => {
    expect(productLowStockLeft([], sku({ stock: 3 }), 5)).toBe(3);
    expect(productLowStockLeft([], sku({ stock: 50 }), 5)).toBeNull();
  });

  it("variant product: totals remaining stock when all variants are limited", () => {
    // 2 + 1 = 3 total, all tracked/no-backorder, under default 5 → low.
    expect(
      productLowStockLeft([sku({ stock: 2 }), sku({ stock: 1 })], sku(), 5),
    ).toBe(3);
    // Total over the default → not low.
    expect(
      productLowStockLeft([sku({ stock: 4 }), sku({ stock: 4 })], sku(), 5),
    ).toBeNull();
  });

  it("variant product: an unlimited supply path suppresses the low badge", () => {
    // A backorderable or untracked variant means there's effectively no cap.
    expect(
      productLowStockLeft(
        [sku({ stock: 1 }), sku({ stock: 1, allow_backorder: true })],
        sku(),
        5,
      ),
    ).toBeNull();
    expect(
      productLowStockLeft(
        [sku({ stock: 1 }), sku({ stock: 1, track_inventory: false })],
        sku(),
        5,
      ),
    ).toBeNull();
  });
});
