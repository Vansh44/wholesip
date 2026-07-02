import {
  getPublishedProducts,
  getActiveCategories,
  getPublishedBlogCards,
} from "@/lib/storefront/queries";
import {
  clampLimit,
  type FeaturedProductsConfig,
  type LatestBlogsConfig,
  type ShopByCategoryConfig,
} from "@/lib/homepage/section-types";
import type {
  RenderableSection,
  ResolvedData,
} from "@/app/(storefront)/components/homepage/homepage-section-renderer";
import type { ShopCardProduct } from "@/app/(storefront)/components/shop-card";
import type { CategoryTile } from "@/app/(storefront)/components/homepage/shop-by-category-section";
import type { BlogCardData } from "@/app/(storefront)/components/homepage/latest-blogs-section";

// A product row for section resolution: ShopCard's needs + category_id for
// category-mode filtering. Matches the shop page's product select shape.
type SectionProduct = ShopCardProduct & { category_id: string | null };

/**
 * Resolve the data every section in a page needs, in one pass: fetch each
 * dataset at most once (all reads are cached via lib/storefront/queries), then
 * compute the per-section rows. Shared by the homepage, custom pages
 * ([pageSlug]) and the builder's draft preview — extracted verbatim from the
 * original app/(storefront)/page.tsx implementation.
 */
export async function resolveSectionData(
  sections: RenderableSection[],
  storeId: string,
): Promise<ResolvedData> {
  // Which datasets are needed? Fetch each at most once (and each is cached).
  const needsProducts = sections.some((s) => s.type === "featured_products");
  const needsCategories = sections.some((s) => s.type === "shop_by_category");
  const needsBlogs = sections.some((s) => s.type === "latest_blogs");

  const [productsRes, categoriesRes, blogsRes] = await Promise.all([
    needsProducts ? getPublishedProducts(storeId) : Promise.resolve([]),
    needsCategories ? getActiveCategories(storeId) : Promise.resolve([]),
    needsBlogs ? getPublishedBlogCards(storeId) : Promise.resolve([]),
  ]);

  const allProducts = productsRes as unknown as SectionProduct[];
  const allCategories = categoriesRes as unknown as CategoryTile[];
  const allBlogs = blogsRes as unknown as BlogCardData[];
  const productById = new Map(allProducts.map((p) => [p.id, p]));
  const categoryById = new Map(allCategories.map((c) => [c.id, c]));
  const blogById = new Map(allBlogs.map((b) => [b.id, b]));

  const productsBySection = new Map<string, ShopCardProduct[]>();
  const categoriesBySection = new Map<string, CategoryTile[]>();
  const blogsBySection = new Map<string, BlogCardData[]>();

  for (const s of sections) {
    if (s.type === "featured_products") {
      const c = s.config as FeaturedProductsConfig;
      let rows: SectionProduct[];
      if (c.source === "manual") {
        // Preserve the admin-specified order; skip missing/unpublished ids.
        rows = c.product_ids
          .map((id) => productById.get(id))
          .filter((p): p is SectionProduct => !!p);
      } else if (c.source === "category") {
        rows = allProducts
          .filter((p) => p.category_id === c.category_id)
          .slice(0, clampLimit(c.limit));
      } else {
        rows = allProducts
          .filter((p) => p.featured)
          .slice(0, clampLimit(c.limit));
      }
      productsBySection.set(s.id, rows);
    } else if (s.type === "shop_by_category") {
      const c = s.config as ShopByCategoryConfig;
      const rows =
        c.source === "selected"
          ? c.category_ids
              .map((id) => categoryById.get(id))
              .filter((x): x is CategoryTile => !!x)
          : allCategories;
      categoriesBySection.set(s.id, rows);
    } else if (s.type === "latest_blogs") {
      const c = s.config as LatestBlogsConfig;
      let rows: BlogCardData[];
      if (c.source === "manual") {
        rows = c.blog_ids
          .map((id) => blogById.get(id))
          .filter((x): x is BlogCardData => !!x);
      } else {
        // "featured" narrows to flagged posts first; "latest" uses all
        // (already newest-first). Both then cap to the limit.
        const pool =
          c.source === "featured"
            ? allBlogs.filter((b) => b.featured)
            : allBlogs;
        rows = pool.slice(0, clampLimit(c.limit));
      }
      blogsBySection.set(s.id, rows);
    }
  }

  return { productsBySection, categoriesBySection, blogsBySection };
}
