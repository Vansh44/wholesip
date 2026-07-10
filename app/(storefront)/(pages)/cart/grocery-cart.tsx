"use client";

import Link from "next/link";
import Image from "next/image";
import { ImageIcon } from "lucide-react";

import { formatPrice } from "@/lib/pricing";
import { cartLineMax } from "@/lib/inventory/status";
import {
  useCart,
  lineKey,
  type CartItem,
} from "@/app/(storefront)/components/cart/CartProvider";
import CouponField from "@/app/(storefront)/components/cart/CouponField";

// Flat grocery-style delivery model (presentational — checkout is deferred).
const DELIVERY_FEE = 29;
const FREE_DELIVERY_OVER = 499;

// The Basket (grocery) cart — a distinct premium layout used ONLY when the
// store's theme sets layout.storefront = "grocery". Entirely separate
// `gcart-*` markup from the classic cart, so the WholeSip cart is untouched.
export function GroceryCart() {
  const {
    items,
    hydrated,
    setQuantity,
    removeItem,
    subtotal,
    totalItems,
    appliedCoupon,
    couponValid,
    couponDiscount,
    total,
  } = useCart();

  if (!hydrated) {
    return (
      <main className="cart-main gcart-main">
        <div className="gcart-loading">Loading your basket…</div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="cart-main gcart-main">
        <div className="gcart-empty">
          <div className="gcart-empty-icon" aria-hidden="true">
            <ImageIcon size={40} strokeWidth={1.5} />
          </div>
          <h1 className="gcart-empty-title">Your basket is empty</h1>
          <p className="gcart-empty-sub">
            Add some fresh picks and they&apos;ll show up here.
          </p>
          <Link href="/shop" className="gcart-empty-cta">
            Start shopping
          </Link>
        </div>
      </main>
    );
  }

  // MRP savings (off list price) + any coupon, shown as one informational line.
  const mrpSavings = items.reduce(
    (sum, i) => sum + Math.max(0, i.basePrice - i.price) * i.quantity,
    0,
  );
  const couponSavings = appliedCoupon && couponValid ? couponDiscount : 0;
  const savings = mrpSavings + couponSavings;
  const freeDelivery = subtotal >= FREE_DELIVERY_OVER;
  const delivery = freeDelivery ? 0 : DELIVERY_FEE;
  const grandTotal = total + delivery;

  return (
    <main className="cart-main gcart-main">
      <nav className="gcart-breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <span className="gcart-breadcrumb-current">Cart</span>
      </nav>

      <h1 className="gcart-title">Your basket</h1>
      <p className="gcart-subtitle">
        {totalItems} {totalItems === 1 ? "item" : "items"} · added fresh today
      </p>

      <div className="gcart-layout">
        <ul className="gcart-items">
          {items.map((item) => {
            const key = lineKey(item.productId, item.variantId);
            return (
              <GroceryCartLine
                key={key}
                item={item}
                onDec={() => setQuantity(key, item.quantity - 1)}
                onInc={() => setQuantity(key, item.quantity + 1)}
                onRemove={() => removeItem(key)}
              />
            );
          })}
        </ul>

        <aside className="gcart-summary">
          <h2 className="gcart-summary-title">Order summary</h2>
          <div className="gcart-summary-row">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <div className="gcart-summary-row">
            <span>Delivery</span>
            <span>
              {freeDelivery ? (
                <span className="gcart-free">Free</span>
              ) : (
                formatPrice(delivery)
              )}
            </span>
          </div>
          {savings > 0 && (
            <div className="gcart-summary-row gcart-savings">
              <span>Savings</span>
              <span>− {formatPrice(savings)}</span>
            </div>
          )}

          <div className="gcart-coupon">
            <CouponField />
          </div>

          <div className="gcart-summary-divider" />
          <div className="gcart-summary-row gcart-summary-total">
            <span>Total</span>
            <span>{formatPrice(grandTotal)}</span>
          </div>
          <p className="gcart-tax-note">Taxes calculated at checkout.</p>

          <Link
            href="/checkout"
            className="gcart-checkout-btn block text-center"
          >
            Proceed to checkout
          </Link>
          <Link href="/shop" className="gcart-continue">
            ← Continue shopping
          </Link>
        </aside>
      </div>
    </main>
  );
}

function GroceryCartLine({
  item,
  onDec,
  onInc,
  onRemove,
}: {
  item: CartItem;
  onDec: () => void;
  onInc: () => void;
  onRemove: () => void;
}) {
  const lineTotal = item.price * item.quantity;
  const subtitle = item.category || item.variantName;
  const max = cartLineMax(item);
  const atMax = item.quantity >= max;

  return (
    <li className="gcart-item">
      <Link href={`/shop/${item.slug}`} className="gcart-item-img">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="88px"
            className="gcart-item-img-el"
          />
        ) : (
          <span className="gcart-item-img-ph">
            <ImageIcon size={22} strokeWidth={1.5} aria-hidden />
          </span>
        )}
      </Link>

      <div className="gcart-item-main">
        <Link href={`/shop/${item.slug}`} className="gcart-item-name">
          {item.name}
        </Link>
        {subtitle && <span className="gcart-item-sub">{subtitle}</span>}
        <button
          type="button"
          className="gcart-item-remove"
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
        >
          Remove
        </button>
        {atMax && <span className="gcart-item-max">Max available: {max}</span>}
      </div>

      <div className="gcart-stepper" aria-label="Quantity">
        <button type="button" onClick={onDec} aria-label="Decrease quantity">
          −
        </button>
        <span>{item.quantity}</span>
        <button
          type="button"
          onClick={onInc}
          disabled={atMax}
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>

      <span className="gcart-item-total">{formatPrice(lineTotal)}</span>
    </li>
  );
}
