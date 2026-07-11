"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentStoreId } from "@/lib/store/resolve";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { validateCoupon } from "./coupon-actions";
import { CartItem } from "@/app/(storefront)/components/cart/CartProvider";
import { computeTax } from "@/lib/billing/tax";
import {
  rowToBillingSettings,
  rowToTaxClass,
  type BillingSettings,
  type TaxClass,
} from "@/lib/billing/types";

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
  | { success: true; orderId: string; orderRef: string }
  | { error: string };

// Normalize a coupon code the same way coupon-actions does (stored uppercased,
// no whitespace) so the usage-increment lookup matches the stored row.
function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

// Live per-line stock, re-read from the DB and scoped to the host store, so the
// cart can be reconciled against the truth BEFORE the shopper fills the form.
// A cart persisted in localStorage can drift: the merchant lowers stock, deletes
// a product, or another shopper buys the last unit. reserve_stock is still the
// hard guarantee at order time, but this lets us honestly reflect availability
// (clamp quantities, drop vanished/sold-out lines) and tell the shopper up front
// instead of failing them after they've typed an address.
export interface CartStockInfo {
  productId: string;
  variantId: string | null;
  // False when the product (or its selected variant) no longer exists in this
  // store — the line should be removed.
  exists: boolean;
  trackInventory: boolean;
  stock: number;
  allowBackorder: boolean;
}

interface StockRow {
  id: string;
  track_inventory: boolean | null;
  stock: number | null;
  allow_backorder: boolean | null;
}

function toInfo(
  productId: string,
  variantId: string | null,
  row: StockRow | undefined,
): CartStockInfo {
  if (!row) {
    return {
      productId,
      variantId,
      exists: false,
      trackInventory: false,
      stock: 0,
      allowBackorder: false,
    };
  }
  return {
    productId,
    variantId,
    exists: true,
    trackInventory: !!row.track_inventory,
    stock: row.stock ?? 0,
    allowBackorder: !!row.allow_backorder,
  };
}

export async function getCartStock(
  lines: Array<{ productId: string; variantId: string | null }>,
): Promise<CartStockInfo[]> {
  if (!Array.isArray(lines) || lines.length === 0) return [];
  const bounded = lines.slice(0, MAX_LINE_ITEMS);

  const storeId = await getCurrentStoreId();
  // Read-only, store-scoped stock lookup. Stock is already public on the
  // storefront, so bypassing RLS here just gives us a single uncached read.
  const admin = createAdminClient();

  const productIds = Array.from(
    new Set(
      bounded
        .map((l) => l.productId)
        .filter((x): x is string => typeof x === "string" && !!x),
    ),
  );
  if (productIds.length === 0) return [];

  const { data: products } = await admin
    .from("products")
    .select("id, track_inventory, stock, allow_backorder")
    .in("id", productIds)
    .eq("store_id", storeId);
  const productMap = new Map<string, StockRow>(
    (products ?? []).map((p) => [p.id, p as StockRow]),
  );

  const variantIds = Array.from(
    new Set(
      bounded
        .map((l) => l.variantId)
        .filter((x): x is string => typeof x === "string" && !!x),
    ),
  );
  const variantMap = new Map<string, StockRow>();
  if (variantIds.length > 0) {
    const { data: variants } = await admin
      .from("product_variants")
      .select("id, track_inventory, stock, allow_backorder")
      .in("id", variantIds)
      .eq("store_id", storeId);
    for (const v of variants ?? []) variantMap.set(v.id, v as StockRow);
  }

  return bounded.map((l) => {
    const product = productMap.get(l.productId);
    if (l.variantId) {
      // A variant line is valid only when BOTH the product and the variant
      // still exist in this store; the sellable SKU is the variant.
      const variant = variantMap.get(l.variantId);
      if (!product) return toInfo(l.productId, l.variantId, undefined);
      return toInfo(l.productId, l.variantId, variant);
    }
    return toInfo(l.productId, null, product);
  });
}

// After a reserve fails, read how many units are actually left so the error can
// tell the shopper the exact shortfall (reserve_stock only returns a boolean).
async function availableStock(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  productId: string,
  variantId: string | null,
): Promise<number> {
  try {
    const table = variantId ? "product_variants" : "products";
    const id = variantId ?? productId;
    const { data } = await admin
      .from(table)
      .select("stock")
      .eq("id", id)
      .eq("store_id", storeId)
      .maybeSingle();
    return Math.max(0, (data?.stock as number | undefined) ?? 0);
  } catch {
    return 0;
  }
}

