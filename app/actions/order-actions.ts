"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActingStoreId, getManagerUserId } from "@/app/dashboard/lib/access";
import { DASHBOARD_PAGE_SIZE } from "@/app/dashboard/lib/list-params";

// Allowlists — order/payment state is a closed set, so never trust an arbitrary
// string from the client into the DB (keeps the status column clean + prevents
// a mistyped/hostile value from poisoning downstream logic and filters).
const ORDER_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
const PAYMENT_STATUSES = ["pending", "paid", "failed"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// Columns the dashboard orders LIST renders. Deliberately not `*` and not the
// order_items join — the table only needs these, and pulling every line item
// for every order made the query grow without bound.
const ORDER_LIST_COLUMNS =
  "id, order_no, order_ref, created_at, total, currency, payment_method, payment_status, status, shipping_address";

export interface OrdersResult {
  orders: Record<string, unknown>[];
  total: number;
  error?: string;
}

export async function getOrders(
  page = 1,
  pageSize = DASHBOARD_PAGE_SIZE,
): Promise<OrdersResult> {
  const userId = await getManagerUserId("orders");
  if (!userId) return { error: "Not authenticated", orders: [], total: 0 };

  const supabase = await createClient();
  const storeId = await getActingStoreId();

  const safePage = Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1;
  const safeSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(Math.trunc(pageSize), 100)
      : DASHBOARD_PAGE_SIZE;
  const from = (safePage - 1) * safeSize;

  const { data, error, count } = await supabase
    .from("orders")
    .select(ORDER_LIST_COLUMNS, { count: "exact" })
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .range(from, from + safeSize - 1);

  if (error) {
    console.error("Error fetching orders:", error);
    return { error: error.message, orders: [], total: 0 };
  }

  return {
    orders: (data ?? []) as Record<string, unknown>[],
    total: count ?? 0,
  };
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
  paymentStatus?: string,
): Promise<{ success?: boolean; error?: string }> {
  const userId = await getManagerUserId("orders");
  if (!userId) return { error: "Not authenticated" };

  if (typeof orderId !== "string" || !orderId.trim()) {
    return { error: "Invalid order." };
  }
  if (!ORDER_STATUSES.includes(status as OrderStatus)) {
    return { error: "Invalid order status." };
  }
  if (
    paymentStatus !== undefined &&
    !PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus)
  ) {
    return { error: "Invalid payment status." };
  }

  const supabase = await createClient();
  const storeId = await getActingStoreId();

  const updateData: Record<string, string> = { status };
  if (paymentStatus) {
    updateData.payment_status = paymentStatus;
  }

  // If cancelling, restock the order's stock EXACTLY ONCE. We atomically
  // "claim" the release by flipping stock_status 'reserved' → 'released' in a
  // single conditional UPDATE, then release only if this call won the claim:
  //   - Legacy / never-reserved orders are stuck at 'none' → claim matches
  //     nothing → no phantom restock (finding #2).
  //   - An already-cancelled order (or one reinstated after a cancel) is
  //     'released' → claim matches nothing → no double restock (finding #3).
  //   - Two concurrent cancels → only one UPDATE flips the row → one release.
  // The release itself never blocks the status change (fails open); the ledger
  // is best-effort, the status update is the source of truth.
  if (status === "cancelled") {
    const { data: claimed, error: claimError } = await supabase
      .from("orders")
      .update({ stock_status: "released" })
      .eq("id", orderId)
      .eq("store_id", storeId)
      .eq("stock_status", "reserved")
      .select("id");

    if (claimError) {
      console.error("stock release claim:", claimError.message);
    } else if (claimed && claimed.length > 0) {
      const { data: items } = await supabase
        .from("order_items")
        .select("product_id, variant_id, quantity")
        .eq("order_id", orderId);

      if (items && items.length > 0) {
        const admin = createAdminClient();
        for (const item of items) {
          await admin.rpc("release_stock", {
            p_store: storeId,
            p_product: item.product_id,
            p_variant: item.variant_id,
            p_qty: item.quantity,
            p_order: orderId,
            p_reason: "order_cancelled",
          });
        }
      }
    }
  }

  const { error } = await supabase
    .from("orders")
    .update(updateData)
    .eq("id", orderId)
    .eq("store_id", storeId);

  if (error) {
    console.error("Error updating order status:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/orders");
  return { success: true };
}
