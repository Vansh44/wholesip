"use server";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withService, withUser } from "@/lib/db/client";
import { dbErrorMessage } from "@/lib/db/errors";
import { orderItems, orders } from "@/drizzle/schema";
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

// Columns the dashboard orders LIST renders. Deliberately not every column and
// not the order_items join — the table only needs these, and pulling every
// line item for every order made the query grow without bound. Aliased to the
// snake_case shape the view expects.
const ORDER_LIST_COLUMNS = {
  id: orders.id,
  order_no: orders.orderNo,
  order_ref: orders.orderRef,
  created_at: orders.createdAt,
  total: orders.total,
  currency: orders.currency,
  payment_method: orders.paymentMethod,
  payment_status: orders.paymentStatus,
  status: orders.status,
  shipping_address: orders.shippingAddress,
};

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

  const storeId = await getActingStoreId();

  const safePage = Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1;
  const safeSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(Math.trunc(pageSize), 100)
      : DASHBOARD_PAGE_SIZE;
  const from = (safePage - 1) * safeSize;

  try {
    // RLS (store admins get FOR ALL on their own orders) + explicit store scope.
    const { rows, total } = await withUser({ uid: userId }, async (db) => {
      const [rows, countRows] = await Promise.all([
        db
          .select(ORDER_LIST_COLUMNS)
          .from(orders)
          .where(eq(orders.storeId, storeId))
          .orderBy(desc(orders.createdAt))
          .limit(safeSize)
          .offset(from),
        db
          .select({ n: count() })
          .from(orders)
          .where(eq(orders.storeId, storeId)),
      ]);
      return { rows, total: countRows[0]?.n ?? 0 };
    });

    return { orders: rows as Record<string, unknown>[], total };
  } catch (err) {
    console.error("Error fetching orders:", err);
    return {
      error: dbErrorMessage(err, "Failed to load orders."),
      orders: [],
      total: 0,
    };
  }
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

  const storeId = await getActingStoreId();

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
    const claimed = await withUser({ uid: userId }, (db) =>
      db
        .update(orders)
        .set({ stockStatus: "released" })
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.storeId, storeId),
            eq(orders.stockStatus, "reserved"),
          ),
        )
        .returning({ id: orders.id }),
    ).catch((err) => {
      console.error(
        "stock release claim:",
        err instanceof Error ? err.message : err,
      );
      return [] as { id: string }[];
    });

    if (claimed.length > 0) {
      const items = await withUser({ uid: userId }, (db) =>
        db
          .select({
            product_id: orderItems.productId,
            variant_id: orderItems.variantId,
            quantity: orderItems.quantity,
          })
          .from(orderItems)
          .where(eq(orderItems.orderId, orderId)),
      ).catch(() => []);

      for (const item of items) {
        // The unchanged Postgres function does the atomic restock + ledger row.
        await withService((db) =>
          db.execute(
            sql`select release_stock(p_store => ${storeId}, p_product => ${item.product_id}, p_variant => ${item.variant_id}, p_qty => ${item.quantity}, p_order => ${orderId}, p_reason => ${"order_cancelled"})`,
          ),
        ).catch((err) =>
          console.error(
            "release_stock:",
            err instanceof Error ? err.message : err,
          ),
        );
      }
    }
  }

  const updateData: { status: string; paymentStatus?: string } = { status };
  if (paymentStatus) {
    updateData.paymentStatus = paymentStatus;
  }

  try {
    await withUser({ uid: userId }, (db) =>
      db
        .update(orders)
        .set(updateData)
        .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId))),
    );
  } catch (err) {
    console.error("Error updating order status:", err);
    return { error: dbErrorMessage(err, "Failed to update order status.") };
  }

  revalidatePath("/dashboard/orders");
  return { success: true };
}
