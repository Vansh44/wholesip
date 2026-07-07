"use server";

import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";
import { DASHBOARD_PAGE_SIZE } from "@/app/dashboard/lib/list-params";
import { TAGS } from "@/lib/storefront/tags";
import { resolveStoreSettings } from "@/lib/settings/registry";
import { inventoryStatus } from "@/lib/inventory/status";

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
}): Promise<{
  rows: SkuRow[];
  total: number;
  lowStockThreshold: number;
  error?: string;
}> {
  const userId = await getManagerUserId("inventory");
  if (!userId)
    return {
      rows: [],
      total: 0,
      lowStockThreshold: 5,
      error: "Not authenticated",
    };

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

  // NOTE: search (q) is applied in-memory below, NOT as a PostgREST `.or()`
  // filter. This action already fetches every row for the store and paginates
  // in memory, and a raw `.or()` string breaks on product names with PostgREST
  // control characters — e.g. "Fresh Orange Juice (1 L)" makes the parentheses
  // part of the filter grammar → "failed to parse logic tree". In-memory
  // matching is punctuation-safe and injection-proof (no string is ever
  // interpolated into a filter).

  const [productsRes, variantsRes] = await Promise.all([
    productsQuery,
    variantsQuery,
  ]);

  if (productsRes.error)
    return {
      rows: [],
      total: 0,
      lowStockThreshold: defaultLowThreshold,
      error: productsRes.error.message,
    };
  if (variantsRes.error)
    return {
      rows: [],
      total: 0,
      lowStockThreshold: defaultLowThreshold,
      error: variantsRes.error.message,
    };

  // Identify simple products by finding products that have no variants
  const variantProductIds = new Set(variantsRes.data.map((v) => v.product_id));
  const simpleProducts = productsRes.data.filter(
    (p) => !variantProductIds.has(p.id),
  );

  let allRows: SkuRow[] = [];

  for (const p of simpleProducts) {
    const status = inventoryStatus(p, defaultLowThreshold);

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
    const status = inventoryStatus(v, defaultLowThreshold);

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

  // Search — in-memory match on product name, variant name, or SKU. Safe for any
  // punctuation the merchant uses in names (see the note above).
  const term = q.trim().toLowerCase().slice(0, 200);
  if (term) {
    allRows = allRows.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        (r.variantName?.toLowerCase().includes(term) ?? false) ||
        (r.sku?.toLowerCase().includes(term) ?? false),
    );
  }

  // Status filter
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

  return { rows, total, lowStockThreshold: defaultLowThreshold };
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

// Guard against an unbounded fan-out of concurrent RPCs (the UI only ever sends
// the selected visible rows, ≤ one page).
const MAX_BULK_ITEMS = 500;

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
  if (items.length === 0) return { success: true };
  if (items.length > MAX_BULK_ITEMS) return { error: "Too many items." };

  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  // "Set" items need each SKU's current balance to compute a delta. Batch-read
  // them in ONE query per table instead of a round-trip per item (the previous
  // implementation went through setStock → a SELECT + an RPC + a cache bust for
  // every single item).
  const setItems = items.filter((i) => i.set !== undefined);
  const currentStock = new Map<string, number>(); // key: variantId || productId
  if (setItems.length > 0) {
    const productIds = setItems
      .filter((i) => !i.variantId)
      .map((i) => i.productId);
    const variantIds = setItems
      .filter((i) => i.variantId)
      .map((i) => i.variantId!);
    const [prodRes, varRes] = await Promise.all([
      productIds.length
        ? admin
            .from("products")
            .select("id, stock")
            .eq("store_id", storeId)
            .in("id", productIds)
        : Promise.resolve({ data: [], error: null }),
      variantIds.length
        ? admin
            .from("product_variants")
            .select("id, stock")
            .eq("store_id", storeId)
            .in("id", variantIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (prodRes.error) return { error: prodRes.error.message };
    if (varRes.error) return { error: varRes.error.message };
    for (const r of prodRes.data ?? []) currentStock.set(r.id, r.stock);
    for (const r of varRes.data ?? []) currentStock.set(r.id, r.stock);
  }

  // Resolve each item to a concrete delta, skipping no-ops and unknown SKUs.
  const ops: { item: (typeof items)[number]; delta: number; reason: string }[] =
    [];
  for (const item of items) {
    if (item.set !== undefined) {
      const current = currentStock.get(item.variantId || item.productId);
      if (current === undefined) continue; // not found / not this store
      const delta = item.set - current;
      if (delta !== 0) ops.push({ item, delta, reason: "correction" });
    } else if (item.delta !== undefined && item.delta !== 0) {
      ops.push({ item, delta: item.delta, reason: "adjustment" });
    }
  }

  if (ops.length === 0) return { success: true };

  // Fire the atomic RPCs concurrently (each is an independent, row-locked UPDATE
  // on a distinct SKU) rather than sequentially.
  const results = await Promise.all(
    ops.map((op) =>
      admin.rpc("adjust_stock", {
        p_store: storeId,
        p_product: op.item.productId,
        p_variant: op.item.variantId || null,
        p_delta: op.delta,
        p_reason: op.reason,
        p_note: "Bulk update",
        p_actor: userId,
      }),
    ),
  );

  // Bust the shared product cache ONCE for the whole batch, not per item. Some
  // ops may have succeeded even if one failed, so revalidate regardless.
  revalidateTag(TAGS.products, "max");

  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
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
