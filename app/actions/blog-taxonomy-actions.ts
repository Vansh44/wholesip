"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TAGS } from "@/lib/storefront/tags";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";

// ---------------------------------------------------------------------------
// Per-store blog categories & tags (blog_categories / blog_tags tables).
// Managed from /dashboard/blogs/settings. Blogs store plain NAMES in their
// text[] columns (blogs.categories / blogs.tags), so rename/delete propagates
// the change into every affected blog row — the taxonomy tables stay the
// single source of truth for what the editors offer.
// ---------------------------------------------------------------------------

export type TaxonomyKind = "category" | "tag";

export interface ActionResult {
  success?: boolean;
  error?: string;
}

const TABLE: Record<TaxonomyKind, "blog_categories" | "blog_tags"> = {
  category: "blog_categories",
  tag: "blog_tags",
};

// The blogs text[] column that carries this kind's values.
const BLOG_COLUMN: Record<TaxonomyKind, "categories" | "tags"> = {
  category: "categories",
  tag: "tags",
};

const MAX_NAME_LENGTH = 40;

// Postgres unique_violation — the (store_id, lower(name)) unique index.
const UNIQUE_VIOLATION = "23505";

function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function validateName(kind: TaxonomyKind, name: string): string | null {
  if (!name)
    return `${kind === "category" ? "Category" : "Tag"} name is required.`;
  if (name.length > MAX_NAME_LENGTH)
    return `Keep names under ${MAX_NAME_LENGTH} characters.`;
  return null;
}

function duplicateError(name: string): string {
  return `"${name}" already exists.`;
}

function revalidateTaxonomy() {
  revalidatePath("/dashboard/blogs");
  revalidatePath("/blogs");
  revalidatePath("/blogs/write");
  // Blog rows may have been rewritten (rename/delete propagation) and the
  // storefront caches both the option lists and the blog cards.
  revalidateTag(TAGS.blogs, "max");
  revalidateTag(TAGS.blogTaxonomy, "max");
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Rewrite the blogs that reference `oldName` in the kind's text[] column:
 * rename it to `newName`, or remove it when `newName` is null. Store-scoped;
 * runs under the admin's session so RLS still applies.
 */
async function propagateToBlogs(
  supabase: SupabaseClient,
  storeId: string,
  kind: TaxonomyKind,
  oldName: string,
  newName: string | null,
): Promise<void> {
  const column = BLOG_COLUMN[kind];
  const { data, error } = await supabase
    .from("blogs")
    .select(`id, ${column}`)
    .eq("store_id", storeId)
    .contains(column, [oldName]);
  if (error) {
    console.error("propagateToBlogs select:", error.message);
    return;
  }

  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const current = (row[column] ?? []) as string[];
    const next = newName
      ? [...new Set(current.map((v) => (v === oldName ? newName : v)))]
      : current.filter((v) => v !== oldName);
    const { error: updateError } = await supabase
      .from("blogs")
      .update({ [column]: next })
      .eq("id", row.id as string);
    if (updateError)
      console.error("propagateToBlogs update:", updateError.message);
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createBlogTaxonomyItem(
  kind: TaxonomyKind,
  rawName: string,
): Promise<ActionResult> {
  const userId = await getManagerUserId("blogs");
  if (!userId) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();

  const name = normalizeName(rawName);
  const invalid = validateName(kind, name);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABLE[kind])
    .insert({ store_id: storeId, name });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: duplicateError(name) };
    console.error("createBlogTaxonomyItem error:", error);
    return { error: error.message };
  }

  revalidateTaxonomy();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Rename — also rewrites the name inside every blog that uses it.
// ---------------------------------------------------------------------------

export async function renameBlogTaxonomyItem(
  kind: TaxonomyKind,
  id: string,
  rawName: string,
): Promise<ActionResult> {
  const userId = await getManagerUserId("blogs");
  if (!userId) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();

  const name = normalizeName(rawName);
  const invalid = validateName(kind, name);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from(TABLE[kind])
    .select("name")
    .eq("id", id)
    .eq("store_id", storeId)
    .single();
  if (!existing) return { error: "Not found. Please refresh and try again." };
  if (existing.name === name) return { success: true };

  const { error } = await supabase
    .from(TABLE[kind])
    .update({ name })
    .eq("id", id)
    .eq("store_id", storeId);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: duplicateError(name) };
    console.error("renameBlogTaxonomyItem error:", error);
    return { error: error.message };
  }

  await propagateToBlogs(supabase, storeId, kind, existing.name, name);
  revalidateTaxonomy();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete — also removes the name from every blog that uses it. Blogs keep
// their other categories/tags; posts never get deleted by a taxonomy change.
// ---------------------------------------------------------------------------

export async function deleteBlogTaxonomyItem(
  kind: TaxonomyKind,
  id: string,
): Promise<ActionResult> {
  const userId = await getManagerUserId("blogs");
  if (!userId) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from(TABLE[kind])
    .select("name")
    .eq("id", id)
    .eq("store_id", storeId)
    .single();
  if (!existing) return { error: "Not found. Please refresh and try again." };

  const { error } = await supabase
    .from(TABLE[kind])
    .delete()
    .eq("id", id)
    .eq("store_id", storeId);

  if (error) {
    console.error("deleteBlogTaxonomyItem error:", error);
    return { error: error.message };
  }

  await propagateToBlogs(supabase, storeId, kind, existing.name, null);
  revalidateTaxonomy();
  return { success: true };
}
