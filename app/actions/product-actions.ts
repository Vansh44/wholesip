"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VariantFormData {
  name: string;
  base_price: number;
  selling_price: number;
  stock: number;
  sku: string;
}

export interface ProductFormData {
  name: string;
  slug: string;
  description: string;
  category_id: string | null;
  base_price: number;
  selling_price: number;
  image_url: string;
  images: string[];
  status: "draft" | "published";
  featured: boolean;
  sort_order: number;
  seo_title: string;
  seo_description: string;
  variants: VariantFormData[];
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

async function getAdminUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin" && profile?.role !== "member") {
    return null;
  }

  return user.id;
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
  let query = supabase.from("products").select("slug").like("slug", `${base}%`);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;

  const taken = new Set((data ?? []).map((p: { slug: string }) => p.slug));
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

// Normalize a base/selling pair: non-negative numbers, selling defaults to
// base when unset, and selling is clamped so it never exceeds base.
function normalizePrices(base: number, selling: number) {
  const b = Number.isFinite(base) && base > 0 ? base : 0;
  let s = Number.isFinite(selling) && selling > 0 ? selling : b;
  if (b > 0 && s > b) s = b;
  return { base_price: b, selling_price: s };
}

// Keep only valid variant rows (a name is required) and normalise numbers.
function sanitizeVariants(variants: VariantFormData[]) {
  return (variants ?? [])
    .filter((v) => v.name && v.name.trim())
    .map((v, i) => ({
      name: v.name.trim(),
      ...normalizePrices(v.base_price, v.selling_price),
      stock: Number.isFinite(v.stock) ? Math.trunc(v.stock) : 0,
      sku: v.sku?.trim() || null,
      sort_order: i,
    }));
}

// Replace strategy: delete all existing variants for a product then insert the
// new set. Variants aren't referenced by orders yet, so this is safe and keeps
// the editor's "what you see is what's saved" semantics simple.
async function replaceVariants(
  supabase: SupabaseClient,
  productId: string,
  variants: VariantFormData[],
): Promise<string | null> {
  const { error: delError } = await supabase
    .from("product_variants")
    .delete()
    .eq("product_id", productId);
  if (delError) return delError.message;

  const rows = sanitizeVariants(variants);
  if (rows.length === 0) return null;

  const { error: insError } = await supabase
    .from("product_variants")
    .insert(rows.map((r) => ({ ...r, product_id: productId })));
  if (insError) return insError.message;

  return null;
}

function revalidateProduct(slug?: string) {
  revalidatePath("/dashboard/products");
  revalidatePath("/pages/shop");
  if (slug) revalidatePath(`/pages/shop/${slug}`);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createProduct(
  formData: ProductFormData,
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
    category_id: formData.category_id || null,
    ...normalizePrices(formData.base_price, formData.selling_price),
    image_url: formData.image_url || null,
    images: formData.images ?? [],
    status: formData.status,
    featured: formData.featured,
    sort_order: formData.sort_order ?? 0,
    seo_title: formData.seo_title.trim() || null,
    seo_description: formData.seo_description.trim() || null,
    published_at:
      formData.status === "published" ? new Date().toISOString() : null,
    created_by: userId,
    updated_by: userId,
  });

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("products")
      .insert(row(slug))
      .select()
      .single();

    if (!error) {
      const variantError = await replaceVariants(
        supabase,
        data.id,
        formData.variants,
      );
      if (variantError) {
        console.error("createProduct variants error:", variantError);
        return { error: `Product saved but variants failed: ${variantError}` };
      }
      revalidateProduct(slug);
      return { success: true, data: data as Record<string, unknown> };
    }

    if (!isUniqueViolation(error)) {
      console.error("createProduct error:", error);
      return { error: error.message };
    }
    slug = bump(slug);
  }

  return { error: "Could not generate a unique slug. Please try again." };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateProduct(
  id: string,
  formData: ProductFormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  if (!formData.name.trim()) return { error: "Name is required." };

  const base = formData.slug ? slugify(formData.slug) : slugify(formData.name);
  const { slug: firstSlug, bump } = await resolveSlug(supabase, base, id);
  let slug = firstSlug;

  const { data: current } = await supabase
    .from("products")
    .select("published_at")
    .eq("id", id)
    .single();

  const publishedAt =
    formData.status === "published"
      ? (current?.published_at ?? new Date().toISOString())
      : null;

  const row = (s: string) => ({
    name: formData.name.trim(),
    slug: s,
    description: formData.description.trim() || null,
    category_id: formData.category_id || null,
    ...normalizePrices(formData.base_price, formData.selling_price),
    image_url: formData.image_url || null,
    images: formData.images ?? [],
    status: formData.status,
    featured: formData.featured,
    sort_order: formData.sort_order ?? 0,
    seo_title: formData.seo_title.trim() || null,
    seo_description: formData.seo_description.trim() || null,
    published_at: publishedAt,
    updated_by: userId,
  });

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { error } = await supabase
      .from("products")
      .update(row(slug))
      .eq("id", id);

    if (!error) {
      const variantError = await replaceVariants(
        supabase,
        id,
        formData.variants,
      );
      if (variantError) {
        console.error("updateProduct variants error:", variantError);
        return {
          error: `Product saved but variants failed: ${variantError}`,
        };
      }
      revalidateProduct(slug);
      return { success: true };
    }

    if (!isUniqueViolation(error)) {
      console.error("updateProduct error:", error);
      return { error: error.message };
    }
    slug = bump(slug);
  }

  return { error: "Could not generate a unique slug. Please try again." };
}

// ---------------------------------------------------------------------------
// Delete (variants cascade via FK)
// ---------------------------------------------------------------------------

export async function deleteProduct(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    console.error("deleteProduct error:", error);
    return { error: error.message };
  }

  revalidateProduct();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Toggle publish
// ---------------------------------------------------------------------------

export async function toggleProductPublish(
  id: string,
  publish: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("products")
    .update({
      status: publish ? "published" : "draft",
      published_at: publish ? new Date().toISOString() : null,
      updated_by: userId,
    })
    .eq("id", id)
    .select("slug")
    .single();

  if (error) {
    console.error("toggleProductPublish error:", error);
    return { error: error.message };
  }

  revalidateProduct(data?.slug);
  return { success: true };
}
