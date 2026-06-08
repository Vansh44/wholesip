"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { readFile } from "fs/promises";
import path from "path";

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
  if (!formData.description.trim())
    return { error: "Description is required." };
  if (!formData.seo_title.trim() || !formData.seo_description.trim())
    return { error: "SEO title and description are required." };

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
  if (!formData.description.trim())
    return { error: "Description is required." };
  if (!formData.seo_title.trim() || !formData.seo_description.trim())
    return { error: "SEO title and description are required." };

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

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

async function loadBrandSoul(): Promise<string | null> {
  try {
    const raw = await readFile(
      path.join(process.cwd(), "brand", "brand.md"),
      "utf8",
    );
    // Drop the HTML placeholder comment so an untouched template reads as empty.
    const clean = raw.replace(/<!--[\s\S]*?-->/g, "").trim();
    return clean || null;
  } catch {
    return null;
  }
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

// The brand soul becomes Gemini's system instruction — its persistent identity.
function brandSystemText(brand: string): string {
  return `${brand}

The text above is the brand's soul — its voice, tone, values and vocabulary. You ARE this brand speaking. Everything you write must sound exactly like it.`;
}

interface GeminiOptions {
  temperature?: number;
  maxOutputTokens?: number;
  // Set both to make Gemini return validated JSON instead of free text.
  responseMimeType?: string;
  responseSchema?: unknown;
}

// One shared call into Gemini, used by every AI copy action: builds the
// request, retries transient 5xx / network failures with a short backoff, and
// returns the raw text (or a friendly error). The API key is read here and
// never leaves the server.
async function callGemini(
  systemText: string,
  userText: string,
  options: GeminiOptions = {},
): Promise<{ text?: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "GEMINI_API_KEY is not set in .env.local." };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? 1024,
      // gemini-2.5-flash "thinks" before answering, and those tokens come out
      // of maxOutputTokens — with a long brand soul that can eat the whole
      // budget and truncate the answer. Turn thinking off for these short tasks.
      thinkingConfig: { thinkingBudget: 0 },
      ...(options.responseMimeType
        ? { responseMimeType: options.responseMimeType }
        : {}),
      ...(options.responseSchema
        ? { responseSchema: options.responseSchema }
        : {}),
    },
  });

  // Gemini intermittently returns a transient 500 (INTERNAL) or 503
  // (UNAVAILABLE); its docs say to retry. Try a few times with a short backoff.
  // Bail immediately on permanent client errors (400/403).
  const MAX_ATTEMPTS = 3;
  let res: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: requestBody,
        cache: "no-store",
      });
    } catch (err) {
      console.error(
        `Gemini network error (attempt ${attempt}/${MAX_ATTEMPTS}):`,
        err,
      );
      res = null;
    }

    if (res?.ok) break;
    if (res && (res.status === 400 || res.status === 403)) break;
    if (attempt < MAX_ATTEMPTS)
      await new Promise((r) => setTimeout(r, 600 * attempt));
  }

  if (!res) {
    return {
      error:
        "Could not reach the AI service. Check your connection and try again.",
    };
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error("Gemini API error:", res.status, errBody);
    if (res.status === 400 || res.status === 403)
      return {
        error: "AI request rejected — check that GEMINI_API_KEY is valid.",
      };
    if (res.status >= 500)
      return {
        error:
          "The AI service is busy right now. Please try again in a moment.",
      };
    return { error: `AI request failed (${res.status}). Try again.` };
  }

  const json = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;

  const text = json?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) return { error: "The AI returned an empty response. Try again." };
  return { text };
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
