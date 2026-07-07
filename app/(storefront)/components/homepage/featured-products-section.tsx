import { ShopCard, type ShopCardProduct } from "../shop-card";
import type {
  FeaturedProductsConfig,
  SectionStyle,
} from "@/lib/homepage/section-types";
import { SectionShell } from "../sections/section-shell";
import { HorizontalCarousel } from "./horizontal-carousel";

// Presentational: receives already-resolved product rows (resolution + the
// Supabase query happen once in the homepage server component). Renders
// nothing when there are no products so we never show an empty heading.
export function FeaturedProductsSection({
  sectionId,
  style,
  config,
  products,
  storeLowStockThreshold = 0,
}: {
  sectionId: string;
  style?: SectionStyle;
  config: FeaturedProductsConfig;
  products: ShopCardProduct[];
  storeLowStockThreshold?: number;
}) {
  if (products.length === 0) return null;

  return (
    <SectionShell sectionId={sectionId} style={style}>
      {(config.heading || config.subheading) && (
        <div className="home-section-head">
          {config.heading && (
            <h2 className="home-section-title">{config.heading}</h2>
          )}
          {config.subheading && (
            <p className="home-section-sub">{config.subheading}</p>
          )}
        </div>
      )}
      <HorizontalCarousel
        carouselClass="home-product-carousel"
        scrollClass="home-product-scroll"
        arrowClass="home-product-arrow"
      >
        {products.map((p) => (
          <ShopCard
            key={p.id}
            product={p}
            storeLowStockThreshold={storeLowStockThreshold}
          />
        ))}
      </HorizontalCarousel>
    </SectionShell>
  );
}
