import Link from "next/link";
import Image from "next/image";
import type { ShopByCategoryConfig } from "@/lib/homepage/section-types";

export interface CategoryTile {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
}

// Presentational: receives the resolved, ordered categories. Tiles link to the
// shop. Renders nothing when there are no categories.
export function ShopByCategorySection({
  config,
  categories,
}: {
  config: ShopByCategoryConfig;
  categories: CategoryTile[];
}) {
  if (categories.length === 0) return null;

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
      <div
        className={
          config.layout === "scroll" ? "home-cat-scroll" : "home-cat-grid"
        }
      >
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/pages/shop?category=${encodeURIComponent(c.slug)}`}
            className="home-cat-tile"
          >
            <div className="home-cat-img">
              {c.image_url ? (
                <Image
                  src={c.image_url}
                  alt={c.name}
                  fill
                  sizes="(max-width: 768px) 40vw, 200px"
                  className="home-cat-img-el"
                />
              ) : (
                <div className="home-cat-img-placeholder">🧺</div>
              )}
            </div>
            <span className="home-cat-name">{c.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
