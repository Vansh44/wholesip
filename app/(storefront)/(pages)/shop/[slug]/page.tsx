import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { requireStorefrontStoreId } from "@/lib/store/resolve";
import { getStorefrontLayout } from "@/lib/store/storefront-layout";
import { getStoreBrand } from "@/lib/store/brand";
import { getOgImageUrl } from "@/lib/og-image";
import ProductDetailClient, {
  type DetailProduct,
} from "./product-detail-client";
import type { RelatedProduct } from "./related-products";
import type { ProductReview } from "./reviews-section";
import "../shop.css";

// ISR: the page render (product + related + reviews) is cached and served
// statically, revalidated periodically and on-demand via revalidatePath(slug)
// in product/review actions. Popular slugs are prerendered at build below.
export const revalidate = 300;

type PageProps = {
  params: Promise<{ slug: string }>;
};

// Wrapped in React.cache so the page body and generateMetadata share ONE query
// per render instead of fetching the same product row twice.
const getProduct = cache(
  async (slug: string, storeId: string): Promise<DetailProduct | null> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("products")
      .select(
        "id, name, slug, description, category_id, base_price, selling_price, image_url, images, status, seo_title, seo_description, category:categories(id, name, slug, status), variants:product_variants(*)",
      )
      .eq("store_id", storeId)
      .eq("slug", slug)
      .eq("status", "published")
      .single();

    if (!data) return null;

    const product = data as unknown as DetailProduct;
    product.variants = (product.variants ?? []).sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    return product;
  },
);

// This page resolves the store from the request host (requireStorefrontStoreId), so it
// renders per-store/per-request — no generateStaticParams (a slug can exist in
// more than one store). The underlying reads stay cheap via the data cache.

// Other published products in the same category (excluding the current one).
async function getRelated(
  categoryId: string | null,
  excludeId: string,
  storeId: string,
): Promise<RelatedProduct[]> {
  if (!categoryId) return [];
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("products")
    .select(
      "id, name, slug, base_price, selling_price, image_url, card_color, featured, category:categories(name), variants:product_variants(base_price, selling_price, special_price, sort_order)",
    )
    .eq("store_id", storeId)
    .eq("status", "published")
    .eq("category_id", categoryId)
    .neq("id", excludeId)
    .order("sort_order", { ascending: true })
    .limit(4);

  // Flatten the joined category to a plain name for the card eyebrow.
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const cat = row.category as { name?: string } | null;
    return { ...row, category: cat?.name ?? null } as unknown as RelatedProduct;
  });
}

// Public reviews for a product, newest first.
async function getReviews(
  productId: string,
  storeId: string,
): Promise<ProductReview[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("product_reviews")
    .select("id, user_id, author_name, rating, comment, created_at")
    .eq("store_id", storeId)
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  return (data ?? []) as ProductReview[];
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const storeId = await requireStorefrontStoreId();
  const product = await getProduct(slug, storeId);
  if (!product) return { title: "Product not found" };

  const brand = await getStoreBrand();
  // Layout templates the title as "%s | {brand}", so use the product name
  // (or its own SEO title) — never a hardcoded store name.
  const title = product.seo_title || product.name;
  const description =
    product.seo_description ||
    product.description ||
    `Shop ${product.name} at ${brand.name}.`;

  const ogImageUrl = getOgImageUrl(product.image_url);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/shop/${product.slug}`,
      type: "website",
      images: ogImageUrl
        ? [
            {
              url: ogImageUrl,
              width: 800,
              height: 420,
              alt: product.name,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImageUrl ? [ogImageUrl] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const storeId = await requireStorefrontStoreId();
  const product = await getProduct(slug, storeId);

  if (!product) {
    notFound();
  }

  const [related, reviews, layout] = await Promise.all([
    getRelated(product.category_id, product.id, storeId),
    getReviews(product.id, storeId),
    getStorefrontLayout(),
  ]);

  return (
    <ProductDetailClient
      product={product}
      related={related}
      reviews={reviews}
      grocery={layout.storefront === "grocery"}
    />
  );
}
