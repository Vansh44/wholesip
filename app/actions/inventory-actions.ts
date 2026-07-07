"use server";

import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";
import { DASHBOARD_PAGE_SIZE, ilikeOr } from "@/app/dashboard/lib/list-params";
import { TAGS } from "@/lib/storefront/tags";
import { resolveStoreSettings } from "@/lib/settings/registry";

export interface SkuRow {
  id: string; // "p-uuid" or "v-uuid"
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  sku: string | null;
  stock: number;
  trackInventory: boolean;
  lowStockThreshold: number | null;
  allowBackorder: boolean;
  status: "in" | "low" | "out" | "untracked";
  category: string | null;
  image: string | null;
}

export type InventoryFilter = "all" | "low" | "out";

export interface StockMovementRow {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
  order_id: string | null;
}

export async function getInventory({
  page = 1,
  pageSize = DASHBOARD_PAGE_SIZE,
  filter = "all",
  q = "",
  categoryId,
}: {
  page?: number;
  pageSize?: number;
  filter?: InventoryFilter;
  q?: string;
  categoryId?: string;
}): Promise<{ rows: SkuRow[]; total: number; error?: string }> {
  const userId = await getManagerUserId("inventory");
  if (!userId) return { rows: [], total: 0, error: "Not authenticated" };

  const storeId = await getActingStoreId();
  const supabase = await createClient();

  // We need the store's default low stock threshold
  const { data: store } = await supabase
    .from("stores")
    .select("settings, plan")
    .eq("id", storeId)
    .single();
  const settings = resolveStoreSettings(
    store?.settings as Record<string, unknown>,
    store?.plan,
  );
  const defaultLowThreshold =
    (settings["inventory.lowStockThreshold"] as number) ?? 5;

  // We need to fetch simple products (products without variants) and product variants.
  // Instead of complex UNIONs via postgrest, we'll fetch both, combine in memory, sort and paginate.
  // This is safe since we have ilike and category filters. For very large stores this might need
  // a custom RPC or materialized view, but this matches the Phase 1 scope.

  let productsQuery = supabase
    .from("products")
    .select("*, category:categories(name)");

  let variantsQuery = supabase
    .from("product_variants")
    .select("*, product:products!inner(*, category:categories(name))");

  productsQuery = productsQuery.eq("store_id", storeId);
  variantsQuery = variantsQuery.eq("store_id", storeId);

  if (categoryId && categoryId !== "all") {
    productsQuery = productsQuery.eq("category_id", categoryId);
    variantsQuery = variantsQuery.eq("product.category_id", categoryId);
  }

  if (q) {
    productsQuery = productsQuery.or(ilikeOr(["name", "sku"], q));
    variantsQuery = variantsQuery.or(
      `name.ilike.%${q}%,sku.ilike.%${q}%,product.name.ilike.%${q}%`,
    );
  }

  const [productsRes, variantsRes] = await Promise.all([
    productsQuery,
    variantsQuery,
  ]);

  if (productsRes.error)
    return { rows: [], total: 0, error: productsRes.error.message };
  if (variantsRes.error)
    return { rows: [], total: 0, error: variantsRes.error.message };

  // Identify simple products by finding products that have no variants
  const variantProductIds = new Set(variantsRes.data.map((v) => v.product_id));
  const simpleProducts = productsRes.data.filter(
    (p) => !variantProductIds.has(p.id),
  );

  let allRows: SkuRow[] = [];

  for (const p of simpleProducts) {
    const threshold = p.low_stock_threshold ?? defaultLowThreshold;
    const isUntracked = !p.track_inventory;
    const isOut = p.stock <= 0;
    const isLow = p.stock <= threshold;
    const status = isUntracked
      ? "untracked"
      : isOut
        ? "out"
        : isLow
          ? "low"
          : "in";

    allRows.push({
      id: `p-${p.id}`,
      productId: p.id,
      variantId: null,
      name: p.name,
      variantName: null,
      sku: p.sku,
      stock: p.stock,
      trackInventory: p.track_inventory,
      lowStockThreshold: p.low_stock_threshold,
      allowBackorder: p.allow_backorder,
      status,
      category: p.category?.name ?? null,
      image: p.image_url ?? p.images?.[0] ?? null,
    });
  }

  for (const v of variantsRes.data) {
    const threshold = v.low_stock_threshold ?? defaultLowThreshold;
    const isUntracked = !v.track_inventory;
    const isOut = v.stock <= 0;
    const isLow = v.stock <= threshold;
    const status = isUntracked
      ? "untracked"
      : isOut
        ? "out"
        : isLow
          ? "low"
          : "in";

    allRows.push({
      id: `v-${v.id}`,
      productId: v.product_id,
      variantId: v.id,
      name: v.product.name,
      variantName: v.name,
      sku: v.sku,
      stock: v.stock,
      trackInventory: v.track_inventory,
      lowStockThreshold: v.low_stock_threshold,
      allowBackorder: v.allow_backorder,
      category: v.product.category?.name ?? null,
      image: v.image_url ?? v.images?.[0] ?? v.product.image_url ?? null,
      status,
    });
  }

  // Filter
  if (filter === "low") allRows = allRows.filter((r) => r.status === "low");
  if (filter === "out") allRows = allRows.filter((r) => r.status === "out");

  // Sort: stock ASC (lowest first), then name
  allRows.sort((a, b) => {
    if (a.stock !== b.stock) return a.stock - b.stock;
    return a.name.localeCompare(b.name);
  });

  const total = allRows.length;
  const p = page || 1;
  const start = (p - 1) * pageSize;
  const rows = allRows.slice(start, start + pageSize);

  return { rows, total };
}

