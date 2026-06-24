import Hero from "@/app/(storefront)/components/hero/Hero";
import StructuredData from "@/app/(storefront)/components/structured-data";
import {
  getEnabledHomepageSections,
  getPublishedProducts,
  getActiveCategories,
  getPublishedBlogCards,
} from "@/lib/storefront/queries";
import {
  HomepageSectionRenderer,
  type ResolvedData,
} from "@/app/(storefront)/components/homepage/homepage-section-renderer";
import type { ShopCardProduct } from "@/app/(storefront)/components/shop-card";
import type { CategoryTile } from "@/app/(storefront)/components/homepage/shop-by-category-section";
import type { BlogCardData } from "@/app/(storefront)/components/homepage/latest-blogs-section";
import {
  clampLimit,
  type FeaturedProductsConfig,
  type HomepageSection,
  type LatestBlogsConfig,
  type ShopByCategoryConfig,
} from "@/lib/homepage/section-types";
import "@/app/(storefront)/pages/shop/shop.css"; // .shop-card styles for featured grid
import "@/app/(storefront)/components/homepage/homepage.css";

// Storefront reads run through `unstable_cache` (lib/storefront/queries) so the
// homepage no longer hits the DB on every visit. ISR-revalidate as a freshness
// fallback; dashboard edits invalidate the cache instantly via revalidateTag /
// revalidatePath("/") in the actions.
export const revalidate = 300;

export const metadata = {
  title: "Soakd | The Way Earth Made It",
  description:
    "Soakd — zero preservatives, 100% real ingredients. The way Earth made it.",
  alternates: { canonical: "/" },
};

// A homepage product row: ShopCard's needs + category_id for category-mode
// filtering. Matches the shop page's product select shape.
type HomeProduct = ShopCardProduct & { category_id: string | null };

export default async function Home() {
  // Enabled sections in order. If the table is missing (migration not applied
  // yet) we just render the hero.
  const sections = (await getEnabledHomepageSections()) as HomepageSection[];

  if (sections.length === 0) {
    return (
      <main>
        <StructuredData />
        <Hero />
      </main>
    );
  }

  // Which datasets are needed? Fetch each at most once (and each is cached).
  const needsProducts = sections.some((s) => s.type === "featured_products");
  const needsCategories = sections.some((s) => s.type === "shop_by_category");
  const needsBlogs = sections.some((s) => s.type === "latest_blogs");

  const [productsRes, categoriesRes, blogsRes] = await Promise.all([
    needsProducts ? getPublishedProducts() : Promise.resolve([]),
    needsCategories ? getActiveCategories() : Promise.resolve([]),
    needsBlogs ? getPublishedBlogCards() : Promise.resolve([]),
  ]);

  const allProducts = productsRes as unknown as HomeProduct[];
  const allCategories = categoriesRes as unknown as CategoryTile[];
  const allBlogs = blogsRes as unknown as BlogCardData[];
  const productById = new Map(allProducts.map((p) => [p.id, p]));
  const categoryById = new Map(allCategories.map((c) => [c.id, c]));
  const blogById = new Map(allBlogs.map((b) => [b.id, b]));

  // Resolve each section's data once.
  const productsBySection = new Map<string, ShopCardProduct[]>();
  const categoriesBySection = new Map<string, CategoryTile[]>();
  const blogsBySection = new Map<string, BlogCardData[]>();

  for (const s of sections) {
    if (s.type === "featured_products") {
      const c = s.config as FeaturedProductsConfig;
      let rows: HomeProduct[];
      if (c.source === "manual") {
        // Preserve the admin-specified order; skip missing/unpublished ids.
        rows = c.product_ids
          .map((id) => productById.get(id))
          .filter((p): p is HomeProduct => !!p);
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
      const rows =
        c.source === "manual"
          ? c.blog_ids
              .map((id) => blogById.get(id))
              .filter((x): x is BlogCardData => !!x)
          : allBlogs.slice(0, clampLimit(c.limit));
      blogsBySection.set(s.id, rows);
    }
  }

  const resolved: ResolvedData = {
    productsBySection,
    categoriesBySection,
    blogsBySection,
  };

  return (
    <main>
      <StructuredData />
      <Hero />
      <div className="home-sections">
        {sections.map((s) => (
          <HomepageSectionRenderer key={s.id} section={s} resolved={resolved} />
        ))}
      </div>
    </main>
  );
}
