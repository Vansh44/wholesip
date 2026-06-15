"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useCart } from "./CartProvider";
import { formatPrice } from "@/lib/pricing";
import styles from "./CouponField.module.css";

// Apply / remove a coupon. Shared by the cart page and the cart drawer so the
// behaviour and look stay identical in both places.
export default function CouponField() {
  const {
    appliedCoupon,
    couponValid,
    couponDiscount,
    applyCoupon,
    removeCoupon,
  } = useCart();
  const [code, setCode] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleApply = () => {
    const value = code.trim();
    if (!value) return;
    startTransition(async () => {
      const { error } = await applyCoupon(value);
      if (error) {
        toast.error(error);
      } else {
        toast.success("Coupon applied");
        setCode("");
      }
    });
  };

  if (appliedCoupon) {
    return (
      <div className={styles.applied}>
        <div className={styles.appliedMain}>
          <span className={styles.tag}>🏷</span>
          <div className={styles.appliedText}>
            <span className={styles.code}>{appliedCoupon.code}</span>
            <span className={styles.note}>
              {couponValid
                ? `You save ${formatPrice(couponDiscount)}`
                : `Add ${formatPrice(appliedCoupon.minOrderAmount)} min order to use this`}
            </span>
          </div>
          <button
            type="button"
            className={styles.remove}
            onClick={removeCoupon}
            aria-label="Remove coupon"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.row}>
      <input
        className={styles.input}
        type="text"
        placeholder="Coupon code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === "Enter" && handleApply()}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        className={styles.applyBtn}
        onClick={handleApply}
        disabled={isPending || !code.trim()}
      >
        {isPending ? "…" : "Apply"}
      </button>
    </div>
  );
}
