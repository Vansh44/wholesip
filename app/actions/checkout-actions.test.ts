/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

// placeOrder authenticates with the cookie/server client, but does every
// product read + order write with the SERVICE-ROLE admin client, resolves the
// store from the host, re-validates the coupon, and rate-limits per user.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/store/resolve", () => ({
  getCurrentStoreId: vi.fn(async () => STORE),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));
vi.mock("./coupon-actions", () => ({ validateCoupon: vi.fn() }));

import { placeOrder, type CheckoutFormData } from "./checkout-actions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { validateCoupon } from "./coupon-actions";
import { makeChain, makeSupabase } from "./_test-helpers";
import type { CartItem } from "@/app/(storefront)/components/cart/CartProvider";

const STORE = "a0000000-0000-4000-8000-000000000001";

const validForm: CheckoutFormData = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "9999999999",
  addressLine1: "1 Analytical Engine Rd",
  city: "London",
  state: "England",
  postalCode: "SW1",
  country: "UK",
};

// One line, client-claimed price is deliberately absurd — the server must
// ignore it and re-price from the DB (100), so subtotal = 100 * 2 = 200.
function oneItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: "p1",
    slug: "prod",
    name: "Prod",
    variantId: null,
    variantName: null,
    price: 999999,
    basePrice: 999999,
    image: null,
    quantity: 2,
    ...overrides,
  };
}

// The admin client that placeOrder reads/writes through. Each table gets a
// chain; products/order_items resolve when awaited, orders/coupons via single/
// maybeSingle.
function makeAdmin(overrides: Record<string, any> = {}) {
  const s = makeSupabase({
    products: makeChain(undefined, {
      data: [{ id: "p1", name: "Prod", selling_price: 100, store_id: STORE }],
      error: null,
    }),
    product_variants: makeChain(undefined, { data: [], error: null }),
    orders: makeChain(
      { data: { id: "order-1" }, error: null },
      {
        error: null,
      },
    ),
    order_items: makeChain(undefined, { error: null }),
    coupons: makeChain(
      { data: { id: "c1", used_count: 0 }, error: null },
      { error: null },
    ),
    ...overrides,
  });
  // Default rpc mock so both reserve_stock and increment_coupon_usage pass.
  s.rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  return s;
}

