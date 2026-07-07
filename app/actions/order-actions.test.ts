/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => STORE),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { getOrders, updateOrderStatus } from "./order-actions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { makeChain, makeSupabase } from "./_test-helpers";

const STORE = "a0000000-0000-4000-8000-000000000001";

describe("order-actions", () => {
  let supabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase({
      orders: makeChain(
        { data: { id: "o1", status: "pending" }, error: null },
        {
          data: [{ id: "o1", total: 100 }],
          count: 3,
          error: null,
        },
      ),
      order_items: makeChain(undefined, {
        data: [{ product_id: "p1", variant_id: "v1", quantity: 2 }],
        error: null,
      }),
    });
    vi.mocked(createClient).mockResolvedValue(supabase);

    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    vi.mocked(createAdminClient).mockReturnValue(admin as any);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  describe("getOrders", () => {
    // Auth gate — no orders permission → nothing leaks.
    it("rejects when the caller lacks the orders permission", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await getOrders();
      expect(result.error).toMatch(/not authenticated/i);
      expect(result.orders).toEqual([]);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    // Happy path — store-scoped, returns rows + total count.
    it("returns store-scoped, paginated orders with a total", async () => {
      const result = await getOrders(1, 50);
      expect(result.error).toBeUndefined();
      expect(result.orders).toEqual([{ id: "o1", total: 100 }]);
      expect(result.total).toBe(3);
      expect(supabase._tables.orders.eq).toHaveBeenCalledWith(
        "store_id",
        STORE,
      );
      // Never selects the whole row / the order_items join for the list.
      expect(supabase._tables.orders.select.mock.calls[0][0]).not.toContain(
        "order_items",
      );
    });

    // Page size is clamped so a client can't request an unbounded range.
    it("clamps an oversized page size", async () => {
      await getOrders(1, 100000);
      // range(from, from + size - 1) → size capped at 100 → (0, 99).
      expect(supabase._tables.orders.range).toHaveBeenCalledWith(0, 99);
    });
  });

  describe("updateOrderStatus", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await updateOrderStatus("o1", "shipped");
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Only known statuses are accepted — no arbitrary string reaches the DB.
    it("rejects an unknown order status", async () => {
      const result = await updateOrderStatus("o1", "hacked");
      expect(result.error).toMatch(/invalid order status/i);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    // Payment status is allowlisted too.
    it("rejects an unknown payment status", async () => {
      const result = await updateOrderStatus("o1", "shipped", "laundered");
      expect(result.error).toMatch(/invalid payment status/i);
    });

    // Empty / non-string order id is rejected.
    it("rejects an empty order id", async () => {
      const result = await updateOrderStatus("   ", "shipped");
      expect(result.error).toMatch(/invalid order/i);
    });

    // Happy path — update is scoped to id AND store.
    it("updates a valid status scoped to the store", async () => {
      const result = await updateOrderStatus("o1", "shipped", "paid");
      expect(result.success).toBe(true);
      expect(supabase._tables.orders.update).toHaveBeenCalledWith({
        status: "shipped",
        payment_status: "paid",
      });
      expect(supabase._tables.orders.eq).toHaveBeenCalledWith("id", "o1");
      expect(supabase._tables.orders.eq).toHaveBeenCalledWith(
        "store_id",
        STORE,
      );
    });

    it("releases stock when an order is cancelled", async () => {
      const result = await updateOrderStatus("o1", "cancelled");
      expect(result.success).toBe(true);

      const admin = vi.mocked(createAdminClient)();
      expect(admin.rpc).toHaveBeenCalledWith("release_stock", {
        p_store: STORE,
        p_product: "p1",
        p_variant: "v1",
        p_qty: 2,
        p_order: "o1",
        p_reason: "order_cancelled",
      });
    });

    it("does not double-release stock if order is already cancelled", async () => {
      supabase._tables.orders = makeChain(
        { data: { id: "o1", status: "cancelled" }, error: null },
        undefined,
      );
      const result = await updateOrderStatus("o1", "cancelled");
      expect(result.success).toBe(true);

      const admin = vi.mocked(createAdminClient)();
      expect(admin.rpc).not.toHaveBeenCalled();
    });
  });
});
