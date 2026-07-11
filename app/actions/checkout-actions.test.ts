/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

// placeOrder authenticates with the cookie/server client, but does every
// product read + order write with the SERVICE-ROLE admin client, resolves the
// store from the host, re-validates the coupon, and rate-limits per user.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/store/resolve", () => ({
  getCurrentStoreId: vi.fn(async () => STORE),
  getCurrentStore: vi.fn(async () => ({ id: STORE, name: "Test Store" })),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));
vi.mock("./coupon-actions", () => ({ validateCoupon: vi.fn() }));
// Online payments: the gateway loader (credential decrypt) and the Razorpay
// HTTP calls are mocked at the module boundary; the pure helpers
// (capturedPayment) keep their real implementations — they're unit-tested in
// lib/payments/payments.test.ts.
vi.mock("@/lib/payments/provider", () => ({
  getStoreGateway: vi.fn(),
  getPlatformRazorpayCreds: vi.fn(),
}));
vi.mock("@/lib/payments/razorpay", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    rzpCreateOrder: vi.fn(),
    rzpFetchOrderPayments: vi.fn(),
    verifyCheckoutSignature: vi.fn(),
  };
});

import {
  placeOrder,
  getCartStock,
  confirmOnlinePayment,
  reconcileMyOrderPayment,
  type CheckoutFormData,
} from "./checkout-actions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { validateCoupon } from "./coupon-actions";
import { getStoreGateway } from "@/lib/payments/provider";
import {
  rzpCreateOrder,
  rzpFetchOrderPayments,
  verifyCheckoutSignature,
} from "@/lib/payments/razorpay";
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
    // Marked so cancellation restocks it exactly once (order-actions claim).
    expect(inserted.stock_status).toBe("reserved");
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

  it("fails checkout if stock cannot be reserved, reports the exact shortfall, and rolls back prior reservations", async () => {
    // We simulate 2 items. The first item reserves successfully, the second
    // fails. The post-failure re-read (maybeSingle) reports 1 unit left, so the
    // shopper is told the precise remaining quantity.
    admin = makeAdmin({
      products: makeChain(
        { data: { stock: 1 }, error: null }, // availableStock() re-read
        {
          data: [
            { id: "p1", name: "Prod", selling_price: 100, store_id: STORE },
            {
              id: "p2",
              name: "Product 2",
              selling_price: 150,
              store_id: STORE,
            },
          ],
          error: null,
        },
      ),
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
    // Names the exact remaining count from the live re-read.
    expect("error" in result && result.error).toMatch(/only 1 left/i);
    // Should have called release_stock for the first item that succeeded.
    expect(admin.rpc).toHaveBeenCalledWith(
      "release_stock",
      expect.objectContaining({
        p_product: "p1",
        p_reason: "checkout_failed",
      }),
    );
  });

  it("reports 'just sold out' when the live re-read shows zero left", async () => {
    admin = makeAdmin({
      products: makeChain(
        { data: { stock: 0 }, error: null }, // availableStock() → 0 left
        {
          data: [
            { id: "p1", name: "Prod", selling_price: 100, store_id: STORE },
          ],
          error: null,
        },
      ),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    admin.rpc.mockImplementation((name: string) =>
      name === "reserve_stock"
        ? Promise.resolve({ data: false, error: null })
        : Promise.resolve({ data: true, error: null }),
    );

    const result = await placeOrder(validForm, [oneItem({ productId: "p1" })]);
    expect("error" in result && result.error).toMatch(/just sold out/i);
    expect(admin._tables.orders.delete).toHaveBeenCalled();
  });

  // Regression guard for the stock_movements.order_id foreign key. reserve_stock
  // writes a ledger row referencing the order, so the order row MUST be inserted
  // BEFORE any stock is reserved. We simulate the FK by failing reserve_stock
  // until the order has been inserted: the previous "reserve before insert"
  // ordering trips it and aborts every tracked-SKU checkout. A fully-mocked rpc
  // (as the other tests use) can't catch this, so we model the constraint here.
  it("creates the order before reserving stock (stock_movements FK ordering)", async () => {
    let orderInserted = false;
    const ordersChain = admin._tables.orders;
    ordersChain.insert = vi.fn(() => {
      orderInserted = true;
      return ordersChain;
    });

    admin.rpc.mockImplementation((name: string) => {
      // Mirror Postgres rejecting a stock_movements row whose order_id has no
      // matching orders row yet.
      if (name === "reserve_stock" && !orderInserted) {
        return Promise.resolve({
          data: null,
          error: {
            message:
              'insert or update on table "stock_movements" violates foreign key constraint "stock_movements_order_id_fkey"',
          },
        });
      }
      return Promise.resolve({ data: true, error: null });
    });

    const result = await placeOrder(validForm, [oneItem()]);

    expect("success" in result && result.success).toBe(true);
    expect(orderInserted).toBe(true);
    // reserve_stock succeeded only because the order row already existed.
    expect(admin.rpc).toHaveBeenCalledWith(
      "reserve_stock",
      expect.objectContaining({ p_product: "p1", p_qty: 2 }),
    );
  });
});

// getCartStock re-reads live stock for the cart, store-scoped, so the checkout
// page can reconcile a stale localStorage cart before the shopper commits.
describe("getCartStock", () => {
  function makeStockAdmin(overrides: Record<string, any> = {}) {
    return makeSupabase({
      products: makeChain(undefined, {
        data: [
          { id: "p1", track_inventory: true, stock: 3, allow_backorder: false },
        ],
        error: null,
      }),
      product_variants: makeChain(undefined, {
        data: [
          { id: "v1", track_inventory: true, stock: 2, allow_backorder: false },
        ],
        error: null,
      }),
      ...overrides,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] for an empty cart without touching the DB", async () => {
    const admin = makeStockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    expect(await getCartStock([])).toEqual([]);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("returns a fresh, store-scoped snapshot for a product line", async () => {
    const admin = makeStockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin);

    const info = await getCartStock([{ productId: "p1", variantId: null }]);
    expect(info).toEqual([
      {
        productId: "p1",
        variantId: null,
        exists: true,
        trackInventory: true,
        stock: 3,
        allowBackorder: false,
      },
    ]);
    expect(admin._tables.products.eq).toHaveBeenCalledWith("store_id", STORE);
  });

  it("marks a vanished product as exists:false", async () => {
    const admin = makeStockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin);

    const info = await getCartStock([{ productId: "gone", variantId: null }]);
    expect(info[0].exists).toBe(false);
  });

  it("resolves a variant line from the variant row (not the product)", async () => {
    const admin = makeStockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin);

    const info = await getCartStock([{ productId: "p1", variantId: "v1" }]);
    expect(info[0]).toMatchObject({
      variantId: "v1",
      exists: true,
      stock: 2, // the variant's stock, not the product's 3
    });
  });

  it("marks a variant line exists:false when the variant is gone", async () => {
    const admin = makeStockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin);

    const info = await getCartStock([{ productId: "p1", variantId: "vGone" }]);
    expect(info[0].exists).toBe(false);
  });
});

