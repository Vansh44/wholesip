import { createClient } from "@/lib/supabase/server";
import { requireSectionAccess, getActingStoreId } from "../lib/access";
import { listPages, ensureHomepage } from "@/app/actions/page-actions";
import { getStoreBrand } from "@/lib/store/brand";
import { BuilderClient } from "./builder-client";
import type { BlogOption, CategoryOption, ProductOption } from "./section-form";
import "./builder.css";

// The website builder is a full-viewport experience opened in a new tab. It
// still lives under /dashboard so the proxy auth gate applies.
export default async function BuilderPage() {
  await requireSectionAccess("builder", "view");

  const supabase = await createClient();
  const storeId = await getActingStoreId();

  const [
    homepage,
    pages,
    { data: products },
    { data: categories },
    { data: blogs },
    brand,
  ] = await Promise.all([
    ensureHomepage(),
    listPages(),
    supabase
      .from("products")
      .select("id, name, slug, image_url, featured")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name, slug, image_url")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("blogs")
      .select("id, title, slug")
      .eq("store_id", storeId)
      .eq("status", "published")
      .order("published_at", { ascending: false }),
    getStoreBrand(),
  ]);

  const blogOptions: BlogOption[] = (blogs ?? []).map(
    (b: { id: string; title: string; slug: string }) => ({
      id: b.id,
      name: b.title,
      slug: b.slug,
    }),
  );

  // The homepage sentinel (slug "") is pinned first in the builder; listPages
  // excludes it, so prepend it explicitly.
  const initialPages = homepage ? [homepage, ...pages] : pages;

  return (
    <BuilderClient
      initialPages={initialPages}
      products={(products ?? []) as ProductOption[]}
      categories={(categories ?? []) as CategoryOption[]}
      blogs={blogOptions}
      storeName={brand.name}
    />
  );
}
