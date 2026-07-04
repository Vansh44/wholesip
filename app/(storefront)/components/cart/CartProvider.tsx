/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  validateCoupon,
  type AppliedCoupon,
} from "@/app/actions/coupon-actions";

export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  variantId: string | null;
  variantName: string | null;
  price: number; // effective selling price (per unit)
  basePrice: number; // original price, for struck-through display
  image: string | null;
  quantity: number;
  /** Resolved category name — shown as the line subtitle in the grocery cart.
   *  Optional so older persisted carts (and non-grocery callers) still fit. */
  category?: string | null;
}

type AddItemInput = Omit<CartItem, "quantity">;

type CartContextType = {
  items: CartItem[];
  hydrated: boolean;
  addItem: (item: AddItemInput, quantity?: number) => void;
  removeItem: (key: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  clear: () => void;
  totalItems: number;
  subtotal: number;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  // Coupons
  appliedCoupon: AppliedCoupon | null;
  couponDiscount: number; // rupees off, clamped to subtotal
  couponValid: boolean; // false when the cart no longer meets the minimum
  total: number; // subtotal - couponDiscount
  applyCoupon: (code: string) => Promise<{ error?: string }>;
  removeCoupon: () => void;
};

const CartContext = createContext<CartContextType | null>(null);

const STORAGE_KEY = "wholesip-cart-v1";
const COUPON_KEY = "wholesip-coupon-v1";

// A cart line is uniquely identified by product + variant.
export function lineKey(productId: string, variantId: string | null): string {
  return `${productId}:${variantId ?? ""}`;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export default function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(
    null,
  );
  const [hydrated, setHydrated] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  // Load persisted cart + coupon on mount (client only — avoids SSR mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed);
      }
      const couponRaw = localStorage.getItem(COUPON_KEY);
      if (couponRaw) {
        const parsed = JSON.parse(couponRaw);
        if (parsed && typeof parsed.code === "string") setAppliedCoupon(parsed);
      }
    } catch {
      // Ignore malformed storage.
    }
    setHydrated(true);
  }, []);

  // Persist whenever the cart changes (after the initial load).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage full / unavailable — non-fatal.
    }
  }, [items, hydrated]);

  // Persist the applied coupon separately.
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (appliedCoupon) {
        localStorage.setItem(COUPON_KEY, JSON.stringify(appliedCoupon));
      } else {
        localStorage.removeItem(COUPON_KEY);
      }
    } catch {
      // non-fatal
    }
  }, [appliedCoupon, hydrated]);

  const addItem = useCallback((item: AddItemInput, quantity = 1) => {
    if (quantity < 1) return;
    setItems((prev) => {
      const key = lineKey(item.productId, item.variantId);
      const existing = prev.find(
        (i) => lineKey(i.productId, i.variantId) === key,
      );
      if (existing) {
        return prev.map((i) =>
          lineKey(i.productId, i.variantId) === key
            ? { ...i, quantity: i.quantity + quantity }
            : i,
        );
      }
      return [...prev, { ...item, quantity }];
    });
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) =>
      prev.filter((i) => lineKey(i.productId, i.variantId) !== key),
    );
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((prev) =>
      quantity < 1
        ? prev.filter((i) => lineKey(i.productId, i.variantId) !== key)
        : prev.map((i) =>
            lineKey(i.productId, i.variantId) === key ? { ...i, quantity } : i,
          ),
    );
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setAppliedCoupon(null);
  }, []);

  const totalItems = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  );

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items],
  );

  // Recompute the discount locally as the cart changes. The coupon is invalid
  // (0 off) when the cart no longer meets its minimum-order requirement.
  const couponValid = useMemo(() => {
    if (!appliedCoupon) return false;
    if (
      appliedCoupon.minOrderAmount > 0 &&
      subtotal < appliedCoupon.minOrderAmount
    )
      return false;
    return subtotal > 0;
  }, [appliedCoupon, subtotal]);

  const couponDiscount = useMemo(() => {
    if (!appliedCoupon || !couponValid) return 0;
    const raw =
      appliedCoupon.discountType === "percentage"
        ? subtotal * (appliedCoupon.discountValue / 100)
        : appliedCoupon.discountValue;
    return Math.min(Math.round(raw), subtotal);
  }, [appliedCoupon, couponValid, subtotal]);

  const total = useMemo(
    () => Math.max(0, subtotal - couponDiscount),
    [subtotal, couponDiscount],
  );

  const applyCoupon = useCallback(
    async (code: string): Promise<{ error?: string }> => {
      const result = await validateCoupon(code, subtotal);
      if (result.error || !result.coupon) {
        return { error: result.error ?? "Invalid coupon code." };
      }
      setAppliedCoupon(result.coupon);
      return {};
    },
    [subtotal],
  );

  const removeCoupon = useCallback(() => setAppliedCoupon(null), []);

  const value = useMemo(
    () => ({
      items,
      hydrated,
      addItem,
      removeItem,
      setQuantity,
      clear,
      totalItems,
      subtotal,
      isCartOpen,
      openCart,
      closeCart,
      appliedCoupon,
      couponDiscount,
      couponValid,
      total,
      applyCoupon,
      removeCoupon,
    }),
    [
      items,
      hydrated,
      addItem,
      removeItem,
      setQuantity,
      clear,
      totalItems,
      subtotal,
      isCartOpen,
      openCart,
      closeCart,
      appliedCoupon,
      couponDiscount,
      couponValid,
      total,
      applyCoupon,
      removeCoupon,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
