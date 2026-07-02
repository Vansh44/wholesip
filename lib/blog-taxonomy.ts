// Per-store blog taxonomy (blog_categories / blog_tags tables) — replaces the
// old hardcoded PREDEFINED_CATEGORIES / PREDEFINED_TAGS lists. Blogs store
// plain names in their text[] columns, so consumers work with names; ids are
// only needed by the dashboard manager (rename/delete).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TaxonomyItem {
  id: string;
  name: string;
}

export interface BlogTaxonomy {
  categories: TaxonomyItem[];
  tags: TaxonomyItem[];
}

/**
 * Both taxonomy lists for a store, alphabetical. Works with any client
 * (reads are public under RLS); errors degrade to empty lists so a missing
 * table can never take a page down.
 */
export async function fetchBlogTaxonomy(
  supabase: SupabaseClient,
  storeId: string,
): Promise<BlogTaxonomy> {
  const [cats, tags] = await Promise.all([
    supabase
      .from("blog_categories")
      .select("id, name")
      .eq("store_id", storeId)
      .order("name", { ascending: true }),
    supabase
      .from("blog_tags")
      .select("id, name")
      .eq("store_id", storeId)
      .order("name", { ascending: true }),
  ]);
  if (cats.error)
    console.error("fetchBlogTaxonomy categories:", cats.error.message);
  if (tags.error) console.error("fetchBlogTaxonomy tags:", tags.error.message);
  return {
    categories: (cats.data ?? []) as TaxonomyItem[],
    tags: (tags.data ?? []) as TaxonomyItem[],
  };
}
