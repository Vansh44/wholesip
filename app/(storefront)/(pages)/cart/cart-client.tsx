"use client";

import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { formatPrice, discountPercent } from "@/lib/pricing";
import {
  useCart,
  lineKey,
  type CartItem,
} from "@/app/(storefront)/components/cart/CartProvider";
import CouponField from "@/app/(storefront)/components/cart/CouponField";

export default function CartClient() {
  const {
    items,
    hydrated,
    setQuantity,
    removeItem,
    clear,
    subtotal,
    totalItems,
    appliedCoupon,
    couponValid,
    couponDiscount,
    total,
  } = useCart();

  // Avoid a flash of "empty" before localStorage is read on the client.
  if (!hydrated) {
    return (
      <main className="cart-main">
        <div className="cart-loading">Loading your cart…</div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="cart-main">
        <div className="cart-empty">
          <div className="cart-empty-icon" aria-hidden="true">
            🛒
          </div>
          <h1 className="cart-empty-title">Your cart is empty</h1>
          <p className="cart-empty-sub">
            Looks like you haven&apos;t added anything yet.
          </p>
          <Link href="/(pages)/shop" className="cart-empty-cta">
            Continue shopping
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="cart-main">
      <div className="cart-head">
        <h1 className="cart-title">Shopping Cart</h1>
        <span className="cart-count">
          {totalItems} {totalItems === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="cart-layout">
        {/* Line items */}
        <ul className="cart-items">
          {items.map((item) => {
            const key = lineKey(item.productId, item.variantId);
            return (
              <CartLine
                key={key}
                item={item}
                onDec={() => setQuantity(key, item.quantity - 1)}
                onInc={() => setQuantity(key, item.quantity + 1)}
                onRemove={() => removeItem(key)}
              />
            );
          })}
        </ul>

        {/* Summary */}
        <aside className="cart-summary">
          <h2 className="cart-summary-title">Order Summary</h2>
          <div className="cart-summary-row">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {appliedCoupon && couponValid && couponDiscount > 0 && (
            <div className="cart-summary-row cart-summary-discount">
              <span>Discount ({appliedCoupon.code})</span>
              <span>−{formatPrice(couponDiscount)}</span>
            </div>
          )}
          <div className="cart-summary-row cart-summary-muted">
            <span>Shipping</span>
            <span>Calculated at checkout</span>
          </div>

          {/* Coupon */}
          <div className="cart-coupon">
            <CouponField />
          </div>

          <div className="cart-summary-divider" />
          <div className="cart-summary-row cart-summary-total">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
          <button
            className="cart-checkout-btn"
            onClick={() => toast.info("Checkout is coming soon!")}
          >
            Proceed to Checkout
          </button>
          <Link href="/(pages)/shop" className="cart-continue-link">
            Continue shopping
          </Link>
          <button className="cart-clear-btn" onClick={clear}>
            Clear cart
          </button>
        </aside>
      </div>
    </main>
  );
}

function CartLine({
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
  const discount = discountPercent(item.basePrice, item.price);
  const lineTotal = item.price * item.quantity;

  return (
    <li className="cart-item">
      <Link href={`/(pages)/shop/${item.slug}`} className="cart-item-img">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="96px"
            className="cart-item-img-el"
          />
        ) : (
          <span className="cart-item-img-placeholder">🥛</span>
        )}
      </Link>

      <div className="cart-item-body">
        <div className="cart-item-info">
          <Link href={`/(pages)/shop/${item.slug}`} className="cart-item-name">
            {item.name}
          </Link>
          {item.variantName && (
            <span className="cart-item-variant">{item.variantName}</span>
          )}
          <div className="cart-item-price">
            <span className="cart-item-price-sell">
              {formatPrice(item.price)}
            </span>
            {discount > 0 && (
              <span className="cart-item-price-base">
                {formatPrice(item.basePrice)}
              </span>
            )}
          </div>
        </div>

        <div className="cart-item-controls">
          <div className="cart-stepper">
            <button
              type="button"
              className="cart-stepper-btn"
              onClick={onDec}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="cart-stepper-value">{item.quantity}</span>
            <button
              type="button"
              className="cart-stepper-btn"
              onClick={onInc}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <span className="cart-item-line-total">{formatPrice(lineTotal)}</span>
          <button
            type="button"
            className="cart-item-remove"
            onClick={onRemove}
            aria-label={`Remove ${item.name}`}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}
