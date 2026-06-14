/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
}));

import {
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
} from "./coupon-actions";
import { createClient } from "@/lib/supabase/server";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { makeChain, makeSupabase } from "./_test-helpers";

const validForm = {
  code: "  save 10  ",
  description: "Ten percent off",
  discount_type: "percentage" as const,
  discount_value: 10,
  min_order_amount: 0,
  max_uses: 0,
  valid_from: "",
  valid_until: "",
  status: "active" as const,
};

// coupon-actions.ts covers admin CRUD and the storefront validation path.
// Code normalisation (uppercase, no whitespace) and date / usage / minimum
// checks live here.
describe("coupon-actions", () => {
  let supabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase({
      coupons: makeChain({ data: { id: "x" }, error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(supabase);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  describe("createCoupon", () => {
    // Auth gate.
    it("rejects when caller lacks marketing.manage", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await createCoupon(validForm);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Empty / whitespace-only code is rejected.
    it("rejects empty code", async () => {
      const result = await createCoupon({ ...validForm, code: "   " });
      expect(result.error).toMatch(/coupon code is required/i);
    });

    // discount_value must be > 0 — otherwise the coupon is useless.
    it("rejects non-positive discount value", async () => {
      const result = await createCoupon({ ...validForm, discount_value: 0 });
      expect(result.error).toMatch(/greater than 0/i);
    });

    // A percentage discount over 100 is nonsensical.
    it("rejects percentage discounts greater than 100", async () => {
      const result = await createCoupon({
        ...validForm,
        discount_type: "percentage",
        discount_value: 150,
      });
      expect(result.error).toMatch(/100%/);
    });

    // Date sanity check — valid_from after valid_until is invalid.
    it("rejects when valid_from is after valid_until", async () => {
      const result = await createCoupon({
        ...validForm,
        valid_from: "2026-12-01",
        valid_until: "2026-01-01",
      });
      expect(result.error).toMatch(/valid from/i);
    });

    // Normalisation: trimmed, uppercased, no internal whitespace.
    it("normalises the code (trim, uppercase, strip whitespace)", async () => {
      await createCoupon({ ...validForm, code: "  save 10  " });
      const inserted = supabase._tables.coupons.insert.mock.calls[0][0];
      expect(inserted.code).toBe("SAVE10");
    });

    // 23505 duplicate-key → friendly message instead of raw DB error.
    it("returns friendly error on unique-violation", async () => {
      supabase._tables.coupons = makeChain({
        data: null,
        error: { code: "23505", message: "dup" },
      });
      const result = await createCoupon(validForm);
      expect(result.error).toMatch(/already exists/i);
    });
  });

  describe("updateCoupon", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await updateCoupon("id", validForm);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Update payload also goes through validateForm → percentage > 100 rejected.
    it("validates form fields on update too", async () => {
      const result = await updateCoupon("id", {
        ...validForm,
        discount_type: "percentage",
        discount_value: 200,
      });
      expect(result.error).toMatch(/100%/);
    });
  });

  describe("deleteCoupon", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await deleteCoupon("id");
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Happy path — deletes the row by id.
    it("deletes the coupon by id", async () => {
      const result = await deleteCoupon("id");
      expect(result.success).toBe(true);
      expect(supabase._tables.coupons.delete).toHaveBeenCalled();
    });
  });

  // validateCoupon() — callable by anonymous shoppers. RLS hides DISABLED
  // coupons, so this layer adds date / usage / minimum-order checks and turns
  // them into specific user-facing messages.
  describe("validateCoupon", () => {
    // Empty code never gets a DB call.
    it("rejects empty code", async () => {
      const result = await validateCoupon("   ", 500);
      expect(result.error).toMatch(/enter a coupon/i);
    });

    // Code not found (or hidden by RLS because it's disabled).
    it("returns invalid when not found", async () => {
      supabase._tables.coupons = makeChain({ data: null, error: null });
      const result = await validateCoupon("NOPE", 500);
      expect(result.error).toMatch(/invalid or expired/i);
    });

    // valid_from in the future → not yet active.
    it("rejects when not yet active (valid_from in the future)", async () => {
      supabase._tables.coupons = makeChain({
        data: {
          code: "FUTURE",
          discount_type: "percentage",
          discount_value: 10,
          min_order_amount: 0,
          max_uses: 0,
          used_count: 0,
          valid_from: new Date(Date.now() + 86400_000).toISOString(),
          valid_until: null,
        },
        error: null,
      });
      const result = await validateCoupon("FUTURE", 500);
      expect(result.error).toMatch(/isn.?t active yet/i);
    });

    // valid_until already past → expired.
    it("rejects when expired", async () => {
      supabase._tables.coupons = makeChain({
        data: {
          code: "OLD",
          discount_type: "percentage",
          discount_value: 10,
          min_order_amount: 0,
          max_uses: 0,
          used_count: 0,
          valid_from: null,
          valid_until: new Date(Date.now() - 86400_000).toISOString(),
        },
        error: null,
      });
      const result = await validateCoupon("OLD", 500);
      expect(result.error).toMatch(/expired/i);
    });

    // Usage cap hit — surfaces the "limit reached" message.
    it("rejects when usage cap is reached", async () => {
      supabase._tables.coupons = makeChain({
        data: {
          code: "FULL",
          discount_type: "percentage",
          discount_value: 10,
          min_order_amount: 0,
          max_uses: 5,
          used_count: 5,
          valid_from: null,
          valid_until: null,
        },
        error: null,
      });
      const result = await validateCoupon("FULL", 500);
      expect(result.error).toMatch(/usage limit/i);
    });

    // Subtotal below minimum order → message includes the amount-to-add.
    it("rejects when subtotal is below the minimum order", async () => {
      supabase._tables.coupons = makeChain({
        data: {
          code: "BIG",
          discount_type: "fixed",
          discount_value: 100,
          min_order_amount: 1000,
          max_uses: 0,
          used_count: 0,
          valid_from: null,
          valid_until: null,
        },
        error: null,
      });
      const result = await validateCoupon("BIG", 500);
      expect(result.error).toMatch(/Add ₹500 more/i);
    });

    // Happy path — returns the rule fields so the cart can recompute the
    // discount locally as quantities change.
    it("returns the applied coupon rule on success", async () => {
      supabase._tables.coupons = makeChain({
        data: {
          code: "SAVE10",
          discount_type: "percentage",
          discount_value: 10,
          min_order_amount: 0,
          max_uses: 0,
          used_count: 0,
          valid_from: null,
          valid_until: null,
        },
        error: null,
      });
      const result = await validateCoupon("save10", 1000);
      expect(result.coupon).toEqual({
        code: "SAVE10",
        discountType: "percentage",
        discountValue: 10,
        minOrderAmount: 0,
      });
    });
  });
});
