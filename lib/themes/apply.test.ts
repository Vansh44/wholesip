/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { makeChain, makeSupabase } from "@/app/actions/_test-helpers";
import { applyTheme } from "./apply";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function makeAdmin(storeSettings: Record<string, unknown> = {}) {
  const admin = makeSupabase({
    stores: makeChain({ data: { settings: storeSettings }, error: null }),
    categories: makeChain({
      data: { id: "cat-1", slug: "pantry" },
      error: null,
    }),
    products: makeChain({ data: { id: "prod-1" }, error: null }),
    product_variants: makeChain(),
    store_menus: makeChain(),
    store_pages: makeChain(),
  });
  return admin;
}

describe("applyTheme", () => {
  let admin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    admin = makeAdmin({ brand: { name: "My Shop" } });
    vi.mocked(createAdminClient).mockReturnValue(admin);
  });

  it("merges settings without clobbering the merchant's brand name", async () => {
    await applyTheme("store-1", "basket", { publish: true });
    const update = admin._tables.stores.update.mock.calls[0][0];
    expect(update.settings.template).toBe("basket");
    expect(update.settings.brand.name).toBe("My Shop"); // preserved
    expect(update.settings.brand.primaryColor).toBe("#ef5a2a"); // themed
  });

  it("publishes pages with regenerated UUID section ids", async () => {
    const r = await applyTheme("store-1", "basket", { publish: true });
    expect(r.success, r.errors.join(" | ")).toBe(true);

    const pageUpserts = admin._tables.store_pages.upsert.mock.calls.map(
      (c: any[]) => c[0],
    );
    // Basket seeds 4 pages incl. the homepage sentinel.
    expect(pageUpserts.map((p: any) => p.slug).sort()).toEqual([
      "",
      "delivery-returns",
      "faqs",
      "our-story",
    ]);
    for (const p of pageUpserts) {
      expect(p.status).toBe("published");
      expect(p.published_sections).toEqual(p.sections);
      for (const s of p.sections) expect(s.id).toMatch(UUID_RE);
    }
  });

  it("seeds products with variants scoped to the store", async () => {
    await applyTheme("store-1", "basket", { publish: true });
    const productUpserts = admin._tables.products.upsert.mock.calls;
    expect(productUpserts.length).toBe(13); // basket sample products
    expect(productUpserts[0][0].store_id).toBe("store-1");
    expect(productUpserts[0][0].status).toBe("published");

    const variantInserts = admin._tables.product_variants.insert.mock.calls;
    expect(variantInserts.length).toBeGreaterThan(0);
    expect(variantInserts[0][0][0]).toMatchObject({
      store_id: "store-1",
      product_id: "prod-1",
    });
  });

  it("refuses reset on a non-demo store", async () => {
    const r = await applyTheme("store-1", "basket", {
      publish: true,
      reset: true,
    });
    expect(r.success).toBe(false);
    expect(r.errors[0]).toMatch(/not a demo store/i);
    // Nothing was deleted.
    expect(admin._tables.products.delete).not.toHaveBeenCalled();
  });

  it("resets a demo store before applying", async () => {
    admin = makeAdmin({ demo: true, brand: { name: "Basket Demo" } });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const r = await applyTheme("store-1", "basket", {
      publish: true,
      reset: true,
    });
    expect(r.success, r.errors.join(" | ")).toBe(true);
    for (const table of [
      "products",
      "categories",
      "store_pages",
      "store_menus",
    ]) {
      expect(admin._tables[table].delete, table).toHaveBeenCalled();
    }
  });

  it("accumulates errors without aborting (best-effort)", async () => {
    admin._tables.store_menus = makeChain(
      { data: null, error: null },
      { data: null, error: { message: "menus down" } },
    );
    const r = await applyTheme("store-1", "basket", { publish: true });
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.includes("menus down"))).toBe(true);
    // Pages were still seeded despite the menus failure.
    expect(admin._tables.store_pages.upsert).toHaveBeenCalled();
  });
});
