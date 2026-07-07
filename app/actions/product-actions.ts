"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";
import { deleteStorageUrls } from "@/lib/supabase/storage-cleanup";
import { getStoreUrl } from "@/lib/site";
import { pingIndexNow } from "@/lib/seo/search-engines";
import { TAGS } from "@/lib/storefront/tags";
import { callGemini, brandSystemText, loadBrandSoul } from "@/lib/ai/gemini";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VariantFormData {
  /** DB id — present for existing variants, absent for newly-added rows. */
  id?: string;
  name: string;
  base_price: number;
  selling_price: number;
  // Optional sale price for this variant. When set (> 0) it overrides
  // selling_price for the variant AND triggers a "best value" tag badge on
  // the storefront chip. 0 / null means no special price.
  special_price: number | null;
  stock: number;
  sku: string;
  images: string[]; // this variant's own gallery (empty = uses product gallery)
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
  card_color: string;
  seo_title: string;
  seo_description: string;
  variants: VariantFormData[];
  track_inventory?: boolean;
  allow_backorder?: boolean;
  low_stock_threshold?: number | null;
  sku?: string;
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

// Allowed when the caller's role grants `manage` on the Products section.
async function getAdminUserId(): Promise<string | null> {
  return getManagerUserId("products");
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === UNIQUE_VIOLATION;
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function resolveSlug(
  supabase: SupabaseClient,
  base: string,
  storeId: string,
  excludeId?: string,
) {
  let query = supabase
    .from("products")
    .select("slug")
    .eq("store_id", storeId)
    .like("slug", `${base}%`);
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
// Preserves `id` so the reconcile can match existing DB rows.
function sanitizeVariants(variants: VariantFormData[]) {
  return (variants ?? [])
    .filter((v) => v.name && v.name.trim())
    .map((v, i) => {
      const images = (v.images ?? []).map((u) => u.trim()).filter(Boolean);
      const prices = normalizePrices(v.base_price, v.selling_price);
      // special_price is optional: keep it ONLY when explicitly set (> 0) and
      // clamp against base_price so a typo can't show free. Null otherwise
      // — the storefront uses NULL to mean "no special price, no tag badge".
      let special: number | null = null;
      if (
        v.special_price != null &&
        Number.isFinite(v.special_price) &&
        v.special_price > 0
      ) {
        special =
          prices.base_price > 0
            ? Math.min(v.special_price, prices.base_price)
            : v.special_price;
      }
      return {
        id: v.id || undefined, // pass through existing variant id for reconcile
        name: v.name.trim(),
        ...prices,
        special_price: special,
        stock: Number.isFinite(v.stock) ? Math.trunc(v.stock) : 0,
        sku: v.sku?.trim() || null,
        images,
        image_url: images[0] ?? null, // keep the legacy single image in sync
        sort_order: i,
      };
    });
}

// Reconcile strategy: UPDATE existing variants by id, INSERT new ones (no id),
// DELETE removed ones. Stock is NEVER overwritten by the product form — stock
// flows only through inventory RPCs. Variant ids are stable so order_items
// references and the stock_movements ledger are preserved.
async function replaceVariants(
  supabase: SupabaseClient,
  productId: string,
  variants: VariantFormData[],
  storeId: string,
): Promise<string | null> {
  const rows = sanitizeVariants(variants);

  // 1. Fetch existing variant ids for this product.
  const { data: existing, error: fetchError } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  if (fetchError) return fetchError.message;

  const existingIds = new Set(
    (existing ?? []).map((v: { id: string }) => v.id),
  );
  const formIds = new Set(rows.filter((r) => r.id).map((r) => r.id!));

  // 2. UPDATE existing variants (matched by id). Never overwrite stock —
  //    the `stock` field in the form is informational; real stock changes go
  //    through the inventory RPCs.
  for (const row of rows) {
    if (!row.id || !existingIds.has(row.id)) continue;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, stock: _stock, ...updates } = row;
    const { error } = await supabase
      .from("product_variants")
      .update(updates)
      .eq("id", row.id)
      .eq("product_id", productId);
    if (error) return error.message;
  }

  // 3. INSERT new variants (no id in form data).
  const newRows = rows.filter((r) => !r.id);
  if (newRows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const inserts = newRows.map(({ id: _id, ...r }) => ({
      ...r,
      product_id: productId,
      store_id: storeId,
    }));
    const { error } = await supabase.from("product_variants").insert(inserts);
    if (error) return error.message;
  }

  // 4. DELETE variants removed from the editor. The ON DELETE RESTRICT
  //    constraint on order_items.variant_id will block deletion of a variant
  //    that has existing orders — surface a friendly message.
  const toDelete = [...existingIds].filter((id) => !formIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("product_variants")
      .delete()
      .in("id", toDelete);
    if (error) {
      // RESTRICT FK violation — variant has order references.
      if (
        error.code === "23503" ||
        error.message?.toLowerCase().includes("violates foreign key")
      ) {
        return "Cannot delete one or more variants because they have existing orders. Disable them instead.";
      }
      return error.message;
    }
  }

  return null;
}

function revalidateProduct(slug?: string) {
  revalidatePath("/dashboard/products");
  revalidatePath("/shop");
  if (slug) revalidatePath(`/shop/${slug}`);
  // Bust the shared cached product reads used by home + shop + detail.
  revalidateTag(TAGS.products, "max");
}

// Nudge search engines to (re)crawl a product page after it goes live. No-op
// for drafts — a draft URL isn't publicly indexable. Best-effort, off the
// response path; getStoreUrl reads the request host so resolve it before after.
async function notifyProductPublished(
  slug: string | undefined,
  published: boolean,
) {
  if (!published || !slug) return;
  const base = await getStoreUrl();
  after(() => pingIndexNow([`${base}/shop/${slug}`]));
}

// ---------------------------------------------------------------------------
// Storage cleanup — keep Supabase Storage in sync when images are removed.
// Uploads add files to the `media` bucket; removing an image only drops its
// URL from the DB, so the file would otherwise be orphaned. On save we delete
// the files that are no longer referenced; on delete we remove them all.
// (deleteStorageUrls lives in lib/supabase/storage-cleanup, shared by actions.)
// ---------------------------------------------------------------------------

// All image URLs currently referenced by a product (primary + gallery + every
// variant's primary + gallery). Resilient: returns [] on any error.
async function fetchProductImageUrls(
  supabase: SupabaseClient,
  productId: string,
): Promise<string[]> {
  const urls: string[] = [];
  try {
    const { data: p } = await supabase
      .from("products")
      .select("image_url, images")
      .eq("id", productId)
      .single();
    if (p?.image_url) urls.push(p.image_url);
    if (Array.isArray(p?.images)) urls.push(...p.images);

    const { data: vs } = await supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", productId);
    for (const v of (vs ?? []) as Array<{
      image_url?: string | null;
      images?: string[] | null;
    }>) {
      if (v.image_url) urls.push(v.image_url);
      if (Array.isArray(v.images)) urls.push(...v.images);
    }
  } catch (err) {
    console.error("fetchProductImageUrls error:", err);
  }
  return urls;
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
  const storeId = await getActingStoreId();

  if (!formData.name.trim()) return { error: "Name is required." };
  if (!formData.category_id) return { error: "Category is required." };
  if (!formData.description.trim())
    return { error: "Description is required." };
  if (!formData.seo_title.trim() || !formData.seo_description.trim())
    return { error: "SEO title and description are required." };

  const base = formData.slug ? slugify(formData.slug) : slugify(formData.name);
  const { slug: firstSlug, bump } = await resolveSlug(supabase, base, storeId);
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
    card_color: formData.card_color?.trim() || null,
    seo_title: formData.seo_title.trim() || null,
    seo_description: formData.seo_description.trim() || null,
    published_at:
      formData.status === "published" ? new Date().toISOString() : null,
    created_by: userId,
    updated_by: userId,
    store_id: storeId,
    track_inventory: formData.track_inventory ?? false,
    allow_backorder: formData.allow_backorder ?? false,
    low_stock_threshold: formData.low_stock_threshold ?? null,
    sku: formData.sku?.trim() || null,
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
        storeId,
      );
      if (variantError) {
        console.error("createProduct variants error:", variantError);
        return { error: `Product saved but variants failed: ${variantError}` };
      }
      revalidateProduct(slug);
      await notifyProductPublished(slug, formData.status === "published");
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
  const storeId = await getActingStoreId();

  if (!formData.name.trim()) return { error: "Name is required." };
  if (!formData.category_id) return { error: "Category is required." };
  if (!formData.description.trim())
    return { error: "Description is required." };
  if (!formData.seo_title.trim() || !formData.seo_description.trim())
    return { error: "SEO title and description are required." };

  const base = formData.slug ? slugify(formData.slug) : slugify(formData.name);
  const { slug: firstSlug, bump } = await resolveSlug(
    supabase,
    base,
    storeId,
    id,
  );
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
    card_color: formData.card_color?.trim() || null,
    seo_title: formData.seo_title.trim() || null,
    seo_description: formData.seo_description.trim() || null,
    published_at: publishedAt,
    updated_by: userId,
    track_inventory: formData.track_inventory ?? false,
    allow_backorder: formData.allow_backorder ?? false,
    low_stock_threshold: formData.low_stock_threshold ?? null,
    sku: formData.sku?.trim() || null,
  });

  // Images referenced before this save — compared against what survives so any
  // removed file can be purged from storage.
  const oldImageUrls = await fetchProductImageUrls(supabase, id);

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
        storeId,
      );
      if (variantError) {
        console.error("updateProduct variants error:", variantError);
        return {
          error: `Product saved but variants failed: ${variantError}`,
        };
      }
      // Purge files that are no longer referenced after the save.
      const kept = new Set(await fetchProductImageUrls(supabase, id));
      await deleteStorageUrls(oldImageUrls.filter((u) => !kept.has(u)));

      revalidateProduct(slug);
      await notifyProductPublished(slug, formData.status === "published");
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

  // Collect the product's images before deleting (variants cascade in the DB).
  const imageUrls = await fetchProductImageUrls(supabase, id);

  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    console.error("deleteProduct error:", error);
    return { error: error.message };
  }

  // Files won't cascade — remove them from storage too.
  await deleteStorageUrls(imageUrls);

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
  await notifyProductPublished(data?.slug, publish);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Bulk operations (dashboard multi-select)
