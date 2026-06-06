"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { effectivePricing, formatPrice } from "@/lib/pricing";

export interface ShopProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  base_price: number;
  selling_price: number;
  image_url: string | null;
  featured: boolean;
  sort_order: number;
  variants: { base_price: number; selling_price: number }[];
}

export interface ShopCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}

type Props = {
  products: ShopProduct[];
  categories: ShopCategory[];
};

export default function ShopClient({ products, categories }: Props) {
  const [active, setActive] = useState<string>("all");

  const filtered = useMemo(() => {
    if (active === "all") return products;
    if (active === "uncategorized")
      return products.filter((p) => !p.category_id);
    return products.filter((p) => p.category_id === active);
  }, [products, active]);

  const hasUncategorized = products.some((p) => !p.category_id);

  return (
    <main className="shop-main">
      <section className="shop-hero">
        <span className="shop-kicker">The Soakd Store</span>
        <h1 className="shop-title">Shop All Products</h1>
        <p className="shop-subtitle">
          Wholesome, real-food products crafted with care.
        </p>
      </section>

      {products.length === 0 ? (
        <div className="shop-empty">
          <div className="shop-empty-emoji">🛒</div>
          <h2>No products yet</h2>
          <p>Check back soon — we&rsquo;re stocking the shelves.</p>
        </div>
      ) : (
        <>
          {/* Category filters */}
          <div className="shop-filters">
            <button
              className={`shop-chip${active === "all" ? " active" : ""}`}
              onClick={() => setActive("all")}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                className={`shop-chip${active === c.id ? " active" : ""}`}
                onClick={() => setActive(c.id)}
              >
                {c.name}
              </button>
            ))}
            {hasUncategorized && (
              <button
                className={`shop-chip${active === "uncategorized" ? " active" : ""}`}
                onClick={() => setActive("uncategorized")}
              >
                Other
              </button>
            )}
          </div>

          {/* Product grid */}
          {filtered.length === 0 ? (
            <div className="shop-empty">
              <p>No products in this category yet.</p>
            </div>
          ) : (
            <div className="shop-grid">
              {filtered.map((p) => (
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
                        sizes="(max-width: 768px) 50vw, 280px"
                        className="shop-card-img-el"
                        unoptimized
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
                    {p.description && (
                      <p className="shop-card-desc">{p.description}</p>
                    )}
                    {(() => {
                      const pr = effectivePricing(p);
                      return (
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
                              <span className="shop-card-off">
                                {pr.discount}% off
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
