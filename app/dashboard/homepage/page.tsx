import { createClient } from "@/lib/supabase/server";
import { requireSectionAccess, getActingStoreId } from "../lib/access";
import { HomepageManagementView } from "./homepage-management-view";
import type { HomepageSection } from "@/lib/homepage/section-types";

export type { HomepageSection };

// Minimal product/category option rows used by the editor's pickers and the
// list-row summaries.
export interface ProductOption {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  featured: boolean;
}

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
}

// Published-blog options for the "Blog Posts" section's hand-picked picker.
export interface BlogOption {
  id: string;
  name: string; // blog title, named `name` so it fits the shared OrderedPicker
  slug: string;
}

export default async function HomepagePage() {
  const access = await requireSectionAccess("homepage", "view");
  const canManage = access.can("homepage", "manage");

  const supabase = await createClient();
  const storeId = await getActingStoreId();

  const [
    { data: sections, error },
    { data: products },
    { data: categories },
    { data: blogs },
  ] = await Promise.all([
    supabase
      .from("homepage_sections")
      .select("*")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true }),
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
  ]);

  const blogOptions: BlogOption[] = (blogs ?? []).map(
    (b: { id: string; title: string; slug: string }) => ({
      id: b.id,
      name: b.title,
      slug: b.slug,
    }),
  );

  if (error) {
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load homepage sections
        </div>
        <p className="leading-relaxed text-destructive/80">
          Make sure the <code>homepage_sections</code> table exists (apply{" "}
          <code>supabase/homepage_sections.sql</code>) and you have the correct
          permissions.
        </p>
      </div>
    );
  }

  return (
    <HomepageManagementView
      sections={(sections ?? []) as HomepageSection[]}
      products={(products ?? []) as ProductOption[]}
      categories={(categories ?? []) as CategoryOption[]}
      blogs={blogOptions}
      canManage={canManage}
    />
  );
}
