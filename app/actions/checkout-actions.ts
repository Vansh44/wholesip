"use server";

import { createClient } from "@/lib/supabase/server";
import { validateCoupon } from "./coupon-actions";
import { CartItem } from "@/app/(storefront)/components/cart/CartProvider";

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

export async function placeOrder(
  form: CheckoutFormData,
  items: CartItem[],
  couponCode?: string | null,
): Promise<CheckoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to checkout." };
  }

  if (items.length === 0) {
    return { error: "Your cart is empty." };
  }

  // 1. Re-validate prices by fetching products from DB to prevent client-side tampering
  const productIds = Array.from(new Set(items.map((i) => i.productId)));
  console.log("Checking out Product IDs:", productIds);

  const { data: dbProducts, error: dbProductsError } = await supabase
    .from("products")
    .select("id, name, selling_price, has_variants, store_id")
    .in("id", productIds);

  console.log("Found products:", dbProducts, "Error:", dbProductsError);

  if (!dbProducts || dbProducts.length === 0) {
    return { error: "One or more products were not found." };
  }

  const storeId = dbProducts[0].store_id;
  if (dbProducts.some((p) => p.store_id !== storeId)) {
    return { error: "Cannot checkout products from multiple stores." };
  }

  const productsMap = new Map(dbProducts.map((p) => [p.id, p]));

  // 2. Fetch variants if any
  const variantIds = Array.from(
    new Set(items.map((i) => i.variantId).filter(Boolean)),
  ) as string[];
  const variantsMap = new Map();
  if (variantIds.length > 0) {
    const { data: dbVariants } = await supabase
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validItems: any[] = [];

  for (const item of items) {
    const dbProduct = productsMap.get(item.productId);
    if (!dbProduct)
      return { error: `Product no longer available: ${item.name}` };

    let price = dbProduct.selling_price;
    const name = dbProduct.name;
    let variantName = null;

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

  // 3. Validate and apply coupon
  let discount = 0;
  if (couponCode) {
    const validation = await validateCoupon(couponCode, subtotal);
    if (validation.error) {
      return { error: `Coupon error: ${validation.error}` };
    }
    if (validation.coupon) {
      if (validation.coupon.discountType === "fixed") {
        discount = validation.coupon.discountValue;
      } else {
        discount = subtotal * (validation.coupon.discountValue / 100);
      }
      if (discount > subtotal) discount = subtotal;
    }
  }

  const shipping = 0; // Hardcoded free shipping for now
  const tax = 0; // Hardcoded zero tax for now
  const total = subtotal + shipping + tax - discount;

  // 4. Create the Order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      store_id: storeId,
      customer_id: user.id,
      status: "pending",
      payment_method: "cash_on_delivery",
      payment_status: "pending",
      shipping_address: {
        firstName: form.firstName,
        lastName: form.lastName,
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2,
        city: form.city,
        state: form.state,
        postalCode: form.postalCode,
        country: form.country,
      },
      billing_address: null, // COD uses shipping as billing essentially
      subtotal,
      tax,
      shipping,
      discount,
      total,
      currency: "INR",
      applied_coupon_code: couponCode || null,
      notes: form.notes || null,
    })
    .select("id")
    .single();

  if (orderError) {
    console.error("Order creation error:", orderError);
    return { error: "Failed to create order. Please try again." };
  }

  // 5. Create Order Items
  const orderItemsToInsert = validItems.map((item) => ({
    ...item,
    order_id: order.id,
  }));

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(orderItemsToInsert);

  if (itemsError) {
    console.error("Order items error:", itemsError);
    // Ideally we would rollback the order creation here using an RPC transaction,
    // but for now, we'll just log it.
    return { error: "Failed to save order items. Please contact support." };
  }

  return { success: true, orderId: order.id };
}
