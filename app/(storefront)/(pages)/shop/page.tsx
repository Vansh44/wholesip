import type { Metadata } from "next";
import {
  getPublishedProducts,
  getActiveCategories,
} from "@/lib/storefront/queries";
import { getCurrentStoreId } from "@/lib/store/resolve";
import ShopClient, { type ShopProduct, type ShopCategory } from "./shop-client";
import "./shop.css";

export const metadata: Metadata = {
  title: "Shop | WholeSip",
  description:
    "Browse the full WholeSip range — wholesome, real-food products crafted with care.",
  openGraph: {
    title: "Shop | WholeSip",
    description:
      "Browse the full WholeSip range — wholesome, real-food products crafted with care.",
    url: "/shop",
    type: "website",
  },
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category: initialCategorySlug } = await searchParams;
  const storeId = await getCurrentStoreId();

  const [products, categories] = await Promise.all([
    getPublishedProducts(storeId),
    getActiveCategories(storeId),
  ]);

  const shopProducts = products as unknown as ShopProduct[];
  const shopCategories = categories as unknown as ShopCategory[];

  return (
    <ShopClient
      products={shopProducts}
      categories={shopCategories}
      initialCategorySlug={initialCategorySlug}
    />
  );
}
