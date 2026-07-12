import { requireSectionAccess, getActingStoreId } from "../lib/access";
import { DASHBOARD_PAGE_SIZE, pickPage, pickParam } from "../lib/list-params";
import {
  getInventory,
  type InventoryFilter,
} from "@/app/actions/inventory-actions";
import { createClient } from "@/lib/supabase/server";
import { InventoryManagementView } from "./inventory-management-view";
import { RealtimeRefresher } from "../components/realtime-refresher";

const INVENTORY_FILTERS: InventoryFilter[] = ["all", "low", "out"];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireSectionAccess("inventory", "view");
  const canManage = access.can("inventory", "manage");

  const sp = await searchParams;
  const page = pickPage(sp.page);
  // Raw query on purpose — getInventory searches in memory (punctuation-safe),
  // so stripping control chars here would stop names like "Fresh Orange Juice
  // (1 L)" from matching themselves.
  const q = pickParam(sp.q);
  const categoryId = pickParam(sp.category) || "all";
  const filterParam = pickParam(sp.filter) as InventoryFilter;
  const filter = INVENTORY_FILTERS.includes(filterParam) ? filterParam : "all";
  const pageSize = DASHBOARD_PAGE_SIZE;

  const supabase = await createClient();
  const storeId = await getActingStoreId();

  const [inventoryRes, { data: categories }] = await Promise.all([
    getInventory({
      page,
      pageSize,
      filter,
      q,
      categoryId: categoryId === "all" ? undefined : categoryId,
    }),
    supabase
      .from("categories")
      .select("id, name")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (inventoryRes.error) {
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load inventory
        </div>
        <p className="leading-relaxed text-destructive/80">
          {inventoryRes.error}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Live updates: stock changes the moment a checkout reserves it. */}
      <RealtimeRefresher tables={["products", "product_variants"]} />
      <InventoryManagementView
        rows={inventoryRes.rows}
        total={inventoryRes.total}
        categories={(categories ?? []) as { id: string; name: string }[]}
        canManage={canManage}
        page={page}
        pageSize={pageSize}
        query={q}
        filter={filter}
        categoryFilter={categoryId}
        storeLowStockThreshold={inventoryRes.lowStockThreshold}
      />
    </>
  );
}
