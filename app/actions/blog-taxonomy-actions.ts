"use server";

import { and, arrayContains, eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { withUser, type UserIdentity } from "@/lib/db/client";
import { isUniqueViolation, dbErrorMessage } from "@/lib/db/errors";
import { blogCategories, blogTags, blogs } from "@/drizzle/schema";
import { TAGS } from "@/lib/storefront/tags";
import {
  getManagerIdentity,
  getActingStoreId,
} from "@/app/dashboard/lib/access";

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

const TABLE = {
  category: blogCategories,
  tag: blogTags,
} as const;

// The blogs text[] column that carries this kind's values.
const BLOG_COLUMN = {
  category: blogs.categories,
  tag: blogs.tags,
} as const;

const MAX_NAME_LENGTH = 40;

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

/**
 * Rewrite the blogs that reference `oldName` in the kind's text[] column:
 * rename it to `newName`, or remove it when `newName` is null. Store-scoped;
 * runs under the admin's identity so RLS still applies.
 */
async function propagateToBlogs(
  admin: UserIdentity,
  storeId: string,
  kind: TaxonomyKind,
  oldName: string,
  newName: string | null,
): Promise<void> {
  const column = BLOG_COLUMN[kind];
  let rows: { id: string; values: string[] | null }[];
  try {
    rows = await withUser(admin, (db) =>
      db
        .select({ id: blogs.id, values: column })
        .from(blogs)
        .where(
          and(eq(blogs.storeId, storeId), arrayContains(column, [oldName])),
        ),
    );
  } catch (err) {
    console.error(
      "propagateToBlogs select:",
      err instanceof Error ? err.message : err,
    );
    return;
  }

  for (const row of rows) {
    const current = row.values ?? [];
    const next = newName
      ? [...new Set(current.map((v) => (v === oldName ? newName : v)))]
      : current.filter((v) => v !== oldName);
    try {
      await withUser(admin, (db) =>
        db
          .update(blogs)
          .set(kind === "category" ? { categories: next } : { tags: next })
          .where(eq(blogs.id, row.id)),
      );
    } catch (err) {
      console.error(
        "propagateToBlogs update:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createBlogTaxonomyItem(
  kind: TaxonomyKind,
  rawName: string,
): Promise<ActionResult> {
  const admin = await getManagerIdentity("blogs");
  if (!admin) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();

  const name = normalizeName(rawName);
  const invalid = validateName(kind, name);
  if (invalid) return { error: invalid };

  try {
    // RLS (is_store_admin) gates the insert against the caller's store.
    await withUser(admin, (db) =>
      db.insert(TABLE[kind]).values({ storeId, name }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) return { error: duplicateError(name) };
    console.error("createBlogTaxonomyItem error:", err);
    return { error: dbErrorMessage(err, "Failed to create.") };
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
  const admin = await getManagerIdentity("blogs");
  if (!admin) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();

  const name = normalizeName(rawName);
  const invalid = validateName(kind, name);
  if (invalid) return { error: invalid };

  const table = TABLE[kind];
  const existingRows = await withUser(admin, (db) =>
    db
      .select({ name: table.name })
      .from(table)
      .where(and(eq(table.id, id), eq(table.storeId, storeId)))
      .limit(1),
  );
  const existing = existingRows[0];
  if (!existing) return { error: "Not found. Please refresh and try again." };
  if (existing.name === name) return { success: true };

  try {
    await withUser(admin, (db) =>
      db
        .update(table)
        .set({ name })
        .where(and(eq(table.id, id), eq(table.storeId, storeId))),
    );
  } catch (err) {
    if (isUniqueViolation(err)) return { error: duplicateError(name) };
    console.error("renameBlogTaxonomyItem error:", err);
    return { error: dbErrorMessage(err, "Failed to rename.") };
  }

  await propagateToBlogs(admin, storeId, kind, existing.name, name);
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
  const admin = await getManagerIdentity("blogs");
  if (!admin) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();

  const table = TABLE[kind];
  const existingRows = await withUser(admin, (db) =>
    db
      .select({ name: table.name })
      .from(table)
      .where(and(eq(table.id, id), eq(table.storeId, storeId)))
      .limit(1),
  );
  const existing = existingRows[0];
  if (!existing) return { error: "Not found. Please refresh and try again." };

  try {
    await withUser(admin, (db) =>
      db.delete(table).where(and(eq(table.id, id), eq(table.storeId, storeId))),
    );
  } catch (err) {
    console.error("deleteBlogTaxonomyItem error:", err);
    return { error: dbErrorMessage(err, "Failed to delete.") };
  }

  await propagateToBlogs(admin, storeId, kind, existing.name, null);
  revalidateTaxonomy();
  return { success: true };
}