// A store with tax ENABLED: the product carries a tax class (GST 18%), read
// authoritatively from the DB. placeOrder must snapshot the tax onto the order +
// each line, and adjust the total per the inclusive/exclusive mode. (The
// tax-OFF path is the default in every other placeOrder test above.)
describe("placeOrder — tax", () => {
  function makeTaxAdmin(pricesIncludeTax: boolean) {
    const s = makeSupabase({
      products: makeChain(undefined, {
        data: [
          {
            id: "p1",
            name: "Prod",
            selling_price: 100,
            store_id: STORE,
            tax_class_id: "tc1",
          },
        ],
        error: null,
      }),
      product_variants: makeChain(undefined, { data: [], error: null }),
      store_billing_settings: makeChain(
        {
          data: {
            tax_enabled: true,
            prices_include_tax: pricesIncludeTax,
            default_tax_class_id: null,
          },
          error: null,
        },
        { error: null },
      ),
      tax_classes: makeChain(undefined, {
        data: [{ id: "tc1", name: "GST 18%", rate: 18, sort_order: 0 }],
        error: null,
      }),
      orders: makeChain(
        { data: { id: "order-1", order_ref: "ORD1" }, error: null },
        { error: null },
      ),
      order_items: makeChain(undefined, { error: null }),
      coupons: makeChain(
        { data: { id: "c1", used_count: 0 }, error: null },
        { error: null },
      ),
    });
    // reserve_stock + increment_coupon_usage both succeed.
    s.rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    return s;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(
      makeSupabase({}, { id: "user-1" }),
    );
    vi.mocked(rateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(validateCoupon).mockResolvedValue({} as any);
  });

  it("adds tax on top of the total when prices are exclusive", async () => {
    const admin = makeTaxAdmin(false);
    vi.mocked(createAdminClient).mockReturnValue(admin);

    // oneItem() = qty 2 @ ₹100 (DB price) → subtotal 200.
    const res = await placeOrder(validForm, [oneItem()]);
    expect("success" in res && res.success).toBe(true);

    const order = admin._tables.orders.insert.mock.calls[0][0];
    expect(order.subtotal).toBe(200);
    expect(order.tax).toBe(36); // 200 * 18%
    expect(order.tax_inclusive).toBe(false);
    expect(order.total).toBe(236); // subtotal + tax

    const items = admin._tables.order_items.insert.mock.calls[0][0];
    expect(items[0].tax_rate).toBe(18);
    expect(items[0].tax_amount).toBe(36);
    expect(items[0].tax_class_name).toBe("GST 18%");
  });

  it("carves tax out without changing the total when prices are inclusive", async () => {
    const admin = makeTaxAdmin(true);
    vi.mocked(createAdminClient).mockReturnValue(admin);

    const res = await placeOrder(validForm, [oneItem()]);
    expect("success" in res && res.success).toBe(true);

    const order = admin._tables.orders.insert.mock.calls[0][0];
    expect(order.subtotal).toBe(200);
    expect(order.tax).toBe(30.51); // round2(200 * 18 / 118)
    expect(order.tax_inclusive).toBe(true);
    expect(order.total).toBe(200); // unchanged — tax already inside the price

    const items = admin._tables.order_items.insert.mock.calls[0][0];
    expect(items[0].tax_amount).toBe(30.51);
  });
});