describe("placeOrder", () => {
  let admin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    admin = makeAdmin();
    vi.mocked(createClient).mockResolvedValue(
      makeSupabase({}, { id: "user-1" }),
    );
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(rateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(validateCoupon).mockResolvedValue({} as any);
  });

  it("rejects an anonymous caller", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabase({}, null));
    const result = await placeOrder(validForm, [oneItem()]);
    expect("error" in result && result.error).toMatch(/logged in/i);
  });

  it("rejects an empty cart", async () => {
    const result = await placeOrder(validForm, []);
    expect("error" in result && result.error).toMatch(/empty/i);
  });

  it("rejects a cart with too many line items", async () => {
    const items = Array.from({ length: 101 }, (_, i) =>
      oneItem({ productId: `p${i}` }),
    );
    const result = await placeOrder(validForm, items);
    expect("error" in result && result.error).toMatch(/too many/i);
  });

  it("rejects a non-positive / non-integer quantity", async () => {
    const bad = await placeOrder(validForm, [oneItem({ quantity: 0 })]);
    expect("error" in bad && bad.error).toMatch(/invalid quantity/i);
    const frac = await placeOrder(validForm, [oneItem({ quantity: 1.5 })]);
    expect("error" in frac && frac.error).toMatch(/invalid quantity/i);
  });

  it("rejects when a required address field is missing", async () => {
    const result = await placeOrder({ ...validForm, city: "   " }, [oneItem()]);
    expect("error" in result && result.error).toMatch(/city is required/i);
  });

  it("rejects when rate-limited", async () => {
    vi.mocked(rateLimit).mockResolvedValue({ allowed: false });
    const result = await placeOrder(validForm, [oneItem()]);
    expect("error" in result && result.error).toMatch(/too many/i);
  });

  it("rejects when the product is not found in the host store", async () => {
    admin = makeAdmin({
      products: makeChain(undefined, { data: [], error: null }),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const result = await placeOrder(validForm, [oneItem()]);
    expect("error" in result && result.error).toMatch(/not found/i);
  });

  it("re-prices from the DB (ignores the client-supplied price) and scopes to the host store", async () => {
    const result = await placeOrder(validForm, [oneItem()]);
    expect("success" in result && result.success).toBe(true);

    // Products query is store-scoped.
    expect(admin._tables.products.eq).toHaveBeenCalledWith("store_id", STORE);

    // Order total came from the DB price (100 * 2), not the client's 999999.
    const inserted = admin._tables.orders.insert.mock.calls[0][0];
    expect(inserted.subtotal).toBe(200);
    expect(inserted.total).toBe(200);
    expect(inserted.store_id).toBe(STORE);
    expect(inserted.customer_id).toBe("user-1");
  });

  it("applies a validated coupon, rounds the discount, and increments usage", async () => {
    vi.mocked(validateCoupon).mockResolvedValue({
      coupon: {
        code: "SAVE10",
        discountType: "percentage",
        discountValue: 10,
        minOrderAmount: 0,
      },
    } as any);

    const result = await placeOrder(validForm, [oneItem()], "SAVE10");
    expect("success" in result && result.success).toBe(true);

    const inserted = admin._tables.orders.insert.mock.calls[0][0];
    // 10% of 200 = 20 (rounded), total 180.
    expect(inserted.discount).toBe(20);
    expect(inserted.total).toBe(180);
    expect(inserted.applied_coupon_code).toBe("SAVE10");

    // Usage reserved atomically via the RPC (not a read-modify-write).
    expect(admin.rpc).toHaveBeenCalledWith("increment_coupon_usage", {
      p_code: "SAVE10",
      p_store_id: STORE,
    });
  });

  it("refuses checkout when the coupon usage cap was hit concurrently", async () => {
    vi.mocked(validateCoupon).mockResolvedValue({
      coupon: {
        code: "SAVE10",
        discountType: "percentage",
        discountValue: 10,
        minOrderAmount: 0,
      },
    } as any);
    // The atomic reserve returns false → the last use was taken by another order.
    // Must only mock for the coupon RPC, so stock reservation still succeeds.
    admin.rpc.mockImplementation((name: string) => {
      if (name === "increment_coupon_usage")
        return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: true, error: null });
    });

    const result = await placeOrder(validForm, [oneItem()], "SAVE10");
    expect("error" in result && result.error).toMatch(/usage limit/i);
    expect(admin._tables.orders.insert).not.toHaveBeenCalled();
  });

  it("releases the reserved coupon use when the order items fail to save", async () => {
    vi.mocked(validateCoupon).mockResolvedValue({
      coupon: {
        code: "SAVE10",
        discountType: "percentage",
        discountValue: 10,
        minOrderAmount: 0,
      },
    } as any);
    admin = makeAdmin({
      order_items: makeChain(undefined, { error: { message: "boom" } }),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);

    const result = await placeOrder(validForm, [oneItem()], "SAVE10");
    expect("error" in result && result.error).toMatch(/try again/i);
    expect(admin._tables.orders.delete).toHaveBeenCalled();
    // Reserved use handed back atomically.
    expect(admin.rpc).toHaveBeenCalledWith("decrement_coupon_usage", {
      p_code: "SAVE10",
      p_store_id: STORE,
    });
  });

  it("bails out with the coupon error and does not create an order", async () => {
    vi.mocked(validateCoupon).mockResolvedValue({ error: "expired" } as any);
    const result = await placeOrder(validForm, [oneItem()], "OLD");
    expect("error" in result && result.error).toMatch(/coupon error/i);
    expect(admin._tables.orders.insert).not.toHaveBeenCalled();
  });

  it("rolls back the order when order_items insertion fails", async () => {
    admin = makeAdmin({
      order_items: makeChain(undefined, {
        error: { message: "boom" },
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);

    const result = await placeOrder(validForm, [oneItem()]);
    expect("error" in result && result.error).toMatch(/try again/i);
    // Orphan order deleted.
    expect(admin._tables.orders.delete).toHaveBeenCalled();
    expect(admin._tables.orders.eq).toHaveBeenCalledWith("id", "order-1");
  });

  it("fails checkout if stock cannot be reserved and rolls back any prior reservations", async () => {
    // We simulate 2 items. The first item reserves successfully, the second fails.
    admin = makeAdmin({
      products: makeChain(undefined, {
        data: [
          { id: "p1", name: "Prod", selling_price: 100, store_id: STORE },
          { id: "p2", name: "Product 2", selling_price: 150, store_id: STORE },
        ],
        error: null,
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);

    admin.rpc.mockImplementation((name: string, args: any) => {
      if (name === "reserve_stock") {
        if (args.p_product === "p2") {
          return Promise.resolve({ data: false, error: null });
        }
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: true, error: null });
    });

    const result = await placeOrder(validForm, [
      oneItem({ productId: "p1" }),
      oneItem({ productId: "p2", name: "Product 2" }),
    ]);

    expect("error" in result && result.error).toMatch(
      /not enough stock for Product 2/i,
    );
    // Should have called release_stock for the first item that succeeded.
    expect(admin.rpc).toHaveBeenCalledWith(
      "release_stock",
      expect.objectContaining({
        p_product: "p1",
        p_reason: "checkout_failed",
      }),
    );
  });
});
