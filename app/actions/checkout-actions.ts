"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentStoreId } from "@/lib/store/resolve";
import { rateLimit } from "@/lib/rate-limit";
import { validateCoupon } from "./coupon-actions";
import { CartItem } from "@/app/(storefront)/components/cart/CartProvider";

// Bounds on client-supplied cart data — reject oversized/malformed payloads
// before any DB work so a hostile client can't send 10k line items or negative
// quantities.
const MAX_LINE_ITEMS = 100;
const MAX_QUANTITY_PER_LINE = 1000;
const MAX_FIELD_LEN = 200;
const MAX_NOTES_LEN = 1000;

// Required shipping-address fields. Enforced server-side too (the form's
// `required` attribute is a UX hint, not a security boundary).
const REQUIRED_FIELDS: Array<[keyof CheckoutFormData, string]> = [
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["addressLine1", "Address"],
  ["city", "City"],
  ["state", "State"],
  ["postalCode", "Postal code"],
  ["country", "Country"],
];

function cleanField(value: string | undefined, maxLen = MAX_FIELD_LEN): string {
  return (value ?? "").toString().trim().slice(0, maxLen);
}

export interface CheckoutFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  notes?: string;
}

export type CheckoutResult =
  | { success: true; orderId: string }
  | { error: string };

