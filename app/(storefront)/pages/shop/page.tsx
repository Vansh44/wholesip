import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import ShopClient, { type ShopProduct, type ShopCategory } from "./shop-client";
import "./shop.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop | Soakd",
  description:
    "Browse the full Soakd range — wholesome, real-food products crafted with care.",
  openGraph: {
    title: "Shop | Soakd",
    description:
      "Browse the full Soakd range — wholesome, real-food products crafted with care.",
    type: "website",
  },
};

export default async function ShopPage() {
  const supabase = await createClient();

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, slug, description, category_id, base_price, selling_price, image_url, status, featured, sort_order, card_color, variants:product_variants(base_price, selling_price)",
      )
      .eq("status", "published")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("categories")
      .select("id, name, slug, sort_order")
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const shopProducts = (products ?? []) as ShopProduct[];
  const shopCategories = (categories ?? []) as ShopCategory[];

  return <ShopClient products={shopProducts} categories={shopCategories} />;
}
