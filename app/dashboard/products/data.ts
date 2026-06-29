import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActingStoreId } from "@/app/dashboard/lib/access";
import type { Product, CategoryOption, CardColorOption } from "./page";

/**
 * Everything the product editor needs for one product: the product (with its
 * category + variants) plus the category and card-colour option lists. Returns
 * null if the product doesn't exist. Mirrors the list page's query so RLS
 * (admins can read) behaves identically.
 */
export async function getProductEditData(id: string): Promise<{
  product: Product;
  categories: CategoryOption[];
  colors: CardColorOption[];
} | null> {
  const supabase = await createClient();
  const storeId = await getActingStoreId();

  const [{ data: product }, { data: categories }, { data: colors }] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "*, category:categories(id, name, slug), variants:product_variants(*)",
        )
        .eq("id", id)
        .eq("store_id", storeId)
        .single(),
      supabase
        .from("categories")
        .select("id, name, slug, status")
        .eq("store_id", storeId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("card_colors")
        .select("id, name, hex")
        .eq("store_id", storeId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

  if (!product) return null;

  const p = product as Product;
  p.variants = (p.variants ?? []).sort((a, b) => a.sort_order - b.sort_order);

  return {
    product: p,
    categories: (categories ?? []) as CategoryOption[],
    colors: (colors ?? []) as CardColorOption[],
  };
}
