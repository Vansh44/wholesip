import { describe, expect, it } from "vitest";
import { mapSectionData, type SectionDatasets } from "./map-data";
import type { RenderableSection } from "@/app/(storefront)/components/homepage/homepage-section-renderer";
import type {
  FeaturedProductsConfig,
  LatestBlogsConfig,
  ShopByCategoryConfig,
} from "@/lib/homepage/section-types";

// The pure half of section-data resolution — shared by the server render and
// the builder's client-side draft canvas, so its behavior IS the preview's
// fidelity contract. Mirrors the semantics resolveSectionData always had.

const product = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    name: `P${id}`,
    category_id: null,
    featured: false,
    ...extra,
  }) as unknown as SectionDatasets["products"][number];

const category = (id: string) =>
  ({ id, name: `C${id}` }) as unknown as SectionDatasets["categories"][number];

const blog = (id: string, featured = false) =>
  ({ id, featured }) as unknown as SectionDatasets["blogs"][number];

const section = (
  id: string,
  type: RenderableSection["type"],
  config: unknown,
): RenderableSection => ({
  id,
  type,
  config: config as RenderableSection["config"],
});

const datasets: SectionDatasets = {
  products: [
    product("p1", { featured: true, category_id: "c1" }),
    product("p2", { category_id: "c1" }),
    product("p3", { featured: true, category_id: "c2" }),
  ],
  categories: [category("c1"), category("c2")],
  blogs: [blog("b1", true), blog("b2"), blog("b3", true)],
};

describe("mapSectionData", () => {
  it("resolves manual featured_products in admin order, skipping missing ids", () => {
    const cfg: Partial<FeaturedProductsConfig> = {
      source: "manual",
      product_ids: ["p3", "gone", "p1"],
    };
    const out = mapSectionData(
      [section("s1", "featured_products", cfg)],
      datasets,
    );
    expect(out.productsBySection.get("s1")?.map((p) => p.id)).toEqual([
      "p3",
      "p1",
    ]);
  });

  it("filters featured_products by category with the limit applied", () => {
    const cfg: Partial<FeaturedProductsConfig> = {
      source: "category",
      category_id: "c1",
      limit: 1,
    };
    const out = mapSectionData(
      [section("s1", "featured_products", cfg)],
      datasets,
    );
    expect(out.productsBySection.get("s1")?.map((p) => p.id)).toEqual(["p1"]);
  });

  it("falls back to flagged products for the featured source", () => {
    const cfg: Partial<FeaturedProductsConfig> = {
      source: "featured",
      limit: 8,
    };
    const out = mapSectionData(
      [section("s1", "featured_products", cfg)],
      datasets,
    );
    expect(out.productsBySection.get("s1")?.map((p) => p.id)).toEqual([
      "p1",
      "p3",
    ]);
  });

  it("resolves shop_by_category: selected ids in order, or all categories", () => {
    const selected: Partial<ShopByCategoryConfig> = {
      source: "selected",
      category_ids: ["c2", "missing", "c1"],
    };
    const all: Partial<ShopByCategoryConfig> = { source: "all" };
    const out = mapSectionData(
      [
        section("sel", "shop_by_category", selected),
        section("all", "shop_by_category", all),
      ],
      datasets,
    );
    expect(out.categoriesBySection.get("sel")?.map((c) => c.id)).toEqual([
      "c2",
      "c1",
    ]);
    expect(out.categoriesBySection.get("all")?.map((c) => c.id)).toEqual([
      "c1",
      "c2",
    ]);
  });

  it("resolves latest_blogs for manual, featured and latest sources", () => {
    const out = mapSectionData(
      [
        section("m", "latest_blogs", {
          source: "manual",
          blog_ids: ["b2", "nope", "b1"],
        } satisfies Partial<LatestBlogsConfig>),
        section("f", "latest_blogs", { source: "featured", limit: 8 }),
        section("l", "latest_blogs", { source: "latest", limit: 2 }),
      ],
      datasets,
    );
    expect(out.blogsBySection.get("m")?.map((b) => b.id)).toEqual(["b2", "b1"]);
    expect(out.blogsBySection.get("f")?.map((b) => b.id)).toEqual(["b1", "b3"]);
    expect(out.blogsBySection.get("l")?.map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("ignores sections that need no data resolution", () => {
    const out = mapSectionData(
      [section("h", "hero", {}), section("r", "rich_text", {})],
      datasets,
    );
    expect(out.productsBySection.size).toBe(0);
    expect(out.categoriesBySection.size).toBe(0);
    expect(out.blogsBySection.size).toBe(0);
  });
});
