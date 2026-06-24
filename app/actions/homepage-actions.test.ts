/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
}));
vi.mock("@/lib/supabase/storage-cleanup", () => ({
  deleteStorageUrls: vi.fn().mockResolvedValue(undefined),
}));

import {
  createSection,
  updateSection,
  deleteSection,
  toggleSection,
  reorderSections,
} from "./homepage-actions";
import { validateConfig } from "@/lib/homepage/section-types";
import { createClient } from "@/lib/supabase/server";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { deleteStorageUrls } from "@/lib/supabase/storage-cleanup";
import { makeChain, makeSupabase } from "./_test-helpers";

// homepage-actions.ts powers the composable homepage builder. The pure
// validateConfig helper is tested standalone; the CRUD/reorder/toggle actions
// are tested with mocked Supabase, mirroring category-actions.test.ts.
describe("validateConfig", () => {
  // Unknown section types are rejected outright.
  it("rejects an unknown type", () => {
    const r = validateConfig("nope" as any, {});
    expect("error" in r && r.error).toMatch(/unknown section type/i);
  });

  describe("featured_products", () => {
    // Default source is "featured"; limit clamps into 1..12.
    it("normalises featured source and clamps limit", () => {
      const r = validateConfig("featured_products", {
        heading: "  Bestsellers  ",
        source: "featured",
        limit: 999,
      });
      expect("config" in r).toBe(true);
      const c = (r as any).config;
      expect(c.heading).toBe("Bestsellers");
      expect(c.source).toBe("featured");
      expect(c.limit).toBe(12); // clamped from 999
      expect(c.product_ids).toEqual([]);
      expect(c.category_id).toBeNull();
    });

    // Manual mode requires at least one product id.
    it("rejects manual mode with no products", () => {
      const r = validateConfig("featured_products", {
        source: "manual",
        product_ids: [],
      });
      expect("error" in r && r.error).toMatch(/at least one product/i);
    });

    // Manual mode keeps the (ordered) product_ids and drops category_id.
    it("keeps ordered product_ids in manual mode", () => {
      const r = validateConfig("featured_products", {
        source: "manual",
        product_ids: ["p2", "p1", "p3"],
        category_id: "should-be-dropped",
      });
      const c = (r as any).config;
      expect(c.product_ids).toEqual(["p2", "p1", "p3"]);
      expect(c.category_id).toBeNull();
    });

    // Category mode requires a category id.
    it("rejects category mode with no category", () => {
      const r = validateConfig("featured_products", { source: "category" });
      expect("error" in r && r.error).toMatch(/choose a category/i);
    });
  });

  describe("shop_by_category", () => {
    // Default source "all" with grid layout.
    it("defaults to all + grid", () => {
      const r = validateConfig("shop_by_category", { heading: "Shop" });
      const c = (r as any).config;
      expect(c.source).toBe("all");
      expect(c.layout).toBe("grid");
      expect(c.category_ids).toEqual([]);
    });

    // Selected mode requires at least one category id.
    it("rejects selected mode with no categories", () => {
      const r = validateConfig("shop_by_category", {
        source: "selected",
        category_ids: [],
      });
      expect("error" in r && r.error).toMatch(/at least one category/i);
    });

    // Unknown layout falls back to grid.
    it("falls back to grid for an unknown layout", () => {
      const r = validateConfig("shop_by_category", {
        source: "all",
        layout: "carousel-3d",
      });
      expect((r as any).config.layout).toBe("grid");
    });
  });

  describe("promo_banner", () => {
    // A banner needs at least an image or a heading.
    it("rejects an empty banner", () => {
      const r = validateConfig("promo_banner", {});
      expect("error" in r && r.error).toMatch(/image or a heading/i);
    });

    // Valid banner normalises alignment/theme and trims text.
    it("normalises alignment, theme and trims text", () => {
      const r = validateConfig("promo_banner", {
        image_url: "https://x/object/public/media/b.png",
        heading: "  Sale  ",
        alignment: "weird",
        theme: "dark",
      });
      const c = (r as any).config;
      expect(c.heading).toBe("Sale");
      expect(c.alignment).toBe("left"); // unknown → left
      expect(c.theme).toBe("dark");
    });

    // CTA hrefs with dangerous schemes are stripped (XSS defence).
    it("strips dangerous cta_href schemes", () => {
      const r = validateConfig("promo_banner", {
        heading: "Hi",
        cta_label: "Click",
        cta_href: "javascript:alert(1)",
      });
      expect((r as any).config.cta_href).toBe("");
    });

    // Normal links are preserved.
    it("keeps a normal cta_href", () => {
      const r = validateConfig("promo_banner", {
        heading: "Hi",
        cta_href: "/shop",
      });
      expect((r as any).config.cta_href).toBe("/shop");
    });
  });

  describe("latest_blogs", () => {
    // Default source "latest" with a clamped limit; blog_ids dropped.
    it("defaults to latest and clamps limit", () => {
      const r = validateConfig("latest_blogs", {
        heading: "  Journal  ",
        source: "latest",
        limit: 99,
        blog_ids: ["x"],
      });
      const c = (r as any).config;
      expect(c.heading).toBe("Journal");
      expect(c.source).toBe("latest");
      expect(c.limit).toBe(12); // clamped
      expect(c.blog_ids).toEqual([]); // dropped in latest mode
    });

    // Manual mode requires at least one blog id.
    it("rejects manual mode with no posts", () => {
      const r = validateConfig("latest_blogs", {
        source: "manual",
        blog_ids: [],
      });
      expect("error" in r && r.error).toMatch(/at least one blog/i);
    });

    // Manual mode keeps the ordered ids.
    it("keeps ordered blog_ids in manual mode", () => {
      const r = validateConfig("latest_blogs", {
        source: "manual",
        blog_ids: ["b3", "b1"],
      });
      expect((r as any).config.blog_ids).toEqual(["b3", "b1"]);
    });
  });
});

