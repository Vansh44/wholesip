"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { formatPrice } from "@/lib/pricing";
import { cartLineMax } from "@/lib/inventory/status";
import { useCart, lineKey } from "./CartProvider";
import CouponField from "./CouponField";
import styles from "./CartDrawer.module.css";

export default function CartDrawer() {
  const router = useRouter();
  const {
    items,
    hydrated,
    isCartOpen,
    closeCart,
    setQuantity,
    removeItem,
    subtotal,
    totalItems,
    appliedCoupon,
    couponValid,
    couponDiscount,
    total,
  } = useCart();

  // Lock body scroll + close on Escape while the drawer is open.
  useEffect(() => {
    if (!isCartOpen) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [isCartOpen, closeCart]);

  const goToCart = () => {
    closeCart();
    router.push("/cart");
  };

  const isEmpty = hydrated && items.length === 0;

  return (
    <div
      className={`${styles.overlay} ${isCartOpen ? styles.overlayVisible : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeCart();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Shopping cart"
      aria-hidden={!isCartOpen}
    >
      <aside className={styles.panel}>
        <header className={styles.header}>
          <h2 className={styles.title}>
            Your Cart
            {totalItems > 0 && (
              <span className={styles.count}>{totalItems}</span>
            )}
          </h2>
          <button
            className={styles.closeBtn}
            onClick={closeCart}
            aria-label="Close cart"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {isEmpty ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon} aria-hidden="true">
              🛒
            </div>
            <p className={styles.emptyText}>Your cart is empty</p>
            <button className={styles.emptyCta} onClick={closeCart}>
              Continue shopping
            </button>
          </div>
        ) : (
          <>
            <ul className={styles.items}>
              {items.map((item) => {
                const key = lineKey(item.productId, item.variantId);
                const max = cartLineMax(item);
                const atMax = item.quantity >= max;
                return (
                  <li key={key} className={styles.item}>
                    <Link
                      href={`/shop/${item.slug}`}
                      className={styles.itemImg}
                      onClick={closeCart}
                    >
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          sizes="72px"
                          className={styles.itemImgEl}
                        />
                      ) : (
                        <span className={styles.itemImgPlaceholder}>
                          <ImageIcon size={22} strokeWidth={1.5} aria-hidden />
                        </span>
                      )}
                    </Link>

                    <div className={styles.itemBody}>
                      <Link
                        href={`/shop/${item.slug}`}
                        className={styles.itemName}
                        onClick={closeCart}
                      >
                        {item.name}
                      </Link>
                      {item.variantName && (
                        <span className={styles.itemVariant}>
                          {item.variantName}
                        </span>
                      )}
                      <div className={styles.itemFooter}>
                        <div className={styles.stepper}>
                          <button
                            type="button"
                            className={styles.stepperBtn}
                            onClick={() => setQuantity(key, item.quantity - 1)}
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span className={styles.stepperValue}>
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            className={styles.stepperBtn}
                            onClick={() => setQuantity(key, item.quantity + 1)}
                            disabled={atMax}
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                        <span className={styles.itemPrice}>
                          {formatPrice(item.price * item.quantity)}
                        </span>
                      </div>
                      {atMax && (
                        <span className={styles.itemMax}>
                          Max available: {max}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      className={styles.itemRemove}
                      onClick={() => removeItem(key)}
                      aria-label={`Remove ${item.name}`}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>

            <footer className={styles.footer}>
              <div className={styles.couponWrap}>
                <CouponField />
              </div>

              <div className={styles.totalsRow}>
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {appliedCoupon && couponValid && couponDiscount > 0 && (
                <div className={`${styles.totalsRow} ${styles.discountRow}`}>
                  <span>Discount ({appliedCoupon.code})</span>
                  <span>−{formatPrice(couponDiscount)}</span>
                </div>
              )}
              <div className={styles.subtotalRow}>
                <span>Total</span>
                <span className={styles.subtotalValue}>
                  {formatPrice(total)}
                </span>
              </div>
              <p className={styles.shippingNote}>
                Shipping &amp; taxes calculated at checkout.
              </p>
              <div className={styles.actions}>
                <button className={styles.viewCartBtn} onClick={goToCart}>
                  View Cart
                </button>
                <button
                  className={styles.checkoutBtn}
                  onClick={() => {
                    closeCart();
                    router.push("/checkout");
                  }}
                >
                  Checkout
                </button>
              </div>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