// Read a store's tax config authoritatively (uncached, store-scoped) through an
// admin client. Used by both placeOrder (trust boundary) and getCartTaxRates
// (display), so both agree. Uncached on purpose: an order must reflect the tax
// config at the exact moment it's placed, never a stale cached copy.
async function readTaxConfig(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
): Promise<{ billing: BillingSettings; taxClasses: TaxClass[] }> {
  const [billingRes, taxRes] = await Promise.all([
    admin
      .from("store_billing_settings")
      .select("*")
      .eq("store_id", storeId)
      .maybeSingle(),
    admin
      .from("tax_classes")
      .select("id, name, rate, sort_order")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true }),
  ]);
  return {
    billing: rowToBillingSettings(
      billingRes.data as Record<string, unknown> | null,
    ),
    taxClasses: (taxRes.data ?? []).map((r) =>
      rowToTaxClass(r as Record<string, unknown>),
    ),
  };
}

export interface CartTaxResult {
  enabled: boolean;
  inclusive: boolean;
  tax: number;
  byRate: Array<{ rate: number; label: string; tax: number }>;
}

export interface CartTaxRateLine {
  productId: string;
  variantId: string | null;
  /** Authoritative per-unit price (from the DB) — the tax base. */
  price: number;
  /** Resolved tax rate as a percentage (0..100). */
  rate: number;
  /** Tax class name, for the per-rate breakdown label. */
  label?: string;
}

export interface CartTaxRates {
  enabled: boolean;
  inclusive: boolean;
  lines: CartTaxRateLine[];
}

