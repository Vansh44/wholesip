import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductsManagementView } from "./products-management-view";

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  base_price: number;
  selling_price: number;
  stock: number;
  sku: string | null;
  sort_order: number;
  created_at: string;
}

export interface ProductCategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  base_price: number;
  selling_price: number;
  image_url: string | null;
  images: string[];
  status: "draft" | "published";
  featured: boolean;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  category: ProductCategoryRef | null;
  variants: ProductVariant[];
}

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  status: "active" | "hidden";
}

export default async function ProductsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [{ data: products, error }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "*, category:categories(id, name, slug), variants:product_variants(*)",
      )
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("categories")
      .select("id, name, slug, status")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (error) {
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load products
        </div>
        <p className="leading-relaxed text-destructive/80">
          Make sure the <code>products</code>, <code>categories</code> and{" "}
          <code>product_variants</code> tables exist and you have the correct
          permissions.
        </p>
      </div>
    );
  }

  // Sort variants by their own order for a stable display.
  const list = (products ?? []) as Product[];
  for (const p of list) {
    p.variants = (p.variants ?? []).sort((a, b) => a.sort_order - b.sort_order);
  }

  return (
    <ProductsManagementView
      products={list}
      categories={(categories ?? []) as CategoryOption[]}
    />
  );
}
