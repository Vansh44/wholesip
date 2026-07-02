import type { ShopCardProduct } from "../shop-card";
import { FeaturedProductsSection } from "./featured-products-section";
import {
  ShopByCategorySection,
  type CategoryTile,
} from "./shop-by-category-section";
import { PromoBannerSection } from "./promo-banner-section";
import { LatestBlogsSection, type BlogCardData } from "./latest-blogs-section";
import { RichTextSection } from "../sections/rich-text-section";
import { CustomCodeSection } from "../sections/custom-code-section";
import type {
  AnySectionConfig,
  CustomCodeConfig,
  FeaturedProductsConfig,
  HomepageSectionType,
  LatestBlogsConfig,
  PromoBannerConfig,
  RichTextConfig,
  ShopByCategoryConfig,
} from "@/lib/homepage/section-types";

// The minimal shape the renderer needs — satisfied by both homepage_sections
// rows (HomepageSection) and store_pages section items (PageSectionItem).
export interface RenderableSection {
  id: string;
  type: HomepageSectionType;
  config: AnySectionConfig;
}

// Resolved data the renderer needs, keyed by section id. Built once per page
// via lib/sections/resolve-data.ts from batched queries (no per-section
// fetching).
export interface ResolvedData {
  productsBySection: Map<string, ShopCardProduct[]>;
  categoriesBySection: Map<string, CategoryTile[]>;
  blogsBySection: Map<string, BlogCardData[]>;
}

export function HomepageSectionRenderer({
  section,
  resolved,
}: {
  section: RenderableSection;
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
    case "latest_blogs":
      return (
        <LatestBlogsSection
          config={section.config as LatestBlogsConfig}
          blogs={resolved.blogsBySection.get(section.id) ?? []}
        />
      );
    case "rich_text":
      return <RichTextSection config={section.config as RichTextConfig} />;
    case "custom_code":
      return <CustomCodeSection config={section.config as CustomCodeConfig} />;
    default:
      return null;
  }
}
