/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => "store-1"),
}));

import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import {
  getInventory,
  adjustStock,
  setStock,
  bulkAdjust,
  getMovements,
} from "./inventory-actions";
import { makeChain, makeSupabase } from "./_test-helpers";
import { TAGS } from "@/lib/storefront/tags";

describe("inventory-actions", () => {
  let supabase: any;
  let admin: any;

  beforeEach(() => {
    vi.clearAllMocks();

    supabase = makeSupabase({
      stores: makeChain({ data: { settings: {}, plan: "free" }, error: null }),
      products: makeChain({ data: [], error: null }),
      product_variants: makeChain({ data: [], error: null }),
      stock_movements: makeChain({ data: [], count: 0, error: null }),
    });

    admin = makeSupabase({
      products: makeChain({ data: { stock: 10 }, error: null }),
      product_variants: makeChain({ data: { stock: 5 }, error: null }),
    });
    // Add rpc mock to admin
    admin.rpc = vi.fn().mockResolvedValue({ data: 20, error: null });

    vi.mocked(createClient).mockResolvedValue(supabase);
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  describe("getInventory", () => {
    it("rejects when not authenticated", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const res = await getInventory({});
      expect(res.error).toMatch(/not authenticated/i);
    });

    it("combines products and variants correctly", async () => {
      supabase._tables.products = makeChain(null, {
        data: [
          {
            id: "p1",
            name: "Simple",
            stock: 10,
            track_inventory: true,
            low_stock_threshold: 5,
            category: { name: "Cat1" },
          },
          {
            id: "p2",
            name: "Variant Product",
            stock: 0,
            track_inventory: false,
          },
        ],
        error: null,
      });

      supabase._tables.product_variants = makeChain(null, {
        data: [
          {
            id: "v1",
            product_id: "p2",
            name: "Var A",
            stock: 2,
            track_inventory: true,
            low_stock_threshold: null, // Should use store default 5
            product: { name: "Variant Product", category: { name: "Cat2" } },
          },
        ],
        error: null,
      });

      const res = await getInventory({});
      expect(res.total).toBe(2);
      expect(res.rows).toHaveLength(2);

      // p1 is a simple product
      const simple = res.rows.find((r) => r.id === "p-p1");
      expect(simple).toBeDefined();
      expect(simple?.status).toBe("in"); // 10 > 5

      // v1 is a variant
      const variant = res.rows.find((r) => r.id === "v-v1");
      expect(variant).toBeDefined();
      expect(variant?.status).toBe("low"); // 2 <= 5
    });
  });

  describe("adjustStock", () => {
    it("rejects when not authenticated", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const res = await adjustStock("p1", null, 10);
      expect(res.error).toMatch(/not authenticated/i);
    });

    it("calls adjust_stock rpc via admin client", async () => {
      const res = await adjustStock("p1", "v1", -2, "sale", "test");
      expect(res.success).toBe(true);
      expect(res.newStock).toBe(20); // mocked rpc response

      expect(admin.rpc).toHaveBeenCalledWith("adjust_stock", {
        p_store: "store-1",
        p_product: "p1",
        p_variant: "v1",
        p_delta: -2,
        p_reason: "sale",
        p_note: "test",
        p_actor: "user-1",
      });
      expect(revalidateTag).toHaveBeenCalledWith(TAGS.products);
    });
  });

  describe("setStock", () => {
    it("fetches current stock and calls adjustStock with correct delta", async () => {
      // admin mock product_variants has stock: 5
      admin._tables.product_variants = makeChain(
        { data: { stock: 5 }, error: null },
        { data: [], error: null },
      );
      const res = await setStock("p1", "v1", 10);
      expect(res.success).toBe(true);

      expect(admin._tables.product_variants.select).toHaveBeenCalled();
      expect(admin.rpc).toHaveBeenCalledWith(
        "adjust_stock",
        expect.objectContaining({ p_delta: 5 }), // 10 - 5
      );
    });

    it("returns immediately if delta is 0", async () => {
      const res = await setStock("p1", "v1", 5); // current is 5
      expect(res.success).toBe(true);
      expect(res.newStock).toBe(5);
      expect(admin.rpc).not.toHaveBeenCalled();
    });
  });

  describe("bulkAdjust", () => {
    it("processes multiple items", async () => {
      const res = await bulkAdjust([
        { productId: "p1", delta: 10 },
        { productId: "p1", variantId: "v1", set: 10 },
      ]);
      expect(res.success).toBe(true);
      expect(admin.rpc).toHaveBeenCalledTimes(2);
    });
  });

  describe("getMovements", () => {
    it("rejects when not authenticated", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const res = await getMovements("p1");
      expect(res.error).toMatch(/not authenticated/i);
    });

    it("fetches paginated movements", async () => {
      supabase._tables.stock_movements = makeChain(
        { data: null, error: null },
        { data: [{ id: "m1" }], count: 1, error: null },
      );
      const res = await getMovements("p1", null, 1);
      expect(res.total).toBe(1);
      expect(res.movements).toHaveLength(1);

      expect(supabase._tables.stock_movements.eq).toHaveBeenCalledWith(
        "product_id",
        "p1",
      );
      expect(supabase._tables.stock_movements.is).toHaveBeenCalledWith(
        "variant_id",
        null,
      );
      expect(supabase._tables.stock_movements.range).toHaveBeenCalledWith(
        0,
        49,
      );
    });
  });
});
