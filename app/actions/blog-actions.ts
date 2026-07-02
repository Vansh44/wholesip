"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { TAGS } from "@/lib/storefront/tags";
import { sanitizeBlogContent } from "@/lib/sanitize";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";
import { getCurrentStoreId } from "@/lib/store/resolve";
import {
  deleteStorageUrls,
  extractMediaUrlsFromHtml,
} from "@/lib/supabase/storage-cleanup";
import {
  sendBlogApprovedEmail,
  sendBlogRejectedEmail,
} from "@/lib/email/blog-notifications";
import { getStoreBrand } from "@/lib/store/brand";
import { getStoreSettings } from "@/lib/settings/resolve";
import { fetchBlogTaxonomy } from "@/lib/blog-taxonomy";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlogFormData {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image_url: string;
  author: string;
  categories: string[];
  tags: string[];
  status: "draft" | "published" | "pending_review";
  featured: boolean;
  seo_title: string;
  seo_description: string;
  reading_time: number;
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

function calculateReadingTime(html: string): number {
  // Strip HTML tags and count words
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = text.split(" ").filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

// Returns the caller's id only if their role grants `manage` on Blogs.
// RLS already enforces a baseline at the DB layer; this is the app-layer gate.
async function getAdminUserId(): Promise<string | null> {
  return getManagerUserId("blogs");
}

/**
 * Full blog row by id (including the heavy `content` HTML) for the editor.
 * The dashboard list omits `content` to keep its payload small, so the editor
 * fetches the complete post here when opening an existing one — never opening
 * with a half-loaded object (which could blank-save the body). Returns null if
 * the post is missing or the caller can't manage blogs.
 */
export async function getBlogForEditor(
  id: string,
): Promise<Record<string, unknown> | null> {
  const userId = await getAdminUserId();
  if (!userId) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("blogs")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data;
}

// Looks up a customer's email + first name by id, bypassing RLS via the
// service-role client. The customers table only lets a customer read their own
// row, so an admin session can't read a submitter — this is used purely to
// address review-notification emails after an admin action.
async function getCustomerContact(
  submittedBy: string | null,
): Promise<{ email: string | null; firstName: string | null } | null> {
  if (!submittedBy) return null;
  try {
    const adminClient = createAdminClient();
    const { data } = await adminClient
      .from("users")
      .select("email, first_name")
      .eq("id", submittedBy)
      .single();
    if (!data) return null;
    return { email: data.email, firstName: data.first_name };
  } catch (e) {
    console.error("getCustomerContact error:", e);
    return null;
  }
}

/**
 * Validate a customer submission's categories/tags against the STORE'S OWN
 * taxonomy (blog_categories / blog_tags — managed in /dashboard/blogs/settings).
 * Client input is untrusted, so unknown names are dropped server-side. When the
 * store has defined options, at least one valid pick is required; a store with
 * no options defined doesn't block submissions on the missing pickers.
 */
async function validateCustomerTaxonomy(
  supabase: SupabaseClient,
  storeId: string,
  formData: Pick<CustomerBlogFormData, "categories" | "tags">,
): Promise<
  | { error: string }
  | { error?: undefined; categories: string[]; tags: string[] }
> {
  const available = await fetchBlogTaxonomy(supabase, storeId);
  const validCategories = new Set(available.categories.map((c) => c.name));
  const validTags = new Set(available.tags.map((t) => t.name));

  const categories = (formData.categories ?? []).filter((c) =>
    validCategories.has(c),
  );
  const tags = (formData.tags ?? []).filter((t) => validTags.has(t));

  if (validCategories.size > 0 && categories.length === 0) {
    return { error: "Please select at least one category." };
  }
  if (validTags.size > 0 && tags.length === 0) {
    return { error: "Please select at least one tag." };
  }
  return { categories, tags };
}

// Postgres unique_violation — raised when the blogs.slug UNIQUE constraint is hit.
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === UNIQUE_VIOLATION;
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Picks the first slug starting from `base` that isn't already taken, based on
 * a pre-check query. Returns a cursor so the caller can keep bumping the suffix
 * if a concurrent insert wins the race (the pre-check is best-effort; the DB
 * UNIQUE constraint is the source of truth).
 */
async function resolveSlug(
  supabase: SupabaseClient,
  base: string,
  storeId: string,
  excludeId?: string,
) {
  let query = supabase
    .from("blogs")
    .select("slug")
    .eq("store_id", storeId)
    .like("slug", `${base}%`);
  if (excludeId) {
    query = query.neq("id", excludeId);
  }
  const { data } = await query;

  const taken = new Set((data ?? []).map((b: { slug: string }) => b.slug));
  let counter = 2;
  let slug = base;
  while (taken.has(slug)) {
    slug = `${base}-${counter}`;
    counter++;
  }

  // bump() advances to the next free candidate after a unique-violation retry.
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

// ---------------------------------------------------------------------------
// Create Blog
// ---------------------------------------------------------------------------

export async function createBlog(
  formData: BlogFormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();

  if (!userId) {
    return { error: "Not authenticated" };
  }

  const readingTime = formData.content
    ? calculateReadingTime(formData.content)
    : 0;
  const storeId = await getActingStoreId();

  const base = formData.slug || slugify(formData.title);
  const { slug: firstSlug, bump } = await resolveSlug(supabase, base, storeId);
  let slug = firstSlug;

  const row = (s: string) => ({
    title: formData.title,
    slug: s,
    excerpt: formData.excerpt || null,
    content: formData.content ? sanitizeBlogContent(formData.content) : null,
    cover_image_url: formData.cover_image_url || null,
    author: formData.author || null,
    categories: formData.categories.length > 0 ? formData.categories : [],
    tags: formData.tags.length > 0 ? formData.tags : [],
    status: formData.status,
    featured: formData.featured,
    seo_title: formData.seo_title || null,
    seo_description: formData.seo_description || null,
    reading_time: readingTime,
    published_at:
      formData.status === "published" ? new Date().toISOString() : null,
    created_by: userId,
    updated_by: userId,
    store_id: storeId,
  });

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("blogs")
      .insert(row(slug))
      .select()
      .single();

    if (!error) {
      revalidatePath("/dashboard/blogs");
      revalidatePath("/blogs");
      revalidateTag(TAGS.blogs, "max");
      return { success: true, data: data as Record<string, unknown> };
    }

    if (!isUniqueViolation(error)) {
      console.error("createBlog error:", error);
      return { error: error.message };
    }

    // Lost the slug race to a concurrent insert — pick the next free slug.
    slug = bump(slug);
  }

  return { error: "Could not generate a unique slug. Please try again." };
}

// ---------------------------------------------------------------------------
// Update Blog
// ---------------------------------------------------------------------------

export async function updateBlog(
  id: string,
  formData: BlogFormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();

  if (!userId) {
    return { error: "Not authenticated" };
  }

  const readingTime = formData.content
    ? calculateReadingTime(formData.content)
    : 0;
  const storeId = await getActingStoreId();

  // Check slug uniqueness (exclude current blog)
  const base = formData.slug || slugify(formData.title);
  const { slug: firstSlug, bump } = await resolveSlug(
    supabase,
    base,
    storeId,
    id,
  );
  let slug = firstSlug;

  // Get current blog to check if it was previously unpublished, and whether
  // this is a customer submission awaiting review (so we can notify the author
  // when an admin approves it by publishing from the editor).
  const { data: currentBlog } = await supabase
    .from("blogs")
    .select(
      "status, published_at, submitted_by, is_customer_submission, cover_image_url, content",
    )
    .eq("id", id)
    .single();

  const publishedAt =
    formData.status === "published"
      ? (currentBlog?.published_at ?? new Date().toISOString())
      : null;

  const row = (s: string) => ({
    title: formData.title,
    slug: s,
    excerpt: formData.excerpt || null,
    content: formData.content ? sanitizeBlogContent(formData.content) : null,
    cover_image_url: formData.cover_image_url || null,
    author: formData.author || null,
    categories: formData.categories.length > 0 ? formData.categories : [],
    tags: formData.tags.length > 0 ? formData.tags : [],
    status: formData.status,
    featured: formData.featured,
    seo_title: formData.seo_title || null,
    seo_description: formData.seo_description || null,
    reading_time: readingTime,
    published_at: publishedAt,
    updated_by: userId,
  });

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { error } = await supabase
      .from("blogs")
      .update(row(slug))
      .eq("id", id);

    if (!error) {
      // Approving a customer submission by publishing it from the editor:
      // notify the author (best-effort), mirroring approveCustomerBlog.
      const isApproval =
        currentBlog?.status === "pending_review" &&
        formData.status === "published" &&
        currentBlog?.submitted_by;
      if (isApproval) {
        const contact = await getCustomerContact(
          currentBlog!.submitted_by as string,
        );
        if (contact?.email) {
          const brand = await getStoreBrand();
          await sendBlogApprovedEmail({
            to: contact.email,
            firstName: contact.firstName,
            title: formData.title,
            slug,
            brand,
          });
        }
      }

      // Purge images no longer referenced (old cover + old body images that
      // aren't in the saved cover/body anymore).
      const oldRefs = [
        ...(currentBlog?.cover_image_url ? [currentBlog.cover_image_url] : []),
        ...extractMediaUrlsFromHtml(currentBlog?.content),
      ];
      const newRefs = new Set([
        ...(formData.cover_image_url ? [formData.cover_image_url] : []),
        ...extractMediaUrlsFromHtml(formData.content),
      ]);
      await deleteStorageUrls(oldRefs.filter((u) => !newRefs.has(u)));

      revalidatePath("/dashboard/blogs");
      revalidatePath("/blogs");
      revalidatePath(`/blogs/${slug}`);
      revalidateTag(TAGS.blogs, "max");
      return { success: true };
    }

    if (!isUniqueViolation(error)) {
      console.error("updateBlog error:", error);
      return { error: error.message };
    }

    slug = bump(slug);
  }

  return { error: "Could not generate a unique slug. Please try again." };
}

// ---------------------------------------------------------------------------
// Delete Blog
// ---------------------------------------------------------------------------

export async function deleteBlog(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();

  if (!userId) {
    return { error: "Not authenticated" };
  }

  const { data: prev } = await supabase
    .from("blogs")
    .select("cover_image_url, content")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("blogs").delete().eq("id", id);

  if (error) {
    console.error("deleteBlog error:", error);
    return { error: error.message };
  }

  await deleteStorageUrls([
    prev?.cover_image_url ?? null,
    ...extractMediaUrlsFromHtml(prev?.content),
  ]);

  revalidatePath("/dashboard/blogs");
  revalidatePath("/blogs");
  revalidateTag(TAGS.blogs, "max");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Publish Blog
// ---------------------------------------------------------------------------

export async function publishBlog(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();

  if (!userId) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("blogs")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", id);

  if (error) {
    console.error("publishBlog error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/blogs");
  revalidatePath("/blogs");
  revalidateTag(TAGS.blogs, "max");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Unpublish Blog
// ---------------------------------------------------------------------------

export async function unpublishBlog(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();

  if (!userId) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("blogs")
    .update({
      status: "draft",
      published_at: null,
      updated_by: userId,
    })
    .eq("id", id);

  if (error) {
    console.error("unpublishBlog error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/blogs");
  revalidatePath("/blogs");
  revalidateTag(TAGS.blogs, "max");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Bulk operations (dashboard multi-select)
// ---------------------------------------------------------------------------

/** Publish or unpublish many blogs at once. */
export async function bulkSetBlogStatus(
  ids: string[],
  status: "published" | "draft",
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };
  if (ids.length === 0) return { error: "Nothing selected." };

  const { error } = await supabase
    .from("blogs")
    .update({
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
      updated_by: userId,
    })
    .in("id", ids);

  if (error) {
    console.error("bulkSetBlogStatus error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/blogs");
  revalidatePath("/blogs");
  revalidateTag(TAGS.blogs, "max");
  return { success: true };
}

/** Feature or unfeature many blogs at once. */
export async function bulkSetBlogFeatured(
  ids: string[],
  featured: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };
  if (ids.length === 0) return { error: "Nothing selected." };

  const { error } = await supabase
    .from("blogs")
    .update({ featured, updated_by: userId })
    .in("id", ids);

  if (error) {
    console.error("bulkSetBlogFeatured error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/blogs");
  revalidatePath("/blogs");
  revalidateTag(TAGS.blogs, "max");
  return { success: true };
}

/** Permanently delete many blogs, cleaning up their storage assets. */
export async function bulkDeleteBlogs(ids: string[]): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };
  if (ids.length === 0) return { error: "Nothing selected." };

  // Collect every referenced asset before the rows go (storage won't cascade).
  const { data: rows } = await supabase
    .from("blogs")
    .select("cover_image_url, content")
    .in("id", ids);

  const { error } = await supabase.from("blogs").delete().in("id", ids);
  if (error) {
    console.error("bulkDeleteBlogs error:", error);
    return { error: error.message };
  }

  const urls: (string | null)[] = [];
  for (const r of (rows ?? []) as {
    cover_image_url: string | null;
    content: string | null;
  }[]) {
    urls.push(r.cover_image_url);
    urls.push(...extractMediaUrlsFromHtml(r.content));
  }
  await deleteStorageUrls(urls);

  revalidatePath("/dashboard/blogs");
  revalidatePath("/blogs");
  revalidateTag(TAGS.blogs, "max");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Auto-save Draft (lightweight update — no slug re-check)
// ---------------------------------------------------------------------------

export async function autosaveBlog(
  id: string,
  fields: Partial<BlogFormData>,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();

  if (!userId) {
    return { error: "Not authenticated" };
  }

  const updateData: Record<string, unknown> = { updated_by: userId };

  if (fields.title !== undefined) updateData.title = fields.title;
  if (fields.content !== undefined) {
    updateData.content = sanitizeBlogContent(fields.content);
    updateData.reading_time = calculateReadingTime(fields.content);
  }
  if (fields.excerpt !== undefined) updateData.excerpt = fields.excerpt;
  if (fields.cover_image_url !== undefined)
    updateData.cover_image_url = fields.cover_image_url;
  if (fields.author !== undefined) updateData.author = fields.author;
  if (fields.categories !== undefined)
    updateData.categories = fields.categories;
  if (fields.tags !== undefined) updateData.tags = fields.tags;
  if (fields.seo_title !== undefined) updateData.seo_title = fields.seo_title;
  if (fields.seo_description !== undefined)
    updateData.seo_description = fields.seo_description;

  const { error } = await supabase
    .from("blogs")
    .update(updateData)
    .eq("id", id);

  if (error) {
    console.error("autosaveBlog error:", error);
    return { error: error.message };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Customer Blog Submission Types
// ---------------------------------------------------------------------------

export interface CustomerBlogFormData {
  title: string;
  excerpt: string;
  content: string;
  cover_image_url: string;
  categories: string[];
  tags: string[];
}

// ---------------------------------------------------------------------------
// Submit Customer Blog (creates with 'pending_review' status)
// ---------------------------------------------------------------------------

export async function submitCustomerBlog(
  formData: CustomerBlogFormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated. Please sign in to submit a blog." };
  }

  // Store feature settings gate this whole flow: submissions can be switched
  // off entirely, and the approval queue can be bypassed (direct publish).
  const settings = await getStoreSettings();
  if (!settings["blogs.customerSubmissions"]) {
    return { error: "Blog submissions are currently disabled on this store." };
  }
  const requireApproval = settings["blogs.requireApproval"];

  // Verify user is a customer
  const { data: customer } = await supabase
    .from("users")
    .select("id, first_name, last_name")
    .eq("id", user.id)
    .single();

  if (!customer) {
    return {
      error: "Customer profile not found. Please complete your profile first.",
    };
  }

  if (!formData.title.trim()) {
    return { error: "Title is required." };
  }

  if (!formData.content.trim()) {
    return { error: "Blog content is required." };
  }

  const storeId = await getCurrentStoreId();
  const taxonomy = await validateCustomerTaxonomy(supabase, storeId, formData);
  if (taxonomy.error !== undefined) return { error: taxonomy.error };

  const readingTime = calculateReadingTime(formData.content);
  const authorName = `${customer.first_name}${customer.last_name ? " " + customer.last_name : ""}`;

  const base = slugify(formData.title);
  const { slug: firstSlug, bump } = await resolveSlug(supabase, base, storeId);
  let slug = firstSlug;

  const row = (s: string) => ({
    title: formData.title.trim(),
    slug: s,
    excerpt: formData.excerpt.trim() || null,
    content: sanitizeBlogContent(formData.content),
    cover_image_url: formData.cover_image_url || null,
    author: authorName,
    categories: taxonomy.categories,
    tags: taxonomy.tags,
    status: "pending_review",
    featured: false,
    reading_time: readingTime,
    submitted_by: user.id,
    is_customer_submission: true,
    created_by: user.id,
    updated_by: user.id,
    store_id: storeId,
  });

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("blogs")
      .insert(row(slug))
      .select()
      .single();

    if (!error) {
      // Direct publish (store setting): RLS only lets a customer insert
      // pending_review rows, so after the trusted setting check above the
      // promotion runs with the service-role client. A promotion failure
      // leaves the post safely in the review queue.
      if (!requireApproval && data?.id) {
        const admin = createAdminClient();
        const { error: promoteError } = await admin
          .from("blogs")
          .update({
            status: "published",
            published_at: new Date().toISOString(),
          })
          .eq("id", data.id as string)
          .eq("status", "pending_review");
        if (promoteError) {
          console.error("submitCustomerBlog promote error:", promoteError);
        } else {
          revalidatePath("/blogs");
          revalidateTag(TAGS.blogs, "max");
        }
      }

      revalidatePath("/dashboard/blogs");
      return { success: true, data: data as Record<string, unknown> };
    }

    if (!isUniqueViolation(error)) {
      console.error("submitCustomerBlog error:", error);
      return { error: error.message };
    }

    slug = bump(slug);
  }

  return { error: "Could not generate a unique slug. Please try again." };
}

// ---------------------------------------------------------------------------
// Save Customer Blog Draft (create or update a private draft)
// A draft only needs a title — everything else can be filled in later. Drafts
// are never publicly visible and never enter the review queue until the author
// submits them. Pass `id` to keep updating the same draft.
// ---------------------------------------------------------------------------

export async function saveCustomerBlogDraft(
  formData: CustomerBlogFormData,
  id?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated. Please sign in to save a draft." };
  }

  const settings = await getStoreSettings();
  if (!settings["blogs.customerSubmissions"]) {
    return { error: "Blog submissions are currently disabled on this store." };
  }

  const { data: customer } = await supabase
    .from("users")
    .select("id, first_name, last_name")
    .eq("id", user.id)
    .single();

  if (!customer) {
    return {
      error: "Customer profile not found. Please complete your profile first.",
    };
  }

  if (!formData.title.trim()) {
    return { error: "Add a title before saving your draft." };
  }

  const readingTime = calculateReadingTime(formData.content || "");

  // Update an existing draft — scoped to the author's own draft rows so a
  // submitted/published post can't be silently pulled back here.
  if (id) {
    const { error } = await supabase
      .from("blogs")
      .update({
        title: formData.title.trim(),
        excerpt: formData.excerpt.trim() || null,
        content: sanitizeBlogContent(formData.content || ""),
        cover_image_url: formData.cover_image_url || null,
        categories: formData.categories ?? [],
        tags: formData.tags ?? [],
        reading_time: readingTime,
        updated_by: user.id,
        status: "draft",
      })
      .eq("id", id)
      .eq("submitted_by", user.id)
      .eq("status", "draft");

    if (error) {
      console.error("saveCustomerBlogDraft update error:", error);
      return { error: error.message };
    }
    revalidatePath("/dashboard/blogs");
    return { success: true, data: { id } };
  }

  // Create a new draft.
  const storeId = await getCurrentStoreId();
  const authorName = `${customer.first_name}${customer.last_name ? " " + customer.last_name : ""}`;
  const base = slugify(formData.title);
  const { slug: firstSlug, bump } = await resolveSlug(supabase, base, storeId);
  let slug = firstSlug;

  const row = (s: string) => ({
    title: formData.title.trim(),
    slug: s,
    excerpt: formData.excerpt.trim() || null,
    content: sanitizeBlogContent(formData.content || ""),
    cover_image_url: formData.cover_image_url || null,
    author: authorName,
    categories: formData.categories ?? [],
    tags: formData.tags ?? [],
    status: "draft",
    featured: false,
    reading_time: readingTime,
    submitted_by: user.id,
    is_customer_submission: true,
    created_by: user.id,
    updated_by: user.id,
    store_id: storeId,
  });

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("blogs")
      .insert(row(slug))
      .select("id")
      .single();

    if (!error) {
      revalidatePath("/dashboard/blogs");
      return { success: true, data: data as Record<string, unknown> };
    }
    if (!isUniqueViolation(error)) {
      console.error("saveCustomerBlogDraft insert error:", error);
      return { error: error.message };
    }
    slug = bump(slug);
  }

  return { error: "Could not generate a unique slug. Please try again." };
}

// ---------------------------------------------------------------------------
// Update Customer Blog — saves edits and submits for review. Works on the
// author's own draft (promotes it to pending_review) or an already-pending row.
// ---------------------------------------------------------------------------

export async function updateCustomerBlog(
  id: string,
  formData: CustomerBlogFormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const settings = await getStoreSettings();
  if (!settings["blogs.customerSubmissions"]) {
    return { error: "Blog submissions are currently disabled on this store." };
  }
  const requireApproval = settings["blogs.requireApproval"];

  if (!formData.title.trim()) {
    return { error: "Title is required." };
  }

  if (!formData.content.trim()) {
    return { error: "Blog content is required." };
  }

  const storeId = await getCurrentStoreId();
  const taxonomy = await validateCustomerTaxonomy(supabase, storeId, formData);
  if (taxonomy.error !== undefined) return { error: taxonomy.error };

  const readingTime = calculateReadingTime(formData.content);

  // The author's current cover + body images, so replaced/removed ones can be
  // purged after saving.
  const { data: prev } = await supabase
    .from("blogs")
    .select("cover_image_url, content")
    .eq("id", id)
    .eq("submitted_by", user.id)
    .single();

  const { error } = await supabase
    .from("blogs")
    .update({
      title: formData.title.trim(),
      excerpt: formData.excerpt.trim() || null,
      content: sanitizeBlogContent(formData.content),
      cover_image_url: formData.cover_image_url || null,
      categories: taxonomy.categories,
      tags: taxonomy.tags,
      reading_time: readingTime,
      updated_by: user.id,
      // Drafts are promoted to the review queue; already-pending rows stay put.
      status: "pending_review",
    })
    .eq("id", id)
    .eq("submitted_by", user.id)
    .in("status", ["draft", "pending_review"]);

  if (error) {
    console.error("updateCustomerBlog error:", error);
    return { error: error.message };
  }

  // Direct publish (store setting): same service-role promotion as
  // submitCustomerBlog — RLS caps a customer's own writes at pending_review.
  if (!requireApproval) {
    const admin = createAdminClient();
    const { error: promoteError } = await admin
      .from("blogs")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", id)
      .eq("submitted_by", user.id)
      .eq("status", "pending_review");
    if (promoteError) {
      console.error("updateCustomerBlog promote error:", promoteError);
    } else {
      revalidatePath("/blogs");
      revalidateTag(TAGS.blogs, "max");
    }
  }

  const oldRefs = [
    ...(prev?.cover_image_url ? [prev.cover_image_url] : []),
    ...extractMediaUrlsFromHtml(prev?.content),
  ];
  const newRefs = new Set([
    ...(formData.cover_image_url ? [formData.cover_image_url] : []),
    ...extractMediaUrlsFromHtml(formData.content),
  ]);
  await deleteStorageUrls(oldRefs.filter((u) => !newRefs.has(u)));

  revalidatePath("/dashboard/blogs");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Get My Submissions (customer's own blog submissions)
// ---------------------------------------------------------------------------

export async function getMySubmissions(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const { data, error } = await supabase
    .from("blogs")
    .select(
      "id, title, slug, excerpt, content, cover_image_url, author, status, categories, tags, reading_time, created_at, updated_at, submitted_by, is_customer_submission",
    )
    .eq("submitted_by", user.id)
    .eq("is_customer_submission", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getMySubmissions error:", error);
    return { error: error.message };
  }

  return { success: true, data: { submissions: data } };
}

// ---------------------------------------------------------------------------
// Delete Customer Blog (author withdraws their own draft / pending submission)
// ---------------------------------------------------------------------------

export async function deleteCustomerBlog(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const { data, error } = await supabase
    .from("blogs")
    .delete()
    .eq("id", id)
    .eq("submitted_by", user.id)
    .in("status", ["draft", "pending_review"])
    .select("id, cover_image_url, content");

  if (error) {
    console.error("deleteCustomerBlog error:", error);
    return { error: error.message };
  }
  // No row removed → either it isn't theirs, already published, or the delete
  // policy hasn't been applied yet. Surface it rather than failing silently.
  if (!data || data.length === 0) {
    return {
      error: "Couldn't delete this blog. Please refresh and try again.",
    };
  }

  const removed = data[0] as {
    cover_image_url?: string | null;
    content?: string | null;
  };
  await deleteStorageUrls([
    removed.cover_image_url ?? null,
    ...extractMediaUrlsFromHtml(removed.content),
  ]);

  revalidatePath("/dashboard/blogs");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Move a pending submission back to draft (author withdraws from review)
// ---------------------------------------------------------------------------

export async function revertCustomerBlogToDraft(
  id: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const { data, error } = await supabase
    .from("blogs")
    .update({ status: "draft", updated_by: user.id })
    .eq("id", id)
    .eq("submitted_by", user.id)
    .eq("status", "pending_review")
    .select("id");

  if (error) {
    console.error("revertCustomerBlogToDraft error:", error);
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return {
      error: "Couldn't move this blog to draft. Please refresh and try again.",
    };
  }

  revalidatePath("/dashboard/blogs");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Approve Customer Blog (admin only — sets status to 'published')
// ---------------------------------------------------------------------------

export async function approveCustomerBlog(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();

  if (!userId) {
    return { error: "Not authenticated" };
  }

  const { data: approved, error } = await supabase
    .from("blogs")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", id)
    .eq("status", "pending_review")
    .select("title, slug, submitted_by")
    .single();

  if (error) {
    console.error("approveCustomerBlog error:", error);
    return { error: error.message };
  }

  // Notify the author that their blog is live (best-effort — a mail failure
  // must not undo the approval).
  if (approved?.submitted_by) {
    const contact = await getCustomerContact(approved.submitted_by);
    if (contact?.email) {
      const brand = await getStoreBrand();
      await sendBlogApprovedEmail({
        to: contact.email,
        firstName: contact.firstName,
        title: approved.title,
        slug: approved.slug,
        brand,
      });
    }
  }

  revalidatePath("/dashboard/blogs");
  revalidatePath("/blogs");
  revalidateTag(TAGS.blogs, "max");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Reject Customer Blog (admin only — deletes the blog)
// ---------------------------------------------------------------------------

export async function rejectCustomerBlog(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();

  if (!userId) {
    return { error: "Not authenticated" };
  }

  // Capture the author + title before deleting so we can email them after.
  const { data: target } = await supabase
    .from("blogs")
    .select("title, submitted_by")
    .eq("id", id)
    .eq("status", "pending_review")
    .single();

  const { error } = await supabase
    .from("blogs")
    .delete()
    .eq("id", id)
    .eq("status", "pending_review");

  if (error) {
    console.error("rejectCustomerBlog error:", error);
    return { error: error.message };
  }

  // Notify the author that their submission wasn't approved (best-effort).
  if (target?.submitted_by) {
    const contact = await getCustomerContact(target.submitted_by);
    if (contact?.email) {
      const brand = await getStoreBrand();
      await sendBlogRejectedEmail({
        to: contact.email,
        firstName: contact.firstName,
        title: target.title,
        brand,
      });
    }
  }

  revalidatePath("/dashboard/blogs");
  return { success: true };
}
