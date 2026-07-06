"use server";

import { createClient } from "@/lib/supabase/server";
import { getActingStoreId, getManagerUserId } from "@/app/dashboard/lib/access";

export async function getOrders() {
  const supabase = await createClient();
  const userId = await getManagerUserId("orders");
  if (!userId) return { error: "Not authenticated", orders: [] };
  const storeId = await getActingStoreId();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      *,
      order_items (*)
    `,
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching orders:", error);
    return { error: error.message, orders: [] };
  }

  return { orders: data };
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
  paymentStatus?: string,
) {
  const supabase = await createClient();
  const userId = await getManagerUserId("orders");
  if (!userId) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();

  const updateData: Record<string, string> = { status };
  if (paymentStatus) {
    updateData.payment_status = paymentStatus;
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

  return { success: true };
}
