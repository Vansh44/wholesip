import { createClient } from "@/lib/supabase/server";
import { getActingStoreId } from "@/app/dashboard/lib/access";

export async function getLowStockAlertCount(): Promise<number> {
  const storeId = await getActingStoreId();
  if (!storeId) return 0;

  const supabase = await createClient();

  // A very lightweight query. Since track_inventory defaults to true for variants
  // and false for simple products, and we have an index on (store_id, stock) WHERE track_inventory,
  // we can do a quick check. Wait, we don't have a materialized count so we'll just query
  // products and product_variants that are low stock. For Phase 2 we just do a quick fetch.
  // Actually, we can just use the RPC or a simple query.

  // For products:
  const pQuery = supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("track_inventory", true)
    .lte("stock", 5); // Simplification: we use 5 as a hardcoded fallback here or just stock <= 0 for alerts

  const vQuery = supabase
    .from("product_variants")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("track_inventory", true)
    .lte("stock", 5);

  const [pRes, vRes] = await Promise.all([pQuery, vQuery]);

  return (pRes.count ?? 0) + (vRes.count ?? 0);
}
