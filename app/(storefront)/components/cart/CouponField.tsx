"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { useCart } from "./CartProvider";
import { formatPrice } from "@/lib/pricing";
import {
  getAvailableStorefrontCoupons,
  type AvailableCoupon,
} from "@/app/actions/coupon-actions";
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
  const [availableCoupons, setAvailableCoupons] = useState<AvailableCoupon[]>(
    [],
  );

  useEffect(() => {
    getAvailableStorefrontCoupons()
      .then(setAvailableCoupons)
      .catch(console.error);
  }, []);

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
    <div>
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

      {availableCoupons.length > 0 && (
        <div className={styles.availableCoupons}>
          <p className={styles.availableTitle}>Available Coupons</p>
          <ul className={styles.availableList}>
            {availableCoupons.map((c) => (
              <li key={c.code} className={styles.availableItem}>
                <div className={styles.availableInfo}>
                  <span className={styles.availableCode}>{c.code}</span>
                  {c.description && (
                    <span className={styles.availableDesc}>
                      {c.description}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.availableApplyBtn}
                  onClick={() => {
                    setCode(c.code);
                    startTransition(async () => {
                      const { error } = await applyCoupon(c.code);
                      if (error) {
                        toast.error(error);
                      } else {
                        toast.success("Coupon applied");
                        setCode("");
                      }
                    });
                  }}
                  disabled={isPending}
                >
                  Apply
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