// Resolve the store's tax config + each cart line's authoritative price and tax
// rate for DISPLAY, WITHOUT quantity or discount. Those inputs depend only on
// WHICH products are in the cart, so the client (`useCartTax`) fetches this once
// per product-set change and recomputes the actual tax LOCALLY via the pure
// `computeTax` whenever quantity or the coupon changes — quantity/discount edits
// then cost ZERO round-trips; only adding/removing a product refetches.
// placeOrder remains the authoritative recompute at order time.
export async function getCartTaxRates(
  lines: Array<{ productId: string; variantId: string | null }>,
): Promise<CartTaxRates> {
  const empty: CartTaxRates = { enabled: false, inclusive: false, lines: [] };
  if (!Array.isArray(lines) || lines.length === 0) return empty;
  // Same bound as placeOrder — this is an anonymous-callable action doing
  // service-role reads, so reject oversized payloads before any DB work.
  if (lines.length > MAX_LINE_ITEMS) return empty;
  const safeLines = lines
    .map((l) => ({
      productId: typeof l?.productId === "string" ? l.productId : "",
      variantId: typeof l?.variantId === "string" ? l.variantId : null,
    }))
    .filter((l) => l.productId);
  if (safeLines.length === 0) return empty;

  // Anonymous-callable action doing service-role reads. The client debounces and
  // only refetches on product-set changes, so a real shopper never approaches
  // this — but throttle per IP so a scripted caller can't drive unbounded DB
  // load. Generous cap (well above any human's cart activity, tolerant of shared
  // NAT); the check runs BEFORE the tax reads, and fails OPEN on a DB hiccup.
  // Blocked callers just get the empty result (tax hidden — display only;
  // placeOrder recomputes authoritatively at order time).
  const ip = clientIp(await headers());
  const { allowed } = await rateLimit(`cart-tax:${ip}`, {
    max: 120,
    windowSeconds: 60,
  });
  if (!allowed) return empty;

  const storeId = await getCurrentStoreId();
  const admin = createAdminClient();
  const { billing, taxClasses } = await readTaxConfig(admin, storeId);
  if (!billing.taxEnabled) return empty;

  const productIds = Array.from(new Set(safeLines.map((l) => l.productId)));
  const variantIds = Array.from(
    new Set(safeLines.map((l) => l.variantId).filter(Boolean)),
  ) as string[];

  const [{ data: products }, variantsRes] = await Promise.all([
    admin
      .from("products")
      .select("id, selling_price, tax_class_id")
      .in("id", productIds)
      .eq("store_id", storeId),
    variantIds.length
      ? admin
          .from("product_variants")
          .select("id, selling_price")
          .in("id", variantIds)
          .eq("store_id", storeId)
      : Promise.resolve({
          data: [] as { id: string; selling_price: number }[],
        }),
  ]);

  const pMap = new Map(
    (products ?? []).map((p) => [
      p.id as string,
      p as { selling_price: number; tax_class_id: string | null },
    ]),
  );
  const vMap = new Map(
    (variantsRes.data ?? []).map((v) => [
      v.id as string,
      v as { selling_price: number },
    ]),
  );
  const classById = new Map(taxClasses.map((c) => [c.id, c]));

  const resolved: CartTaxRateLine[] = safeLines.map((l) => {
    const p = pMap.get(l.productId);
    if (!p) {
      return {
        productId: l.productId,
        variantId: l.variantId,
        price: 0,
        rate: 0,
      };
    }
    const price = l.variantId
      ? (vMap.get(l.variantId)?.selling_price ?? p.selling_price)
      : p.selling_price;
    const classId = p.tax_class_id ?? billing.defaultTaxClassId;
    const cls = classId ? classById.get(classId) : null;
    return {
      productId: l.productId,
      variantId: l.variantId,
      price,
      rate: cls?.rate ?? 0,
      label: cls?.name,
    };
  });

  return {
    enabled: true,
    inclusive: billing.pricesIncludeTax,
    lines: resolved,
  };
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
    .select("id, name, selling_price, store_id, tax_class_id")
    .in("id", productIds)
    .eq("store_id", storeId);

  if (!dbProducts || dbProducts.length === 0) {
    return { error: "One or more products were not found." };
  }

  const productsMap = new Map(dbProducts.map((p) => [p.id, p]));

  // Tax config + rate resolver. A line's rate comes from its product's tax
  // class, falling back to the store default; only applied when tax is enabled.
  // Read store-scoped (admin), never trusting the client.
  const { billing, taxClasses } = await readTaxConfig(admin, storeId);
  const taxClassById = new Map(taxClasses.map((c) => [c.id, c]));
  const resolveTax = (
    p: { tax_class_id?: string | null } | undefined,
  ): { rate: number; name: string | null } => {
    if (!billing.taxEnabled) return { rate: 0, name: null };
    const classId = p?.tax_class_id ?? billing.defaultTaxClassId;
    const cls = classId ? taxClassById.get(classId) : null;
    return cls ? { rate: cls.rate, name: cls.name } : { rate: 0, name: null };
  };

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
    // Tax snapshot per line (rate resolved from the product's tax class). Filled
    // in below once the discount is known so tax is computed on the net amount.
    tax_rate: number;
    tax_amount: number;
    tax_class_name: string | null;
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

    const taxInfo = resolveTax(dbProduct);
    subtotal += price * item.quantity;
    validItems.push({
      product_id: item.productId,
      variant_id: item.variantId,
      name,
      variant_name: variantName,
      price,
      quantity: item.quantity,
      total: price * item.quantity,
      tax_rate: taxInfo.rate,
      tax_amount: 0,
      tax_class_name: taxInfo.name,
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

  // 3c. Compute tax from each line's resolved rate, on the DISCOUNTED amount
  //     (see lib/billing/tax.ts). Exclusive: tax is ADDED to the total.
  //     Inclusive: tax is already inside the listed prices, so it's reported but
  //     NOT added again. Per-line tax is written back to each order item below.
  const taxResult = computeTax({
    lines: validItems.map((it) => ({
      amount: it.total,
      rate: it.tax_rate,
      label: it.tax_class_name ?? undefined,
    })),
    discount,
    pricesIncludeTax: billing.pricesIncludeTax,
    enabled: billing.taxEnabled,
  });
  const tax = taxResult.totalTax;
  validItems.forEach((it, idx) => {
    it.tax_amount = taxResult.lines[idx]?.tax ?? 0;
  });

  const total = Math.max(
    0,
    subtotal - discount + shipping + (billing.pricesIncludeTax ? 0 : tax),
  );

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

  // The order id is generated up front so the order row and its stock-ledger
  // movements share it. What follows is a reserve → create → reserve → rollback
  // flow. There is NO cross-statement transaction over PostgREST, so every
  // failure path unwinds each step that already succeeded, in reverse order.
  const orderId = crypto.randomUUID();

  // 3b. Reserve a coupon use ATOMICALLY, before creating the order, so a
  //     max_uses cap can never be exceeded even under simultaneous checkouts
  //     (increment_coupon_usage does a single conditional UPDATE and returns
  //     false when the cap is already hit). This touches only the `coupons`
  //     table (no FK to `orders`), so it can safely run before the order exists;
  //     we release it below if a later step fails. A transient RPC error fails
  //     OPEN — we don't block a paying customer over the usage counter
  //     (validation already passed).
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

  // 4. Create the order BEFORE reserving stock. Each stock reservation writes a
  //    `stock_movements` row whose `order_id` references `orders(id)`, so the
  //    order row must already exist — otherwise the ledger insert violates that
  //    foreign key and every tracked-SKU checkout fails. We pass the
  //    pre-generated id so the sale movements carry the real order id from the
  //    start.
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      id: orderId,
      store_id: storeId,
      customer_id: user.id,
      status: "pending",
      payment_method: "cash_on_delivery",
      payment_status: "pending",
      shipping_address: shippingAddress,
      billing_address: null, // COD uses shipping as billing essentially
      subtotal,
      tax,
      tax_inclusive: billing.pricesIncludeTax,
      shipping,
      discount,
      total,
      currency: "INR",
      applied_coupon_code: couponCode || null,
      notes,
      // This order goes through the reserve flow below; mark it so that
      // cancellation restocks it exactly once (and never restocks legacy
      // orders, which stay 'none'). If the reserve loop fails, the order row
      // is deleted, so this value only ever persists on a fully-reserved order.
      stock_status: "reserved",
    })
    .select("id, order_ref")
    .single();

  if (orderError || !order) {
    console.error("Order creation error:", orderError);
    await releaseCoupon(); // give the reserved coupon use back
    return { error: "Failed to create order. Please try again." };
  }

  // 4b. Reserve stock ATOMICALLY for each line, now that the order row exists so
  //     the ledger's order_id FK is satisfied. If any line would oversell, roll
  //     everything back. IMPORTANT: release stock BEFORE deleting the order — the
  //     order row must still exist for the release movements to be written
  //     (deleting it SET NULLs their order_id afterwards).
  const reservedStockItems: Array<{
    product_id: string;
    variant_id: string | null;
    qty: number;
  }> = [];

  const releaseStock = async () => {
    for (const r of reservedStockItems) {
      await admin.rpc("release_stock", {
        p_store: storeId,
        p_product: r.product_id,
        p_variant: r.variant_id,
        p_qty: r.qty,
        p_order: order.id,
        p_reason: "checkout_failed",
      });
    }
  };

  for (const item of validItems) {
    const { data: reserved, error: reserveError } = await admin.rpc(
      "reserve_stock",
      {
        p_store: storeId,
        p_product: item.product_id,
        p_variant: item.variant_id,
        p_qty: item.quantity,
        p_order: order.id,
      },
    );

    if (reserveError || !reserved) {
      await releaseStock();
      await admin.from("orders").delete().eq("id", order.id);
      await releaseCoupon();
      // Report the exact shortfall so the shopper knows what to do rather than
      // seeing a generic "not enough stock". reserve_stock failed because the
      // SKU is tracked, non-backorderable, and short — so the live count is the
      // most they can take.
      const label = item.variant_name
        ? `${item.name} (${item.variant_name})`
        : item.name;
      const remaining = await availableStock(
        admin,
        storeId,
        item.product_id,
        item.variant_id,
      );
      return {
        error:
          remaining > 0
            ? `Not enough stock for ${label} — only ${remaining} left. Please lower the quantity and try again.`
            : `${label} just sold out. Please remove it from your cart and try again.`,
      };
    }
    reservedStockItems.push({
      product_id: item.product_id,
      variant_id: item.variant_id,
      qty: item.quantity,
    });
  }

  // 5. Create order items. If this fails, roll back everything: release the
  //    reserved stock (order still present so the movements write), then delete
  //    the order, then give the coupon use back — no orphan order is left behind
  //    (there is no cross-statement transaction over PostgREST).
  const orderItemsToInsert = validItems.map((item) => ({
    ...item,
    order_id: order.id,
  }));

  const { error: itemsError } = await admin
    .from("order_items")
    .insert(orderItemsToInsert);

  if (itemsError) {
    console.error("Order items error:", itemsError);
    await releaseStock();
    await admin.from("orders").delete().eq("id", order.id);
    await releaseCoupon();
    return { error: "Failed to save order items. Please try again." };
  }

  return {
    success: true,
    orderId: order.id,
    orderRef: (order as { order_ref?: string }).order_ref ?? "",
  };
}