// Normalize a coupon code the same way coupon-actions does (stored uppercased,
// no whitespace) so the usage-increment lookup matches the stored row.
function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export async function placeOrder(
  form: CheckoutFormData,
  items: CartItem[],
  couponCode?: string | null,
): Promise<CheckoutResult> {
  // Authenticate the shopper with their own session (RLS-respecting client).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to checkout." };
  }

  // Throttle order placement per customer (abuse / accidental double-submit /
  // scripted spam). Backed by Postgres so it holds across serverless instances;
  // fails open on a DB hiccup, since auth + validation remain the real boundary.
  const rl = await rateLimit(`checkout:${user.id}`, {
    max: 10,
    windowSeconds: 60,
  });
  if (!rl.allowed) {
    return {
      error: "Too many checkout attempts. Please wait a moment and try again.",
    };
  }

  if (items.length === 0) {
    return { error: "Your cart is empty." };
  }
  if (items.length > MAX_LINE_ITEMS) {
    return { error: "Your cart has too many items." };
  }

  // Validate each line's shape before trusting it downstream: a real product id
  // and a whole, positive, bounded quantity.
  for (const item of items) {
    if (typeof item.productId !== "string" || !item.productId) {
      return { error: "Your cart contains an invalid item." };
    }
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > MAX_QUANTITY_PER_LINE
    ) {
      return { error: `Invalid quantity for ${item.name || "an item"}.` };
    }
  }

  // Validate required address fields server-side (defense in depth).
  for (const [key, label] of REQUIRED_FIELDS) {
    if (!cleanField(form[key] as string | undefined)) {
      return { error: `${label} is required.` };
    }
  }

  // The order belongs to the store the shopper is actually on (the host),
  // never a store inferred from client-supplied cart contents.
  const storeId = await getCurrentStoreId();

  // Orders/order_items are written with the service-role client: there is no
  // customer INSERT RLS policy on those tables by design (see orders_table.sql),
  // and all prices/totals are re-derived from the DB below, not trusted from
  // the client — so the write is safe to run with RLS bypassed.
  const admin = createAdminClient();

  // 1. Re-validate prices by fetching products from the DB (anti-tampering),
  //    scoped to the host store so another store's products can't be smuggled in.
  const productIds = Array.from(new Set(items.map((i) => i.productId)));

  const { data: dbProducts } = await admin
    .from("products")
    .select("id, name, selling_price, store_id")
    .in("id", productIds)
    .eq("store_id", storeId);

  if (!dbProducts || dbProducts.length === 0) {
    return { error: "One or more products were not found." };
  }

  const productsMap = new Map(dbProducts.map((p) => [p.id, p]));

  // 2. Fetch variants if any (also store-scoped).
  const variantIds = Array.from(
    new Set(items.map((i) => i.variantId).filter(Boolean)),
  ) as string[];
  const variantsMap = new Map<
    string,
    { id: string; name: string; selling_price: number }
  >();
  if (variantIds.length > 0) {
    const { data: dbVariants } = await admin
      .from("product_variants")
      .select("id, name, selling_price")
      .in("id", variantIds)
      .eq("store_id", storeId);

    if (dbVariants) {
      for (const v of dbVariants) {
        variantsMap.set(v.id, v);
      }
    }
  }

  let subtotal = 0;
  const validItems: Array<{
    product_id: string;
    variant_id: string | null;
    name: string;
    variant_name: string | null;
    price: number;
    quantity: number;
    total: number;
  }> = [];

  for (const item of items) {
    const dbProduct = productsMap.get(item.productId);
    if (!dbProduct)
      return { error: `Product no longer available: ${item.name}` };

    let price = dbProduct.selling_price;
    const name = dbProduct.name;
    let variantName: string | null = null;

    if (item.variantId) {
      const dbVariant = variantsMap.get(item.variantId);
      if (!dbVariant)
        return { error: `Variant no longer available: ${item.variantName}` };
      price = dbVariant.selling_price;
      variantName = dbVariant.name;
    }

    subtotal += price * item.quantity;
    validItems.push({
      product_id: item.productId,
      variant_id: item.variantId,
      name,
      variant_name: variantName,
      price,
      quantity: item.quantity,
      total: price * item.quantity,
    });
  }

  // 3. Validate and apply coupon. Round to whole rupees and clamp to subtotal so
  //    the stored total matches what the cart showed the shopper (CartProvider
  //    rounds identically).
  let discount = 0;
  let couponApplied = false;
  const couponCodeNormalized = couponCode ? normalizeCode(couponCode) : null;
  if (couponCode) {
    const validation = await validateCoupon(couponCode, subtotal);
    if (validation.error) {
      return { error: `Coupon error: ${validation.error}` };
    }
    if (validation.coupon) {
      couponApplied = true;
      const raw =
        validation.coupon.discountType === "fixed"
          ? validation.coupon.discountValue
          : subtotal * (validation.coupon.discountValue / 100);
      discount = Math.min(Math.round(raw), subtotal);
    }
  }

  const shipping = 0; // Hardcoded free shipping for now
  const tax = 0; // Hardcoded zero tax for now
  const total = Math.max(0, subtotal + shipping + tax - discount);

  // Store only trimmed, length-capped values (the fields render in the admin
  // dashboard; React escapes output, but we keep the stored data clean too).
  const shippingAddress = {
    firstName: cleanField(form.firstName),
    lastName: cleanField(form.lastName),
    addressLine1: cleanField(form.addressLine1),
    addressLine2: cleanField(form.addressLine2),
    city: cleanField(form.city),
    state: cleanField(form.state),
    postalCode: cleanField(form.postalCode),
    country: cleanField(form.country),
    email: cleanField(form.email),
    phone: cleanField(form.phone),
  };
  const notes = cleanField(form.notes, MAX_NOTES_LEN) || null;

  // 3b. Reserve a coupon use ATOMICALLY, before creating the order, so a
  //     max_uses cap can never be exceeded even under simultaneous checkouts
  //     (increment_coupon_usage does a single conditional UPDATE and returns
  //     false when the cap is already hit). We release it below if the order
  //     then fails to persist. A transient RPC error fails OPEN — we don't block
  //     a paying customer over the usage counter (validation already passed).
  let couponReserved = false;
  if (couponApplied && couponCodeNormalized) {
    const { data: reserved, error: rpcError } = await admin.rpc(
      "increment_coupon_usage",
      { p_code: couponCodeNormalized, p_store_id: storeId },
    );
    if (rpcError) {
      console.error("increment_coupon_usage:", rpcError.message);
    } else if (reserved === false) {
      return { error: "This coupon has reached its usage limit." };
    } else {
      couponReserved = true;
    }
  }

  const releaseCoupon = async () => {
    if (couponReserved && couponCodeNormalized) {
      await admin.rpc("decrement_coupon_usage", {
        p_code: couponCodeNormalized,
        p_store_id: storeId,
      });
    }
  };

  // 4. Create the order.
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      store_id: storeId,
      customer_id: user.id,
      status: "pending",
      payment_method: "cash_on_delivery",
      payment_status: "pending",
      shipping_address: shippingAddress,
      billing_address: null, // COD uses shipping as billing essentially
      subtotal,
      tax,
      shipping,
      discount,
      total,
      currency: "INR",
      applied_coupon_code: couponCode || null,
      notes,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    console.error("Order creation error:", orderError);
    await releaseCoupon(); // give the reserved coupon use back
    return { error: "Failed to create order. Please try again." };
  }

  // 5. Create order items. If this fails, roll back the order row (and release
  //    the reserved coupon use) so we don't leave an orphan order (there is no
  //    cross-statement transaction over PostgREST).
  const orderItemsToInsert = validItems.map((item) => ({
    ...item,
    order_id: order.id,
  }));

  const { error: itemsError } = await admin
    .from("order_items")
    .insert(orderItemsToInsert);

  if (itemsError) {
    console.error("Order items error:", itemsError);
    await admin.from("orders").delete().eq("id", order.id);
    await releaseCoupon();
    return { error: "Failed to save order items. Please try again." };
  }

  return { success: true, orderId: order.id };
}
