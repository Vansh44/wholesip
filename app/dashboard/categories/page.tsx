import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: categories, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

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

  // Count products per category (one grouped query).
  const list = (categories ?? []) as Category[];
  const { data: products } = await supabase
    .from("products")
    .select("category_id");

  const counts = new Map<string, number>();
  for (const p of products ?? []) {
    if (p.category_id) {
      counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
    }
  }
  for (const c of list) {
    c.product_count = counts.get(c.id) ?? 0;
  }

  return <CategoriesManagementView categories={list} />;
}