describe("homepage CRUD actions", () => {
  let supabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase({
      homepage_sections: makeChain({ data: { id: "s1" }, error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(supabase);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  describe("createSection", () => {
    // Auth gate — homepage.manage required.
    it("rejects when caller lacks homepage.manage", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await createSection("promo_banner", { heading: "x" });
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Invalid config short-circuits before any insert.
    it("rejects invalid config", async () => {
      const result = await createSection("featured_products", {
        source: "manual",
        product_ids: [],
      });
      expect(result.error).toMatch(/at least one product/i);
    });

    // Happy path — appends after the current max sort_order and inserts the
    // normalised config.
    it("inserts at the next sort_order with normalised config", async () => {
      // The max-order lookup (.maybeSingle) returns the current highest.
      supabase._tables.homepage_sections = makeChain({
        data: { sort_order: 4, id: "s1" },
        error: null,
      });
      await createSection("featured_products", {
        heading: "Bestsellers",
        source: "featured",
        limit: 6,
      });
      const insert = supabase._tables.homepage_sections.insert.mock.calls[0][0];
      expect(insert.type).toBe("featured_products");
      expect(insert.sort_order).toBe(5); // 4 + 1
      expect(insert.enabled).toBe(true);
      expect(insert.config.limit).toBe(6);
    });

    // First section on an empty table starts at sort_order 0.
    it("starts at sort_order 0 when the table is empty", async () => {
      supabase._tables.homepage_sections = makeChain({
        data: null, // no existing rows
        error: null,
      });
      await createSection("promo_banner", { heading: "Hi" });
      const insert = supabase._tables.homepage_sections.insert.mock.calls[0][0];
      expect(insert.sort_order).toBe(0);
    });
  });

  describe("updateSection", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await updateSection("s1", { heading: "x" });
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Missing row surfaces a clear error.
    it("returns not found when the row is missing", async () => {
      supabase._tables.homepage_sections = makeChain({
        data: null,
        error: null,
      });
      const result = await updateSection("missing", { heading: "x" });
      expect(result.error).toMatch(/not found/i);
    });

    // type is read from the existing row (immutable) and used to validate the
    // new config — and a replaced banner image is purged from storage.
    it("purges the old banner image when it changes", async () => {
      const oldUrl = "https://x/object/public/media/old.png";
      const newUrl = "https://x/object/public/media/new.png";
      supabase._tables.homepage_sections = makeChain({
        data: { type: "promo_banner", config: { image_url: oldUrl } },
        error: null,
      });
      await updateSection("s1", { heading: "Hi", image_url: newUrl });
      expect(deleteStorageUrls).toHaveBeenCalledWith([oldUrl]);
    });

    // Unchanged image → no storage deletion.
    it("does not purge when the banner image is unchanged", async () => {
      const url = "https://x/object/public/media/same.png";
      supabase._tables.homepage_sections = makeChain({
        data: { type: "promo_banner", config: { image_url: url } },
        error: null,
      });
      await updateSection("s1", { heading: "Hi", image_url: url });
      expect(deleteStorageUrls).not.toHaveBeenCalled();
    });
  });

  describe("deleteSection", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await deleteSection("s1");
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Deleting a promo banner cleans up its image.
    it("purges the banner image after delete", async () => {
      const url = "https://x/object/public/media/b.png";
      supabase._tables.homepage_sections = makeChain({
        data: { type: "promo_banner", config: { image_url: url } },
        error: null,
      });
      const result = await deleteSection("s1");
      expect(result.success).toBe(true);
      expect(deleteStorageUrls).toHaveBeenCalledWith([url]);
    });

    // Deleting a non-banner section touches no storage.
    it("does not touch storage for non-banner sections", async () => {
      supabase._tables.homepage_sections = makeChain({
        data: { type: "featured_products", config: {} },
        error: null,
      });
      await deleteSection("s1");
      expect(deleteStorageUrls).not.toHaveBeenCalled();
    });
  });

  describe("toggleSection", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await toggleSection("s1", false);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Happy path — writes the enabled flag.
    it("updates the enabled flag", async () => {
      const result = await toggleSection("s1", false);
      expect(result.success).toBe(true);
      const updateArg =
        supabase._tables.homepage_sections.update.mock.calls[0][0];
      expect(updateArg.enabled).toBe(false);
    });
  });

  describe("reorderSections", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await reorderSections(["a", "b"]);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Each id is written with sort_order = its index.
    it("writes sort_order by array index", async () => {
      const result = await reorderSections(["a", "b", "c"]);
      expect(result.success).toBe(true);
      const calls = supabase._tables.homepage_sections.update.mock.calls;
      expect(calls.map((c: any) => c[0].sort_order)).toEqual([0, 1, 2]);
    });
  });
});
