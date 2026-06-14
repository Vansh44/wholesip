/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
}));
vi.mock("@/lib/supabase/storage-cleanup", () => ({
  deleteStorageUrls: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("fs/promises", () => {
  const readFile = vi.fn().mockResolvedValue("");
  return { readFile, default: { readFile } };
});

import {
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductPublish,
  generateProductDescription,
} from "./product-actions";
import { createClient } from "@/lib/supabase/server";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { deleteStorageUrls } from "@/lib/supabase/storage-cleanup";
import { readFile } from "fs/promises";
import { makeChain, makeSupabase } from "./_test-helpers";

const validForm = {
  name: "Almonds",
  slug: "",
  description: "Crunchy snack",
  category_id: "cat-1",
  base_price: 500,
  selling_price: 400,
  image_url: "https://x.com/object/public/media/img.png",
  images: [],
  status: "draft" as const,
  featured: false,
  sort_order: 0,
  card_color: "#fff",
  seo_title: "Almonds — Soakd",
  seo_description: "Real, raw almonds.",
  variants: [],
};

// product-actions.ts is the catalog's biggest action file. Tests cover
// validation, slug collision retries, variant replacement, storage cleanup,
// publish toggling, and the Gemini-backed AI description endpoint.
describe("product-actions", () => {
  let supabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase({
      products: makeChain({ data: { id: "p1", slug: "almonds" }, error: null }),
      product_variants: makeChain({ data: null, error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(supabase);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  describe("createProduct", () => {
    // Auth gate — products.manage permission required.
    it("rejects when caller lacks products.manage", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await createProduct(validForm);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Required-field validation — verifies each required field individually so
    // a regression to the validator surfaces clearly.
    it("requires name", async () => {
      const result = await createProduct({ ...validForm, name: " " });
      expect(result.error).toMatch(/name is required/i);
    });

    it("requires a category", async () => {
      const result = await createProduct({ ...validForm, category_id: null });
      expect(result.error).toMatch(/category is required/i);
    });

    it("requires a description", async () => {
      const result = await createProduct({ ...validForm, description: " " });
      expect(result.error).toMatch(/description is required/i);
    });

    it("requires both SEO fields", async () => {
      expect(
        (await createProduct({ ...validForm, seo_title: " " })).error,
      ).toMatch(/SEO/);
      expect(
        (await createProduct({ ...validForm, seo_description: " " })).error,
      ).toMatch(/SEO/);
    });

    // Publishing now stamps published_at; drafts leave it null.
    it("sets published_at when status is published", async () => {
      await createProduct({ ...validForm, status: "published" });
      const insert = supabase._tables.products.insert.mock.calls[0][0];
      expect(insert.published_at).not.toBeNull();
    });

    it("leaves published_at null when status is draft", async () => {
      await createProduct({ ...validForm, status: "draft" });
      const insert = supabase._tables.products.insert.mock.calls[0][0];
      expect(insert.published_at).toBeNull();
    });

    // Pricing normalisation: when selling > base, selling is clamped to base.
    it("clamps selling_price so it never exceeds base_price", async () => {
      await createProduct({
        ...validForm,
        base_price: 100,
        selling_price: 200,
      });
      const insert = supabase._tables.products.insert.mock.calls[0][0];
      expect(insert.selling_price).toBe(100);
    });

    // Variant insertion path — verifies the second .from() call hits the
    // variants table after the product row succeeds.
    it("inserts variants after product is created", async () => {
      await createProduct({
        ...validForm,
        variants: [
          {
            name: "Small",
            base_price: 100,
            selling_price: 80,
            special_price: null,
            stock: 10,
            sku: "SM",
            images: [],
          },
        ],
      });
      // product_variants.delete was called (to clear), then insert.
      expect(supabase._tables.product_variants.delete).toHaveBeenCalled();
      expect(supabase._tables.product_variants.insert).toHaveBeenCalled();
    });

    // Variants without a name are filtered out — they're rows the user added
    // but never filled in.
    it("filters out variants with empty names", async () => {
      await createProduct({
        ...validForm,
        variants: [
          {
            name: "",
            base_price: 100,
            selling_price: 80,
            special_price: null,
            stock: 1,
            sku: "",
            images: [],
          },
          {
            name: "Medium",
            base_price: 100,
            selling_price: 80,
            special_price: null,
            stock: 1,
            sku: "",
            images: [],
          },
        ],
      });
      const inserted =
        supabase._tables.product_variants.insert.mock.calls[0][0];
      expect(inserted).toHaveLength(1);
      expect(inserted[0].name).toBe("Medium");
    });

    // sanitizeVariants persists special_price when set, and clamps against
    // base_price so a typo of "1000" on a ₹100 item still saves as ₹100.
    it("persists special_price and clamps it to base_price", async () => {
      await createProduct({
        ...validForm,
        variants: [
          {
            name: "500ml",
            base_price: 100,
            selling_price: 80,
            // intentionally above base — must clamp.
            special_price: 1000,
            stock: 1,
            sku: "",
            images: [],
          },
        ],
      });
      const inserted =
        supabase._tables.product_variants.insert.mock.calls[0][0];
      expect(inserted[0].special_price).toBe(100);
    });

    // special_price null / 0 means "no sale" — must persist as NULL, not 0,
    // so the storefront's `hasSpecialPrice` check stays accurate.
    it("stores null when special_price is 0 or null", async () => {
      await createProduct({
        ...validForm,
        variants: [
          {
            name: "A",
            base_price: 100,
            selling_price: 80,
            special_price: 0,
            stock: 1,
            sku: "",
            images: [],
          },
          {
            name: "B",
            base_price: 100,
            selling_price: 80,
            special_price: null,
            stock: 1,
            sku: "",
            images: [],
          },
        ],
      });
      const inserted =
        supabase._tables.product_variants.insert.mock.calls[0][0];
      expect(inserted[0].special_price).toBeNull();
      expect(inserted[1].special_price).toBeNull();
    });
  });

  describe("updateProduct", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await updateProduct("p1", validForm);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // published_at is preserved on re-save of a published product (so the
    // original publish timestamp doesn't get reset to "now" on every edit).
    it("preserves existing published_at on update", async () => {
      const original = "2025-01-01T00:00:00.000Z";
      // Two product reads happen (slug lookup returns [], single returns the
      // existing row). makeChain returns the same shape for both — that's
      // fine because slug lookup ignores published_at.
      supabase._tables.products = makeChain({
        data: { published_at: original },
        error: null,
      });
      await updateProduct("p1", { ...validForm, status: "published" });
      const updateArg = supabase._tables.products.update.mock.calls[0][0];
      expect(updateArg.published_at).toBe(original);
    });
  });

  describe("deleteProduct", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await deleteProduct("p1");
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Storage cleanup is fire-and-forget — verifies it's called with the
    // image URLs gathered before the delete.
    it("purges referenced image files after deleting the row", async () => {
      const url = "https://x.com/object/public/media/p.png";
      supabase._tables.products = makeChain({
        data: { image_url: url, images: [] },
        error: null,
      });
      supabase._tables.product_variants = makeChain({
        data: [],
        error: null,
      });
      const result = await deleteProduct("p1");
      expect(result.success).toBe(true);
      expect(deleteStorageUrls).toHaveBeenCalled();
      const arg = (deleteStorageUrls as any).mock.calls[0][0];
      expect(arg).toContain(url);
    });
  });

  describe("toggleProductPublish", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await toggleProductPublish("p1", true);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Publishing flips status + sets published_at.
    it("publishes (status=published, sets published_at)", async () => {
      await toggleProductPublish("p1", true);
      const updateArg = supabase._tables.products.update.mock.calls[0][0];
      expect(updateArg.status).toBe("published");
      expect(updateArg.published_at).not.toBeNull();
    });

    // Unpublishing clears published_at — keeps the published_at semantically
    // "last time we went live".
    it("unpublishes (status=draft, clears published_at)", async () => {
      await toggleProductPublish("p1", false);
      const updateArg = supabase._tables.products.update.mock.calls[0][0];
      expect(updateArg.status).toBe("draft");
      expect(updateArg.published_at).toBeNull();
    });
  });

  // The AI description endpoint — verifies the input guards, brand-file
  // requirement, and that an empty form name short-circuits.
  describe("generateProductDescription", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await generateProductDescription({ name: "x" });
      expect(result.error).toMatch(/not authenticated/i);
    });

    // The model needs a name to anchor the copy — bail before any work.
    it("rejects when product name is missing", async () => {
      const result = await generateProductDescription({ name: "  " });
      expect(result.error).toMatch(/product name/i);
    });

    // Without brand/brand.md the prompt has no voice — the action refuses
    // rather than calling Gemini with an empty system instruction.
    it("rejects when brand/brand.md is missing or empty", async () => {
      vi.mocked(readFile).mockResolvedValue("");
      const result = await generateProductDescription({ name: "Almonds" });
      expect(result.error).toMatch(/brand\.md/i);
    });
  });
});
