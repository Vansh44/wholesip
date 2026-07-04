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
import { HeroSection } from "../sections/hero-section";
import { UspBarSection } from "../sections/usp-bar-section";
import { TileGridSection } from "../sections/tile-grid-section";
import { FaqAccordionSection } from "../sections/faq-accordion-section";
import type {
  AnySectionConfig,
  CustomCodeConfig,
  FaqAccordionConfig,
  FeaturedProductsConfig,
  HeroConfig,
  HomepageSectionType,
  LatestBlogsConfig,
  PromoBannerConfig,
  RichTextConfig,
  SectionStyle,
  ShopByCategoryConfig,
  TileGridConfig,
  UspBarConfig,
} from "@/lib/homepage/section-types";

// The minimal shape the renderer needs — satisfied by both homepage_sections
// rows (HomepageSection) and store_pages section items (PageSectionItem).
export interface RenderableSection {
  id: string;
  type: HomepageSectionType;
  config: AnySectionConfig;
  /** Shared appearance applied by SectionShell (absent on pre-style rows). */
  style?: SectionStyle;
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
  const shell = { sectionId: section.id, style: section.style };
  switch (section.type) {
    case "hero":
      return <HeroSection {...shell} config={section.config as HeroConfig} />;
    case "usp_bar":
      return (
        <UspBarSection {...shell} config={section.config as UspBarConfig} />
      );
    case "tile_grid":
      return (
        <TileGridSection {...shell} config={section.config as TileGridConfig} />
      );
    case "faq_accordion":
      return (
        <FaqAccordionSection
          {...shell}
          config={section.config as FaqAccordionConfig}
        />
      );
    case "featured_products":
      return (
        <FeaturedProductsSection
          {...shell}
          config={section.config as FeaturedProductsConfig}
          products={resolved.productsBySection.get(section.id) ?? []}
        />
      );
    case "shop_by_category":
      return (
        <ShopByCategorySection
          {...shell}
          config={section.config as ShopByCategoryConfig}
          categories={resolved.categoriesBySection.get(section.id) ?? []}
        />
      );
    case "promo_banner":
      return (
        <PromoBannerSection
          {...shell}
          config={section.config as PromoBannerConfig}
        />
      );
    case "latest_blogs":
      return (
        <LatestBlogsSection
          {...shell}
          config={section.config as LatestBlogsConfig}
          blogs={resolved.blogsBySection.get(section.id) ?? []}
        />
      );
    case "rich_text":
      return (
        <RichTextSection {...shell} config={section.config as RichTextConfig} />
      );
    case "custom_code":
      return (
        <CustomCodeSection
          {...shell}
          config={section.config as CustomCodeConfig}
        />
      );
    default:
      return null;
  }
}
