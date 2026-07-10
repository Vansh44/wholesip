import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActingStoreId } from "@/app/dashboard/lib/access";
import { getStoreBillingSettings } from "@/lib/storefront/queries";
import {
  rowToBillingSettings,
  type BillingSettings,
} from "@/lib/billing/types";
import type {
  InvoiceOrderData,
  InvoiceItemData,
} from "@/components/invoice/invoice-document";

// Column lists kept explicit (never select *) so a schema addition can't
// accidentally leak a new column into a customer-facing invoice.
const ORDER_COLS =
  "id, store_id, order_ref, order_no, created_at, status, payment_method, payment_status, subtotal, tax, tax_inclusive, shipping, discount, total, currency, applied_coupon_code, notes, shipping_address, billing_address";
const ITEM_COLS =
  "name, variant_name, price, quantity, total, tax_rate, tax_amount, tax_class_name";

export interface InvoiceData {
  /** The store the order belongs to — callers verify it matches their host. */
  storeId: string;
  order: InvoiceOrderData;
  items: InvoiceItemData[];
  billing: BillingSettings;
}

/**
 * Dashboard invoice — an admin views any order in THEIR store. Service-role
 * read, scoped by the acting store id (so one store can't print another's
 * invoice). Caller must already be gated on the `orders`/`billing` section.
 */
export async function loadInvoiceByStore(
  orderId: string,
): Promise<InvoiceData | null> {
  if (!orderId) return null;
  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select(ORDER_COLS)
    .eq("id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (!order) return null;

  const [{ data: items }, { data: billingRow }] = await Promise.all([
    admin.from("order_items").select(ITEM_COLS).eq("order_id", orderId),
    admin
      .from("store_billing_settings")
      .select("*")
      .eq("store_id", storeId)
      .maybeSingle(),
  ]);

  return {
    storeId,
    order: order as unknown as InvoiceOrderData,
    items: (items ?? []) as unknown as InvoiceItemData[],
    billing: rowToBillingSettings(billingRow as Record<string, unknown> | null),
  };
}

/**
 * Customer invoice — a signed-in shopper views THEIR OWN order. Read on the
 * cookie client, so RLS (orders SELECT is customer_id = auth.uid()) enforces
 * ownership; a stranger's order id simply resolves to null. Billing settings
 * are public storefront data (business identity printed on the invoice).
 */
export async function loadInvoiceForCustomer(
  orderId: string,
): Promise<InvoiceData | null> {
  if (!orderId) return null;
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(ORDER_COLS)
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;

  const { data: items } = await supabase
    .from("order_items")
    .select(ITEM_COLS)
    .eq("order_id", orderId);

  const orderStoreId = (order as { store_id: string }).store_id;
  const billing = await getStoreBillingSettings(orderStoreId);

  return {
    storeId: orderStoreId,
    order: order as unknown as InvoiceOrderData,
    items: (items ?? []) as unknown as InvoiceItemData[],
    billing,
  };
}
