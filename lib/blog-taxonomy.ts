// Per-store blog taxonomy (blog_categories / blog_tags tables) — replaces the
// old hardcoded PREDEFINED_CATEGORIES / PREDEFINED_TAGS lists. Blogs store
// plain names in their text[] columns, so consumers work with names; ids are
// only needed by the dashboard manager (rename/delete).
import { asc, eq } from "drizzle-orm";
import { withAnon } from "@/lib/db/client";
import { blogCategories, blogTags } from "@/drizzle/schema";

export interface TaxonomyItem {
  id: string;
  name: string;
}

export interface BlogTaxonomy {
  categories: TaxonomyItem[];
  tags: TaxonomyItem[];
}

/**
 * Both taxonomy lists for a store, alphabetical. Reads are public under RLS
 * (anonymous scope); errors degrade to empty lists so a missing table can
 * never take a page down.
 */
export async function fetchBlogTaxonomy(
  storeId: string,
): Promise<BlogTaxonomy> {
  try {
    return await withAnon(async (db) => {
      const [categories, tags] = await Promise.all([
        db
          .select({ id: blogCategories.id, name: blogCategories.name })
          .from(blogCategories)
          .where(eq(blogCategories.storeId, storeId))
          .orderBy(asc(blogCategories.name)),
        db
          .select({ id: blogTags.id, name: blogTags.name })
          .from(blogTags)
          .where(eq(blogTags.storeId, storeId))
          .orderBy(asc(blogTags.name)),
      ]);
      return { categories, tags };
    });
  } catch (err) {
    console.error(
      "fetchBlogTaxonomy:",
      err instanceof Error ? err.message : err,
    );
    return { categories: [], tags: [] };
  }
}
