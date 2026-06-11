"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { discountPercent, formatPrice } from "@/lib/pricing";
import { useCart } from "@/app/components/cart/CartProvider";
import { RelatedProducts, type RelatedProduct } from "./related-products";
import ReviewsSection, {
  RatingStars,
  type ProductReview,
} from "./reviews-section";

export interface DetailVariant {
  id: string;
  name: string;
  base_price: number;
  selling_price: number;
  stock: number;
  sku: string | null;
  images: string[] | null;
  sort_order: number;
}

export interface DetailProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  base_price: number;
  selling_price: number;
  image_url: string | null;
  images: string[];
  seo_title: string | null;
  seo_description: string | null;
  category: { id: string; name: string; slug: string; status: string } | null;
  variants: DetailVariant[];
}

// Effective selling price: fall back to base when no selling price is set.
function sellingOf(base: number, selling: number): number {
  return selling > 0 ? selling : base;
}

export default function ProductDetailClient({
  product,
  related,
  reviews,
}: {
  product: DetailProduct;
  related: RelatedProduct[];
  reviews: ProductReview[];
}) {
  const router = useRouter();
  const { addItem, openCart } = useCart();
  const hasVariants = product.variants.length > 0;
  const [variantId, setVariantId] = useState<string | null>(
    hasVariants ? product.variants[0].id : null,
  );
  const [quantity, setQuantity] = useState(1);
  const [zoomOpen, setZoomOpen] = useState(false);

  const selectedVariant = hasVariants
    ? (product.variants.find((v) => v.id === variantId) ?? product.variants[0])
    : null;

  // Product-level gallery (shared across variants).
  const productGallery = useMemo(() => {
    const all = [product.image_url, ...(product.images ?? [])].filter(
      (u): u is string => !!u,
    );
    return Array.from(new Set(all));
  }, [product.image_url, product.images]);

  // The gallery shown: the selected variant's OWN photos when it has any,
  // otherwise the shared product gallery.
  const variantImages = (selectedVariant?.images ?? []).filter(Boolean);
  const gallery =
    variantImages.length > 0 ? Array.from(new Set(variantImages)) : productGallery;

  // Default image: the first variant's first photo if it has one, else the
  // product gallery lead.
  const firstVariantImages = hasVariants
    ? (product.variants[0].images ?? []).filter(Boolean)
    : [];
  const [activeImg, setActiveImg] = useState<string | null>(
    firstVariantImages[0] ?? productGallery[0] ?? null,
  );

  // Picking a variant swaps the main image to that variant's first photo (or
  // back to the product gallery when the variant has none of its own).
  const selectVariant = (v: DetailVariant) => {
    setVariantId(v.id);
    const imgs = (v.images ?? []).filter(Boolean);
    setActiveImg(imgs[0] ?? productGallery[0] ?? null);
  };

  const base = selectedVariant
    ? selectedVariant.base_price
    : product.base_price;
  const selling = selectedVariant
    ? sellingOf(selectedVariant.base_price, selectedVariant.selling_price)
    : sellingOf(product.base_price, product.selling_price);
  const discount = discountPercent(base, selling);
  const outOfStock = selectedVariant ? selectedVariant.stock <= 0 : false;

  // Close the zoom overlay with Escape.
  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomOpen]);

  // Cap quantity at available stock when a variant tracks it, and clamp the
  // chosen quantity to it at render time (so switching variants can't leave a
  // stale over-stock value) — no effect needed.
  const maxQty =
    selectedVariant && selectedVariant.stock > 0 ? selectedVariant.stock : 99;
  const qty = Math.min(Math.max(1, quantity), maxQty);

  // Aggregate rating for the summary shown near the title.
  const reviewCount = reviews.length;
  const averageRating =
    reviewCount > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
      : 0;

  const addToCart = () => {
    addItem(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        variantId: selectedVariant?.id ?? null,
        variantName: selectedVariant?.name ?? null,
        price: selling,
        basePrice: base,
        image: activeImg ?? product.image_url ?? null,
      },
      qty,
    );
  };

  const handleAddToCart = () => {
    if (outOfStock) return;
    addToCart();
    openCart();
  };

  const handleBuyNow = () => {
    if (outOfStock) return;
    addToCart();
    router.push("/pages/cart");
  };

  return (
    <main className="shop-main">
      <nav className="shop-breadcrumb">
        <Link href="/pages/shop">Shop</Link>
        <span>/</span>
        {product.category && product.category.status === "active" ? (
          <>
            <span className="shop-breadcrumb-cat">{product.category.name}</span>
            <span>/</span>
          </>
        ) : null}
        <span className="shop-breadcrumb-current">{product.name}</span>
      </nav>

      <div className="pdp-grid">
        {/* Gallery */}
        <div className="pdp-gallery">
          <button
            type="button"
            className="pdp-main-img"
            onClick={() => activeImg && setZoomOpen(true)}
            aria-label="Zoom image"
          >
            {activeImg ? (
              <>
                <Image
                  src={activeImg}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 520px"
                  className="pdp-main-img-el"
                  priority
                />
                <span className="pdp-zoom-hint">🔍 Click to zoom</span>
              </>
            ) : (
              <div className="pdp-img-placeholder">🥛</div>
            )}
          </button>
          {gallery.length > 1 && (
            <div className="pdp-thumbs">
              {gallery.map((url) => (
                <button
                  key={url}
                  className={`pdp-thumb${activeImg === url ? " active" : ""}`}
                  onClick={() => setActiveImg(url)}
                  aria-label="View image"
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="72px"
                    className="pdp-thumb-el"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="pdp-info">
          {product.category && product.category.status === "active" && (
            <span className="pdp-category">{product.category.name}</span>
          )}
          <h1 className="pdp-name">{product.name}</h1>

          <a href="#reviews" className="pdp-rating-top">
            <RatingStars value={averageRating} size={16} />
            {reviewCount > 0 ? (
              <span className="pdp-rating-top-text">
                <strong>{averageRating.toFixed(1)}</strong> · {reviewCount}{" "}
                {reviewCount === 1 ? "review" : "reviews"}
              </span>
            ) : (
              <span className="pdp-rating-top-text">No reviews yet</span>
            )}
          </a>

          <div className="pdp-price">
            <span className="pdp-price-sell">{formatPrice(selling)}</span>
            {discount > 0 && (
              <>
                <span className="pdp-price-base">{formatPrice(base)}</span>
                <span className="pdp-price-off">{discount}% OFF</span>
              </>
            )}
          </div>

          {hasVariants && (
            <div className="pdp-variants">
              <label className="pdp-variants-label">Options</label>
              <div className="pdp-variant-options">
                {product.variants.map((v) => {
                  const disabled = v.stock <= 0;
                  return (
                    <button
                      key={v.id}
                      className={`pdp-variant${variantId === v.id ? " active" : ""}${
                        disabled ? " disabled" : ""
                      }`}
                      onClick={() => !disabled && selectVariant(v)}
                      disabled={disabled}
                    >
                      {v.name}
                      {disabled && (
                        <span className="pdp-variant-oos"> · sold out</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pdp-qty">
            <label className="pdp-qty-label">Quantity</label>
            <div className="pdp-stepper">
              <button
                type="button"
                className="pdp-stepper-btn"
                onClick={() => setQuantity(Math.max(1, qty - 1))}
                disabled={outOfStock || qty <= 1}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="pdp-stepper-value" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                className="pdp-stepper-btn"
                onClick={() => setQuantity(Math.min(maxQty, qty + 1))}
                disabled={outOfStock || qty >= maxQty}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>

          <div className="pdp-actions">
            <button
              className="pdp-btn pdp-btn-cart"
              onClick={handleAddToCart}
              disabled={outOfStock}
            >
              {outOfStock ? "Out of stock" : "Add to Cart"}
            </button>
            <button
              className="pdp-btn pdp-btn-buy"
              onClick={handleBuyNow}
              disabled={outOfStock}
            >
              Buy Now
            </button>
          </div>

          {product.description && (
            <div className="pdp-description">
              <h2>Description</h2>
              <p>{product.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Reviews */}
      <ReviewsSection
        productId={product.id}
        productSlug={product.slug}
        reviews={reviews}
      />

      {/* You may also like */}
      <RelatedProducts products={related} />

      {/* Zoom lightbox */}
      {zoomOpen && activeImg && (
        <div
          className="pdp-lightbox"
          onClick={() => setZoomOpen(false)}
          role="dialog"
          aria-label="Zoomed product image"
        >
          <button
            className="pdp-lightbox-close"
            onClick={() => setZoomOpen(false)}
            aria-label="Close"
          >
            ✕
          </button>
          <div
            className="pdp-lightbox-img-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={activeImg}
              alt={product.name}
              fill
              sizes="90vw"
              className="pdp-lightbox-img"
            />
          </div>
        </div>
      )}
    </main>
  );
}
