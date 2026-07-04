import Link from "next/link";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { effectivePricing, formatPrice, type PricedLike } from "@/lib/pricing";
import { QuickAddButton } from "./quick-add-button";

// Card background falls back to this when a product has no card_color set.
// (Per-product colour is the source of truth.)
export const DEFAULT_CARD_BG = "#f4f2ee";

// The data a card needs: display fields + whatever effectivePricing reads.
export type ShopCardProduct = PricedLike & {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  featured?: boolean;
  card_color?: string | null;
  /** Resolved category name; shown as an eyebrow label when present. */
  category?: string | null;
};

// Single source of truth for the storefront product card — used by the shop
// grid and the homepage "featured products" section so styling stays in sync.
export function ShopCard({ product: p }: { product: ShopCardProduct }) {
  const pr = effectivePricing(p);
  return (
    <Link
      href={`/shop/${p.slug}`}
      className="shop-card"
      style={
        { "--card-bg": p.card_color || DEFAULT_CARD_BG } as React.CSSProperties
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
            <ImageIcon size={28} strokeWidth={1.5} aria-hidden />
          </div>
        )}
      </div>
      <div className="shop-card-body">
        {p.category && <span className="shop-card-cat">{p.category}</span>}
        <h3 className="shop-card-name">{p.name}</h3>
        <div className="shop-card-price">
          {pr.hasVariants && <span className="shop-card-from">from </span>}
          <span className="shop-card-sell">{formatPrice(pr.selling)}</span>
          {pr.discount > 0 && (
            <>
              <span className="shop-card-base">{formatPrice(pr.base)}</span>
              <span className="shop-card-off">{pr.discount}% off</span>
            </>
          )}
          {/* Hidden unless the theme opts into quick-add (.sm-card-quickadd). */}
          <QuickAddButton product={p} />
        </div>
      </div>
    </Link>
  );
}
