import { ShopCard, type ShopCardProduct } from "../shop-card";
import type { FeaturedProductsConfig } from "@/lib/homepage/section-types";

// Presentational: receives already-resolved product rows (resolution + the
// Supabase query happen once in the homepage server component). Renders
// nothing when there are no products so we never show an empty heading.
export function FeaturedProductsSection({
  config,
  products,
}: {
  config: FeaturedProductsConfig;
  products: ShopCardProduct[];
}) {
  if (products.length === 0) return null;

  return (
    <section className="home-section">
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
      <div className="home-product-grid">
        {products.map((p) => (
          <ShopCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