// ---------------------------------------------------------------------------
// Online payments (BYO Razorpay)
// ---------------------------------------------------------------------------

const GATEWAY = {
  creds: { keyId: "rzp_test_abc123", keySecret: "shh" },
  enabled: true,
};

// Admin mock whose `stores` row is on a paid plan (online payments allowed).
function makeRzpAdmin(overrides: Record<string, any> = {}) {
  const s = makeSupabase({
    stores: makeChain({
      data: { plan: "basic", plan_expires_at: null },
      error: null,
    }),
    products: makeChain(undefined, {
      data: [{ id: "p1", name: "Prod", selling_price: 100, store_id: STORE }],
      error: null,
    }),
    product_variants: makeChain(undefined, { data: [], error: null }),
    orders: makeChain(
      { data: { id: "order-1", order_ref: "ORD100110006" }, error: null },
      { error: null },
    ),
    order_items: makeChain(undefined, { error: null }),
    ...overrides,
  });
  s.rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  return s;
}

describe("placeOrder — razorpay", () => {
  let admin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    admin = makeRzpAdmin();
    vi.mocked(createClient).mockResolvedValue(
      makeSupabase({}, { id: "user-1" }),
    );
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(rateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(validateCoupon).mockResolvedValue({} as any);
    vi.mocked(getStoreGateway).mockResolvedValue(GATEWAY as any);
    vi.mocked(rzpCreateOrder).mockResolvedValue({
      ok: true,
      data: {
        id: "rzp_order_1",
        amount: 20000,
        currency: "INR",
        receipt: "ORD100110006",
        status: "created",
      },
    } as any);
  });

  it("rejects an unknown payment method", async () => {
    const res = await placeOrder(validForm, [oneItem()], null, "upi" as any);
    expect("error" in res && res.error).toMatch(/invalid payment method/i);
  });

  it("creates the Razorpay order for the SERVER-computed total and returns checkout params", async () => {
    const res = await placeOrder(validForm, [oneItem()], null, "razorpay");
    expect("success" in res && res.success).toBe(true);
    if (!("success" in res)) throw new Error("unreachable");

    // Amount derives from the DB price (100 × 2 = ₹200 = 20000 paise), never
    // the client's claimed 999999.
    expect(rzpCreateOrder).toHaveBeenCalledWith(GATEWAY.creds, {
      amountPaise: 20000,
      receipt: "ORD100110006",
      notes: { order_id: "order-1", store_id: STORE },
    });

    // Our order row records the method + the pinned Razorpay order id.
    const inserted = admin._tables.orders.insert.mock.calls[0][0];
    expect(inserted.payment_method).toBe("razorpay");
    expect(inserted.payment_status).toBe("pending");
    expect(admin._tables.orders.update).toHaveBeenCalledWith({
      razorpay_order_id: "rzp_order_1",
    });

    expect(res.payment).toEqual({
      rzpOrderId: "rzp_order_1",
      keyId: "rzp_test_abc123",
      amountPaise: 20000,
    });
  });

  it("refuses online payment when no gateway is connected/enabled", async () => {
    vi.mocked(getStoreGateway).mockResolvedValue(null);
    const res = await placeOrder(validForm, [oneItem()], null, "razorpay");
    expect("error" in res && res.error).toMatch(/cash on delivery/i);
    expect(admin._tables.orders.insert).not.toHaveBeenCalled();
  });

  it("refuses online payment when the plan doesn't include it (free)", async () => {
    admin = makeRzpAdmin({
      stores: makeChain({
        data: { plan: "free", plan_expires_at: null },
        error: null,
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await placeOrder(validForm, [oneItem()], null, "razorpay");
    expect("error" in res && res.error).toMatch(/cash on delivery/i);
    expect(admin._tables.orders.insert).not.toHaveBeenCalled();
  });

  it("rolls back stock, order and coupon when the Razorpay order can't be created", async () => {
    vi.mocked(validateCoupon).mockResolvedValue({
      coupon: {
        code: "SAVE10",
        discountType: "percentage",
        discountValue: 10,
        minOrderAmount: 0,
      },
    } as any);
    vi.mocked(rzpCreateOrder).mockResolvedValue({
      ok: false,
      error: "gateway down",
    } as any);

    const res = await placeOrder(validForm, [oneItem()], "SAVE10", "razorpay");
    expect("error" in res && res.error).toMatch(/try again/i);

    expect(admin.rpc).toHaveBeenCalledWith(
      "release_stock",
      expect.objectContaining({ p_order: "order-1" }),
    );
    expect(admin._tables.orders.delete).toHaveBeenCalled();
    expect(admin.rpc).toHaveBeenCalledWith("decrement_coupon_usage", {
      p_code: "SAVE10",
      p_store_id: STORE,
    });
  });

  it("rolls back when the rzp order id can't be pinned to our order", async () => {
    // orders: insert().select().single() succeeds, but the follow-up
    // update().eq() (awaited directly) fails.
    admin = makeRzpAdmin({
      orders: makeChain(
        { data: { id: "order-1", order_ref: "ORD100110006" }, error: null },
        { error: { message: "boom" } },
      ),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);

    const res = await placeOrder(validForm, [oneItem()], null, "razorpay");
    expect("error" in res && res.error).toMatch(/try again/i);
    expect(admin._tables.orders.delete).toHaveBeenCalled();
  });
});

describe("confirmOnlinePayment", () => {
  let admin: any;

  const pendingOrder = {
    id: "order-1",
    payment_method: "razorpay",
    payment_status: "pending",
    razorpay_order_id: "rzp_order_1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    admin = makeSupabase({
      orders: makeChain({ data: pendingOrder, error: null }, { error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(
      makeSupabase({}, { id: "user-1" }),
    );
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(rateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(getStoreGateway).mockResolvedValue(GATEWAY as any);
    vi.mocked(verifyCheckoutSignature).mockReturnValue(true);
  });

  it("verifies the HMAC with the store secret and marks the order paid", async () => {
    const res = await confirmOnlinePayment("order-1", "pay_1", "sig");
    expect(res).toEqual({ success: true, paid: true });

    expect(verifyCheckoutSignature).toHaveBeenCalledWith(
      "shh",
      "rzp_order_1",
      "pay_1",
      "sig",
    );
    expect(admin._tables.orders.update).toHaveBeenCalledWith({
      payment_status: "paid",
      razorpay_payment_id: "pay_1",
    });
    // Idempotency: the update claims the pending → paid transition.
    expect(admin._tables.orders.eq).toHaveBeenCalledWith(
      "payment_status",
      "pending",
    );
    // Ownership: the order lookup is scoped to the signed-in customer + store.
    expect(admin._tables.orders.eq).toHaveBeenCalledWith(
      "customer_id",
      "user-1",
    );
    expect(admin._tables.orders.eq).toHaveBeenCalledWith("store_id", STORE);
  });

  it("rejects a bad signature and leaves the order untouched", async () => {
    vi.mocked(verifyCheckoutSignature).mockReturnValue(false);
    const res = await confirmOnlinePayment("order-1", "pay_1", "bad");
    expect("error" in res && res.error).toMatch(/verification failed/i);
    expect(admin._tables.orders.update).not.toHaveBeenCalled();
  });

  it("is a no-op success when the order is already paid", async () => {
    admin = makeSupabase({
      orders: makeChain(
        { data: { ...pendingOrder, payment_status: "paid" }, error: null },
        { error: null },
      ),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);

    const res = await confirmOnlinePayment("order-1", "pay_1", "sig");
    expect(res).toEqual({ success: true, paid: true });
    expect(verifyCheckoutSignature).not.toHaveBeenCalled();
    expect(admin._tables.orders.update).not.toHaveBeenCalled();
  });

  it("rejects an anonymous caller", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabase({}, null));
    const res = await confirmOnlinePayment("order-1", "pay_1", "sig");
    expect("error" in res && res.error).toMatch(/logged in/i);
  });

  it("rejects when the order isn't the caller's / isn't razorpay", async () => {
    admin = makeSupabase({
      orders: makeChain({ data: null, error: null }, { error: null }),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await confirmOnlinePayment("order-1", "pay_1", "sig");
    expect("error" in res && res.error).toMatch(/not found/i);
  });
});

describe("reconcileMyOrderPayment", () => {
  const pendingOrder = {
    id: "order-1",
    payment_method: "razorpay",
    payment_status: "pending",
    razorpay_order_id: "rzp_order_1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(
      makeSupabase({}, { id: "user-1" }),
    );
    vi.mocked(rateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(getStoreGateway).mockResolvedValue(GATEWAY as any);
  });

  it("marks the order paid when Razorpay reports a captured payment", async () => {
    const admin = makeSupabase({
      orders: makeChain({ data: pendingOrder, error: null }, { error: null }),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(rzpFetchOrderPayments).mockResolvedValue({
      ok: true,
      data: [
        { id: "pay_f", order_id: "rzp_order_1", amount: 1, status: "failed" },
        {
          id: "pay_ok",
          order_id: "rzp_order_1",
          amount: 20000,
          status: "captured",
        },
      ],
    } as any);

    const res = await reconcileMyOrderPayment("order-1");
    expect(res).toEqual({ success: true, paid: true });
    expect(admin._tables.orders.update).toHaveBeenCalledWith({
      payment_status: "paid",
      razorpay_payment_id: "pay_ok",
    });
  });

  it("reports unpaid (without cancelling) when nothing was captured", async () => {
    const admin = makeSupabase({
      orders: makeChain({ data: pendingOrder, error: null }, { error: null }),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(rzpFetchOrderPayments).mockResolvedValue({
      ok: true,
      data: [],
    } as any);

    const res = await reconcileMyOrderPayment("order-1");
    expect(res).toEqual({ success: true, paid: false });
    expect(admin._tables.orders.update).not.toHaveBeenCalled();
  });
});
