import type { ShopCardProduct } from "../shop-card";
import { FeaturedProductsSection } from "./featured-products-section";
import {
  ShopByCategorySection,
  type CategoryTile,
} from "./shop-by-category-section";
import { PromoBannerSection } from "./promo-banner-section";
import type {
  FeaturedProductsConfig,
  HomepageSection,
  PromoBannerConfig,
  ShopByCategoryConfig,
} from "@/lib/homepage/section-types";

// Resolved data the renderer needs, keyed by section id. Built once in the
// homepage server component from batched queries (no per-section fetching).
export interface ResolvedData {
  productsBySection: Map<string, ShopCardProduct[]>;
  categoriesBySection: Map<string, CategoryTile[]>;
}

export function HomepageSectionRenderer({
  section,
  resolved,
}: {
  section: HomepageSection;
  resolved: ResolvedData;
}) {
  switch (section.type) {
    case "featured_products":
      return (
        <FeaturedProductsSection
          config={section.config as FeaturedProductsConfig}
          products={resolved.productsBySection.get(section.id) ?? []}
        />
      );
    case "shop_by_category":
      return (
        <ShopByCategorySection
          config={section.config as ShopByCategoryConfig}
          categories={resolved.categoriesBySection.get(section.id) ?? []}
        />
      );
    case "promo_banner":
      return (
        <PromoBannerSection config={section.config as PromoBannerConfig} />
      );
    default:
      return null;
  }
}
