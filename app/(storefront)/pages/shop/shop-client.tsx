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
  card_color: string | null;
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

// Card background falls back to this when a product has no card_color set
// in the dashboard. (Per-product colour is the source of truth now.)
const DEFAULT_CARD_BG = "#f4f2ee";

// Repeating phrases for the scrolling promo ticker.
const TICKER_PHRASES = [
  "free shipping over ₹599",
  "real food, nothing stripped out",
  "all whole food",
  "the way Earth made it",
  "0g added sugar",
];

// One sequence: phrases repeated enough to fill wide screens. Two of these
// sit in the track; the CSS animation translates by -50% for a seamless loop.
function TickerSequence({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <div className="shop-ticker-seq" aria-hidden={ariaHidden || undefined}>
      {Array.from({ length: 3 }).flatMap((_, rep) =>
        TICKER_PHRASES.map((phrase, i) => (
          <span className="shop-ticker-item" key={`${rep}-${i}`}>
            {phrase}
          </span>
        )),
      )}
    </div>
  );
}

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
        {/* Promo ticker — continuous scrolling marquee */}
        <div className="shop-ticker">
          <div className="shop-ticker-track">
            <TickerSequence />
            <TickerSequence ariaHidden />
          </div>
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
                <>
                  <p className="shop-count">
                    Showing {filtered.length} of {products.length}{" "}
                    {products.length === 1 ? "product" : "products"}
                  </p>
                  <div className="shop-grid">
                    {filtered.map((p) => {
                      const pr = effectivePricing(p);
                      return (
                        <Link
                          key={p.id}
                          href={`/pages/shop/${p.slug}`}
                          className="shop-card"
                          style={
                            {
                              "--card-bg": p.card_color || DEFAULT_CARD_BG,
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
                              />
                            ) : (
                              <div className="shop-card-img-placeholder">
                                🥛
                              </div>
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
                </>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
