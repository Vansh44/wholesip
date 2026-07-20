import { and, count, eq, lte } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { productVariants, products, stores } from "@/drizzle/schema";
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

  try {
    return await withService(async (db) => {
      // Resolve the acting store's threshold (scoped to the acting store so
      // it's correct for platform operators too).
      const storeRows = await db
        .select({ settings: stores.settings, plan: stores.plan })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);
      const settings = resolveStoreSettings(
        storeRows[0]?.settings as Record<string, unknown>,
        storeRows[0]?.plan,
      );
      const threshold =
        (settings["inventory.lowStockThreshold"] as number) ?? 5;

      const [pRows, vRows] = await Promise.all([
        db
          .select({ n: count() })
          .from(products)
          .where(
            and(
              eq(products.storeId, storeId),
              eq(products.trackInventory, true),
              lte(products.stock, threshold),
            ),
          ),
        db
          .select({ n: count() })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.storeId, storeId),
              eq(productVariants.trackInventory, true),
              lte(productVariants.stock, threshold),
            ),
          ),
      ]);

      return (pRows[0]?.n ?? 0) + (vRows[0]?.n ?? 0);
    });
  } catch (err) {
    console.error(
      "getLowStockAlertCount:",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}
