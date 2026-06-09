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

// Soft pastel card tiles cycled across the grid — clean colour pops on the
// white canvas (deliberately NOT the old beige/tan tones).
const TONES = [
  { bg: "#f4dfe0", accent: "#9c5c5c" }, // blush rose
  { bg: "#dce6f1", accent: "#566f8c" }, // sky blue
  { bg: "#dcebde", accent: "#557a5e" }, // mint green
  { bg: "#f3e9c8", accent: "#897330" }, // soft butter
] as const;

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
    <main className="shop-main shop-listing">
      <div className="shop-panel">
        {/* Promo ticker */}
        <div className="shop-ticker">
          <span>✦ free shipping over ₹599</span>
          <span className="shop-ticker-mid">
            ✦ real food, nothing stripped out ✦
          </span>
          <span>all whole food ◎</span>
        </div>

        <div className="shop-panel-body">
          {/* Hero: kicker + big lowercase headline + sticky note */}
          <section className="shop-hero">
            <span className="shop-kicker">the soakd store</span>
            <div className="shop-hero-row">
              <h1 className="shop-title">
                the whole shelf
                <br />
                {/* shelf */}
              </h1>
              <div className="shop-note">
                100% whole food
                <br />
                nothing synthetic
              </div>
            </div>
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
                  {filtered.map((p, i) => {
                    const tone = TONES[i % TONES.length];
                    const pr = effectivePricing(p);
                    return (
                      <Link
                        key={p.id}
                        href={`/pages/shop/${p.slug}`}
                        className="shop-card"
                        style={
                          {
                            "--card-bg": tone.bg,
                            "--card-accent": tone.accent,
                          } as React.CSSProperties
                        }
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
                            <span className="shop-card-badge">fave</span>
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
                                <span className="shop-card-off">
                                  {pr.discount}% off
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
