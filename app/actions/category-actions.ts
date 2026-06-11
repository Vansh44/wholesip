"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { deleteStorageUrls } from "@/lib/supabase/storage-cleanup";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CategoryFormData {
  name: string;
  slug: string;
  description: string;
  image_url: string;
  sort_order: number;
  status: "active" | "hidden";
}

export interface ActionResult {
  success?: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Returns the caller's id only if their role grants `manage` on Categories.
// RLS enforces a baseline at the DB layer too; this is the app-layer gate.
async function getAdminUserId(): Promise<string | null> {
  return getManagerUserId("categories");
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === UNIQUE_VIOLATION;
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function resolveSlug(
  supabase: SupabaseClient,
  base: string,
  excludeId?: string,
) {
  let query = supabase
    .from("categories")
    .select("slug")
    .like("slug", `${base}%`);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;

  const taken = new Set((data ?? []).map((c: { slug: string }) => c.slug));
  let counter = 2;
  let slug = base;
  while (taken.has(slug)) {
    slug = `${base}-${counter}`;
    counter++;
  }

  const bump = (collided: string) => {
    taken.add(collided);
    while (taken.has(slug)) {
      slug = `${base}-${counter}`;
      counter++;
    }
    return slug;
  };

  return { slug, bump };
}

const MAX_SLUG_ATTEMPTS = 6;

function revalidateCatalog() {
  revalidatePath("/dashboard/categories");
  revalidatePath("/dashboard/products");
  revalidatePath("/pages/shop");
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createCategory(
  formData: CategoryFormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  if (!formData.name.trim()) return { error: "Name is required." };

  const base = formData.slug ? slugify(formData.slug) : slugify(formData.name);
  const { slug: firstSlug, bump } = await resolveSlug(supabase, base);
  let slug = firstSlug;

  const row = (s: string) => ({
    name: formData.name.trim(),
    slug: s,
    description: formData.description.trim() || null,
    image_url: formData.image_url || null,
    sort_order: formData.sort_order ?? 0,
    status: formData.status,
  });

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("categories")
      .insert(row(slug))
      .select()
      .single();

    if (!error) {
      revalidateCatalog();
      return { success: true, data: data as Record<string, unknown> };
    }
    if (!isUniqueViolation(error)) {
      console.error("createCategory error:", error);
      return { error: error.message };
    }
    slug = bump(slug);
  }

  return { error: "Could not generate a unique slug. Please try again." };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateCategory(
  id: string,
  formData: CategoryFormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  if (!formData.name.trim()) return { error: "Name is required." };

  const base = formData.slug ? slugify(formData.slug) : slugify(formData.name);
  const { slug: firstSlug, bump } = await resolveSlug(supabase, base, id);
  let slug = firstSlug;

  const row = (s: string) => ({
    name: formData.name.trim(),
    slug: s,
    description: formData.description.trim() || null,
    image_url: formData.image_url || null,
    sort_order: formData.sort_order ?? 0,
    status: formData.status,
  });

  // The image referenced before this save, so a replaced/removed one can be
  // purged from storage afterwards.
  const { data: prev } = await supabase
    .from("categories")
    .select("image_url")
    .eq("id", id)
    .single();
  const oldImage = prev?.image_url ?? null;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { error } = await supabase
      .from("categories")
      .update(row(slug))
      .eq("id", id);

    if (!error) {
      const newImage = formData.image_url || null;
      if (oldImage && oldImage !== newImage) await deleteStorageUrls([oldImage]);
      revalidateCatalog();
      return { success: true };
    }
    if (!isUniqueViolation(error)) {
      console.error("updateCategory error:", error);
      return { error: error.message };
    }
    slug = bump(slug);
  }

  return { error: "Could not generate a unique slug. Please try again." };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
// Products referencing this category have category_id set to NULL by the FK
// (ON DELETE SET NULL), so they become "uncategorized" rather than being lost.

export async function deleteCategory(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const { data: prev } = await supabase
    .from("categories")
    .select("image_url")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("categories").delete().eq("id", id);

  if (error) {
    console.error("deleteCategory error:", error);
    return { error: error.message };
  }

  if (prev?.image_url) await deleteStorageUrls([prev.image_url]);

  revalidateCatalog();
  return { success: true };
}
