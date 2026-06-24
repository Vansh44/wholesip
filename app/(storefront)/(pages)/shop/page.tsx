import type { Metadata } from "next";
import {
  getPublishedProducts,
  getActiveCategories,
} from "@/lib/storefront/queries";
import ShopClient, { type ShopProduct, type ShopCategory } from "./shop-client";
import "./shop.css";

export const metadata: Metadata = {
  title: "Shop | Soakd",
  description:
    "Browse the full Soakd range — wholesome, real-food products crafted with care.",
  openGraph: {
    title: "Shop | Soakd",
    description:
      "Browse the full Soakd range — wholesome, real-food products crafted with care.",
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

  const [products, categories] = await Promise.all([
    getPublishedProducts(),
    getActiveCategories(),
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