export async function adjustStock(
  productId: string,
  variantId: string | null | undefined,
  delta: number,
  reason: string = "adjustment",
  note?: string,
): Promise<{ success?: boolean; newStock?: number; error?: string }> {
  const userId = await getManagerUserId("inventory");
  if (!userId) return { error: "Not authenticated" };

  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("adjust_stock", {
    p_store: storeId,
    p_product: productId,
    p_variant: variantId || null,
    p_delta: delta,
    p_reason: reason,
    p_note: note || null,
    p_actor: userId,
  });

  if (error) return { error: error.message };

  revalidateTag(TAGS.products, "max");
  return { success: true, newStock: data as number };
}

export async function setStock(
  productId: string,
  variantId: string | null | undefined,
  quantity: number,
  note?: string,
): Promise<{ success?: boolean; newStock?: number; error?: string }> {
  const userId = await getManagerUserId("inventory");
  if (!userId) return { error: "Not authenticated" };

  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  // First fetch current stock to compute delta
  const table = variantId ? "product_variants" : "products";
  const id = variantId || productId;

  const { data: row, error: fetchError } = await admin
    .from(table)
    .select("stock")
    .eq("id", id)
    .eq("store_id", storeId)
    .single();

  if (fetchError) return { error: fetchError.message };

  const currentStock = row.stock;
  const delta = quantity - currentStock;

  if (delta === 0) return { success: true, newStock: currentStock };

  return adjustStock(productId, variantId, delta, "correction", note);
}

export async function bulkAdjust(
  items: {
    productId: string;
    variantId?: string;
    delta?: number;
    set?: number;
  }[],
): Promise<{ success?: boolean; error?: string }> {
  const userId = await getManagerUserId("inventory");
  if (!userId) return { error: "Not authenticated" };

  for (const item of items) {
    if (item.set !== undefined) {
      const res = await setStock(
        item.productId,
        item.variantId,
        item.set,
        "bulk update",
      );
      if (res.error) return { error: res.error };
    } else if (item.delta !== undefined) {
      const res = await adjustStock(
        item.productId,
        item.variantId,
        item.delta,
        "bulk update",
      );
      if (res.error) return { error: res.error };
    }
  }

  return { success: true };
}

export async function getMovements(
  productId: string,
  variantId?: string | null,
  page: number = 1,
): Promise<{ movements: StockMovementRow[]; total: number; error?: string }> {
  const userId = await getManagerUserId("inventory");
  if (!userId) return { movements: [], total: 0, error: "Not authenticated" };

  const storeId = await getActingStoreId();
  const supabase = await createClient();

  let query = supabase
    .from("stock_movements")
    .select("*", { count: "exact" })
    .eq("store_id", storeId)
    .eq("product_id", productId);

  if (variantId) {
    query = query.eq("variant_id", variantId);
  } else if (variantId === null) {
    query = query.is("variant_id", null);
  }

  const p = page || 1;
  const pageSize = DASHBOARD_PAGE_SIZE;
  const start = (p - 1) * pageSize;

  query = query
    .order("created_at", { ascending: false })
    .range(start, start + pageSize - 1);

  const { data, count, error } = await query;
  if (error) return { movements: [], total: 0, error: error.message };

  return { movements: (data as StockMovementRow[]) || [], total: count || 0 };
}
