import Hero from "@/app/components/hero/Hero";
import { createClient } from "@/lib/supabase/server";
import {
  HomepageSectionRenderer,
  type ResolvedData,
} from "@/app/(storefront)/components/homepage/homepage-section-renderer";
import type { ShopCardProduct } from "@/app/(storefront)/components/shop-card";
import type { CategoryTile } from "@/app/(storefront)/components/homepage/shop-by-category-section";
import {
  clampLimit,
  type FeaturedProductsConfig,
  type HomepageSection,
  type ShopByCategoryConfig,
} from "@/lib/homepage/section-types";
import "@/app/(storefront)/pages/shop/shop.css"; // .shop-card styles for featured grid
import "@/app/(storefront)/components/homepage/homepage.css";

// Storefront reads are dynamic so dashboard edits (toggle/reorder/content)
// show up immediately, alongside revalidatePath("/") in the actions.
export const dynamic = "force-dynamic";

// A homepage product row: ShopCard's needs + category_id for category-mode
// filtering. Matches the shop page's product select shape.
type HomeProduct = ShopCardProduct & { category_id: string | null };

export default async function Home() {
  const supabase = await createClient();

  // Enabled sections in order. If the table is missing (migration not applied
  // yet) we just render the hero.
  const { data: sectionRows } = await supabase
    .from("homepage_sections")
    .select("*")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });

  const sections = (sectionRows ?? []) as HomepageSection[];

  if (sections.length === 0) {
    return (
      <main>
        <Hero />
      </main>
    );
  }

  // Does any section need products / categories? Fetch each set at most once.
  const needsProducts = sections.some((s) => s.type === "featured_products");
  const needsCategories = sections.some((s) => s.type === "shop_by_category");

  const [productsRes, categoriesRes] = await Promise.all([
    needsProducts
      ? supabase
          .from("products")
          .select(
            "id, name, slug, image_url, featured, base_price, selling_price, card_color, category_id, variants:product_variants(base_price, selling_price, special_price, sort_order)",
          )
          .eq("status", "published")
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as HomeProduct[] }),
    needsCategories
      ? supabase
          .from("categories")
          .select("id, name, slug, image_url")
          .eq("status", "active")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] as CategoryTile[] }),
  ]);

  const allProducts = (productsRes.data ?? []) as HomeProduct[];
  const allCategories = (categoriesRes.data ?? []) as CategoryTile[];
  const productById = new Map(allProducts.map((p) => [p.id, p]));
  const categoryById = new Map(allCategories.map((c) => [c.id, c]));

  // Resolve each section's data once.
  const productsBySection = new Map<string, ShopCardProduct[]>();
  const categoriesBySection = new Map<string, CategoryTile[]>();

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
    }
  }

  const resolved: ResolvedData = { productsBySection, categoriesBySection };

  return (
    <main>
      <Hero />
      <div className="home-sections">
        {sections.map((s) => (
          <HomepageSectionRenderer key={s.id} section={s} resolved={resolved} />
        ))}
      </div>
    </main>
  );
}
