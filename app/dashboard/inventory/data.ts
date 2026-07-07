import { createClient } from "@/lib/supabase/server";
import { getActingStoreId } from "@/app/dashboard/lib/access";
import { resolveStoreSettings } from "@/lib/settings/registry";

// Count of tracked SKUs (simple products + variants) at or under the store's
// configured low-stock threshold — feeds the sidebar "inventory" badge.
//
// This is a store-DEFAULT approximation: per-product threshold overrides aren't
// applied here (that would need a full row scan), and there's an index on
// (store_id, stock) WHERE track_inventory for both tables. The Inventory page's
// Low / Out filters are the precise, per-SKU-accurate view.
export async function getLowStockAlertCount(): Promise<number> {
  const storeId = await getActingStoreId();
  if (!storeId) return 0;

  const supabase = await createClient();

  // Resolve the acting store's threshold (not a hardcoded default, and scoped to
  // the acting store so it's correct for platform operators too).
  const { data: store } = await supabase
    .from("stores")
    .select("settings, plan")
    .eq("id", storeId)
    .single();
  const settings = resolveStoreSettings(
    store?.settings as Record<string, unknown>,
    store?.plan,
  );
  const threshold = (settings["inventory.lowStockThreshold"] as number) ?? 5;

  const lowStockQuery = (table: "products" | "product_variants") =>
    supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("track_inventory", true)
      .lte("stock", threshold);

  const [pRes, vRes] = await Promise.all([
    lowStockQuery("products"),
    lowStockQuery("product_variants"),
  ]);

  return (pRes.count ?? 0) + (vRes.count ?? 0);
}
