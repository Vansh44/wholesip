import { createClient } from "@/lib/supabase/server";
import { requireSectionAccess, getActingStoreId } from "../lib/access";
import { CategoriesManagementView } from "./categories-management-view";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  status: "active" | "hidden";
  created_at: string;
  updated_at: string;
  // Joined / derived
  product_count?: number;
}

export default async function CategoriesPage() {
  const access = await requireSectionAccess("categories", "view");
  const canManage = access.can("categories", "manage");

  const supabase = await createClient();
  const storeId = await getActingStoreId();

  // Categories + grouped product counts in parallel. Counts are tallied in
  // Postgres (product_counts_by_category RPC) instead of pulling every product
  // row into Node to count by hand.
  const [{ data: categories, error }, { data: countRows }] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase.rpc("product_counts_by_category", { p_store_id: storeId }),
  ]);

  if (error) {
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load categories
        </div>
        <p className="leading-relaxed text-destructive/80">
          Make sure the <code>categories</code> table exists and you have the
          correct permissions.
        </p>
      </div>
    );
  }

  const list = (categories ?? []) as Category[];
  const counts = new Map<string, number>();
  for (const row of (countRows ?? []) as {
    category_id: string;
    cnt: number;
  }[]) {
    if (row.category_id) counts.set(row.category_id, Number(row.cnt));
  }
  for (const c of list) {
    c.product_count = counts.get(c.id) ?? 0;
  }

  return <CategoriesManagementView categories={list} canManage={canManage} />;
}