// ---------------------------------------------------------------------------

/** Publish or unpublish many products at once. */
export async function bulkToggleProductPublish(
  ids: string[],
  publish: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };
  if (ids.length === 0) return { error: "Nothing selected." };

  const { error } = await supabase
    .from("products")
    .update({
      status: publish ? "published" : "draft",
      published_at: publish ? new Date().toISOString() : null,
      updated_by: userId,
    })
    .in("id", ids);

  if (error) {
    console.error("bulkToggleProductPublish error:", error);
    return { error: error.message };
  }
  revalidateProduct();
  return { success: true };
}

/** Feature or unfeature many products at once. */
export async function bulkSetProductFeatured(
  ids: string[],
  featured: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };
  if (ids.length === 0) return { error: "Nothing selected." };

  const { error } = await supabase
    .from("products")
    .update({ featured, updated_by: userId })
    .in("id", ids);

  if (error) {
    console.error("bulkSetProductFeatured error:", error);
    return { error: error.message };
  }
  revalidateProduct();
  return { success: true };
}

/** Permanently delete many products, cleaning up their storage assets. */
export async function bulkDeleteProducts(ids: string[]): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };
  if (ids.length === 0) return { error: "Nothing selected." };

  // Gather images for every product first (variants cascade in the DB; files
  // do not).
  const urls: string[] = [];
  for (const id of ids) {
    urls.push(...(await fetchProductImageUrls(supabase, id)));
  }

  const { error } = await supabase.from("products").delete().in("id", ids);
  if (error) {
    console.error("bulkDeleteProducts error:", error);
    return { error: error.message };
  }
  await deleteStorageUrls(urls);
  revalidateProduct();
  return { success: true };
}

