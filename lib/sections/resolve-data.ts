import {
  getPublishedProducts,
  getActiveCategories,
  getPublishedBlogCards,
} from "@/lib/storefront/queries";
import { getStoreSetting } from "@/lib/settings/resolve";
import {
  mapSectionData,
  type SectionDatasets,
  type SectionProduct,
} from "@/lib/sections/map-data";
import type {
  RenderableSection,
  ResolvedData,
} from "@/app/(storefront)/components/homepage/homepage-section-renderer";
import type { CategoryTile } from "@/app/(storefront)/components/homepage/shop-by-category-section";
import type { BlogCardData } from "@/app/(storefront)/components/homepage/latest-blogs-section";

/**
 * Fetch the datasets the given sections need, each at most once (all reads
 * are cached via lib/storefront/queries). Pass `all: true` to fetch every
 * dataset regardless of the sections — the builder's draft canvas needs the
 * full snapshots so client-side re-resolution never lacks data (e.g. when a
 * data-driven section is added mid-session).
 */
export async function fetchSectionDatasets(
  sections: RenderableSection[],
  storeId: string,
  { all = false }: { all?: boolean } = {},
): Promise<SectionDatasets> {
  const needsProducts =
    all || sections.some((s) => s.type === "featured_products");
  const needsCategories =
    all || sections.some((s) => s.type === "shop_by_category");
  const needsBlogs = all || sections.some((s) => s.type === "latest_blogs");

  const [productsRes, categoriesRes, blogsRes] = await Promise.all([
    needsProducts ? getPublishedProducts(storeId) : Promise.resolve([]),
    needsCategories ? getActiveCategories(storeId) : Promise.resolve([]),
    needsBlogs ? getPublishedBlogCards(storeId) : Promise.resolve([]),
  ]);

  return {
    products: productsRes as unknown as SectionProduct[],
    categories: categoriesRes as unknown as CategoryTile[],
    blogs: blogsRes as unknown as BlogCardData[],
  };
}

/**
 * Resolve the data every section in a page needs, in one pass: fetch each
 * dataset at most once, then compute the per-section rows (the pure half
 * lives in lib/sections/map-data.ts, shared with the builder's client-side
 * draft canvas). Shared by the homepage, custom pages ([pageSlug]) and the
 * builder's draft preview.
 */
export async function resolveSectionData(
  sections: RenderableSection[],
  storeId: string,
): Promise<ResolvedData> {
  const [datasets, lowStockThreshold] = await Promise.all([
    fetchSectionDatasets(sections, storeId),
    getStoreSetting("inventory.lowStockThreshold"),
  ]);
  return mapSectionData(sections, datasets, lowStockThreshold as number);
}
