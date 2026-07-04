import type { Metadata } from "next";
import {
  getPublishedProducts,
  getActiveCategories,
} from "@/lib/storefront/queries";
import { requireStorefrontStoreId } from "@/lib/store/resolve";
import { getStorefrontLayout } from "@/lib/store/storefront-layout";
import { getStoreBrand } from "@/lib/store/brand";
import ShopClient, { type ShopProduct, type ShopCategory } from "./shop-client";
import "./shop.css";

// Per-store metadata — the layout templates the title as "%s | {brand}", so
// this returns just "Shop" and a brand-aware description (never WholeSip).
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getStoreBrand();
  const description = `Browse the full ${brand.name} range.`;
  return {
    title: "Shop",
    description,
    openGraph: {
      title: `Shop | ${brand.name}`,
      description,
      url: "/shop",
      type: "website",
    },
  };
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category: initialCategorySlug, q: initialQuery } = await searchParams;
  const storeId = await requireStorefrontStoreId();

  const [products, categories, layout] = await Promise.all([
    getPublishedProducts(storeId),
    getActiveCategories(storeId),
    getStorefrontLayout(),
  ]);

  const shopProducts = products as unknown as ShopProduct[];
  const shopCategories = categories as unknown as ShopCategory[];

  return (
    <ShopClient
      products={shopProducts}
      categories={shopCategories}
      initialCategorySlug={initialCategorySlug}
      initialQuery={initialQuery}
      grocery={layout.storefront === "grocery"}
    />
  );
}