// ---------------------------------------------------------------------------
// AI description generation (Gemini)
//
// Pipeline:  brand/brand.md (soul)  +  product-desc.md (task rules)  +
//            the form fields the admin entered  →  Gemini  →  one paragraph.
//
// brand.md is the system instruction (who is speaking). product-desc.md is the
// single source of truth for the task rules — the SAME file the /product-desc
// slash command uses — so editing it updates both surfaces at once. The API
// key is server-only and never reaches the browser.
// ---------------------------------------------------------------------------

export interface DescriptionInput {
  name: string;
  categoryName?: string | null;
  base_price?: number;
  selling_price?: number;
  variants?: string[];
  // Whatever the admin has already typed in the description box — used as
  // rough notes for the AI to polish, not as a hard constraint.
  notes?: string;
}

export interface DescriptionResult {
  description?: string;
  error?: string;
}

// Used if product-desc.md can't be read, so the button never hard-fails.
const FALLBACK_TASK = `Write ONE product description of roughly 40–60 words in the brand's voice, using only the product details provided. Output only the description text — no preamble, no options, no notes, no quotation marks, no markdown. Lead with the belief or the real ingredients, never a number. If a detail isn't provided, leave it out — never invent a fact.`;

// The task layer lives in brand/tasks/ (deployed app content). The /product-desc
// slash command points to the SAME file, so both surfaces stay in sync.
async function loadTaskRules(): Promise<string> {
  try {
    const raw = await readFile(
      path.join(process.cwd(), "brand", "tasks", "product-desc.md"),
      "utf8",
    );
    const clean = raw.trim();
    return clean || FALLBACK_TASK;
  } catch {
    return FALLBACK_TASK;
  }
}

