import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActingStoreId } from "@/app/dashboard/lib/access";
import type {
  Product,
  CategoryOption,
  CardColorOption,
  TaxClassOption,
} from "./page";

/**
 * Everything the product editor needs for one product: the product (with its
 * category + variants) plus the category, card-colour and tax-class option
 * lists. Returns null if the product doesn't exist. Mirrors the list page's
 * query so RLS (admins can read) behaves identically.
 */
export async function getProductEditData(id: string): Promise<{
  product: Product;
  categories: CategoryOption[];
  colors: CardColorOption[];
  taxClasses: TaxClassOption[];
} | null> {
  const supabase = await createClient();
  const storeId = await getActingStoreId();

  const [
    { data: product, error: productError },
    { data: categories },
    { data: colors },
    { data: taxClasses },
  ] = await Promise.all([
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
    supabase
      .from("tax_classes")
      .select("id, name, rate")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (!product) {
    // Don't swallow the reason: a null here renders a 404. If the row exists
    // (it usually does), the culprit is almost always the authenticated read
    // being rejected (e.g. an ES256 session token PostgREST won't verify) or a
    // store_id mismatch — both of which this log makes obvious.
    console.error(
      `getProductEditData: no product for id=${id} store=${storeId}`,
      productError?.message ?? "(no error — 0 rows matched)",
    );
    return null;
  }

  const p = product as Product;
  p.variants = (p.variants ?? []).sort((a, b) => a.sort_order - b.sort_order);

  return {
    product: p,
    categories: (categories ?? []) as CategoryOption[],
    colors: (colors ?? []) as CardColorOption[],
    taxClasses: (taxClasses ?? []) as TaxClassOption[],
  };
}
