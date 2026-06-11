import Link from "next/link";
import Image from "next/image";
import { effectivePricing, formatPrice } from "@/lib/pricing";

export interface RelatedProduct {
  id: string;
  name: string;
  slug: string;
  base_price: number;
  selling_price: number;
  image_url: string | null;
  featured: boolean;
  variants: { base_price: number; selling_price: number }[];
}

export function RelatedProducts({ products }: { products: RelatedProduct[] }) {
  if (!products || products.length === 0) return null;

  return (
    <section className="pdp-related">
      <h2 className="pdp-related-title">You may also like</h2>
      <div className="shop-grid">
        {products.map((p) => {
          const pr = effectivePricing(p);
          return (
            <Link
              key={p.id}
              href={`/pages/shop/${p.slug}`}
              className="shop-card"
            >
              <div className="shop-card-img">
                {p.image_url ? (
                  <Image
                    src={p.image_url}
                    alt={p.name}
                    fill
                    sizes="(max-width: 768px) 50vw, 240px"
                    className="shop-card-img-el"
                  />
                ) : (
                  <div className="shop-card-img-placeholder">🥛</div>
                )}
                {p.featured && (
                  <span className="shop-card-badge">Featured</span>
                )}
              </div>
              <div className="shop-card-body">
                <h3 className="shop-card-name">{p.name}</h3>
                <div className="shop-card-price">
                  {pr.hasVariants && (
                    <span className="shop-card-from">from </span>
                  )}
                  <span className="shop-card-sell">
                    {formatPrice(pr.selling)}
                  </span>
                  {pr.discount > 0 && (
                    <>
                      <span className="shop-card-base">
                        {formatPrice(pr.base)}
                      </span>
                      <span className="shop-card-off">{pr.discount}% off</span>
                    </>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