// Turn the form fields into a flat, fact-only list for the prompt. Only fields
// that are actually present are included — the brand rules forbid inventing
// anything, so we never send blanks the model might try to fill.
function buildProductFacts(input: {
  name: string;
  categoryName?: string | null;
  base_price?: number;
  selling_price?: number;
  variants?: string[];
  description?: string;
  notes?: string;
}): string[] {
  const facts: string[] = [`Product name: ${input.name.trim()}`];
  if (input.categoryName) facts.push(`Category: ${input.categoryName}`);
  if (input.base_price && input.base_price > 0)
    facts.push(`Base price (MRP): ₹${input.base_price}`);
  if (input.selling_price && input.selling_price > 0)
    facts.push(`Selling price: ₹${input.selling_price}`);
  if (input.variants && input.variants.length > 0)
    facts.push(`Variants: ${input.variants.join(", ")}`);
  if (input.description && input.description.trim())
    facts.push(`Product description: ${input.description.trim()}`);
  if (input.notes && input.notes.trim())
    facts.push(`Notes typed in the description field: ${input.notes.trim()}`);
  return facts;
}

export async function generateProductDescription(
  input: DescriptionInput,
): Promise<DescriptionResult> {
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  if (!input.name?.trim()) {
    return { error: "Add a product name first." };
  }

  // brand.md (soul) + product-desc.md (task) + form fields → Gemini.
  const brand = await loadBrandSoul();
  if (!brand) {
    return {
      error:
        "brand/brand.md is missing or empty. Paste your brand guide first.",
    };
  }

  const taskRules = await loadTaskRules();
  const facts = buildProductFacts(input);

  const userText = `${taskRules}

---
PRODUCT DETAILS — the only source of facts. Never invent anything beyond these:

${facts.join("\n")}`;

  const { text, error } = await callGemini(brandSystemText(brand), userText, {
    temperature: 0.7,
    maxOutputTokens: 1024,
  });
  if (error) return { error };

  return { description: text };
}

// ---------------------------------------------------------------------------
// AI SEO generation (Gemini)
//
// Same pipeline as the description, but the task layer is seo-meta.md and the
// model returns validated JSON ({ seo_title, seo_description }) so we reliably
// get both fields at once. The product description, when present, is passed in
// as the richest source material.
// ---------------------------------------------------------------------------

export interface SeoInput {
  name: string;
  categoryName?: string | null;
  base_price?: number;
  selling_price?: number;
  variants?: string[];
  // The current product description — best raw material for SEO copy.
  description?: string;
}

export interface SeoResult {
  seo_title?: string;
  seo_description?: string;
  error?: string;
}

const FALLBACK_SEO_TASK = `Return ONLY a JSON object with two string keys, "seo_title" and "seo_description". seo_title: ~50–60 characters (never over 60), lead with the product name, plain and searchable, no hype or caps. seo_description: ~140–160 characters (never over 160), one or two calm sentences in the brand's voice saying what it is and why it's real, no hard sell, no urgency, no medical claims. Use only the product details provided — never invent a fact or number. Output the raw JSON only: no markdown, no code fences, no extra text.`;

async function loadSeoTaskRules(): Promise<string> {
  try {
    const raw = await readFile(
      path.join(process.cwd(), "brand", "tasks", "seo-meta.md"),
      "utf8",
    );
    return raw.trim() || FALLBACK_SEO_TASK;
  } catch {
    return FALLBACK_SEO_TASK;
  }
}

// JSON shape we force Gemini to return (uppercase Type enum, per the REST API).
const SEO_SCHEMA = {
  type: "OBJECT",
  properties: {
    seo_title: { type: "STRING" },
    seo_description: { type: "STRING" },
  },
  required: ["seo_title", "seo_description"],
  propertyOrdering: ["seo_title", "seo_description"],
};

export async function generateProductSeo(input: SeoInput): Promise<SeoResult> {
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  if (!input.name?.trim()) {
    return { error: "Add a product name first." };
  }
  if (!input.description?.trim()) {
    return { error: "Fill in the product description before generating SEO." };
  }

  const brand = await loadBrandSoul();
  if (!brand) {
    return {
      error:
        "brand/brand.md is missing or empty. Paste your brand guide first.",
    };
  }

  const taskRules = await loadSeoTaskRules();
  const facts = buildProductFacts(input);

  const userText = `${taskRules}

---
PRODUCT DETAILS — the only source of facts. Never invent anything beyond these:

${facts.join("\n")}`;

  const { text, error } = await callGemini(brandSystemText(brand), userText, {
    temperature: 0.5,
    maxOutputTokens: 512,
    responseMimeType: "application/json",
    responseSchema: SEO_SCHEMA,
  });
  if (error) return { error };

  let parsed: { seo_title?: string; seo_description?: string } | null = null;
  try {
    parsed = JSON.parse(text!);
  } catch {
    console.error("SEO JSON parse failed:", text);
    return { error: "The AI returned an unexpected format. Try again." };
  }

  const seo_title = parsed?.seo_title?.trim();
  const seo_description = parsed?.seo_description?.trim();
  if (!seo_title || !seo_description) {
    return { error: "The AI response was incomplete. Try again." };
  }

  return { seo_title, seo_description };
}
