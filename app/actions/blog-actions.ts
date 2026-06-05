"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sanitizeBlogContent } from "@/lib/sanitize";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendBlogApprovedEmail,
  sendBlogRejectedEmail,
} from "@/lib/email/blog-notifications";

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

// Returns the caller's id only if they hold an admin role (superadmin/member).
// RLS already enforces this at the DB layer; this is an app-layer backstop so
// a misconfigured policy can't silently open these actions to any user.
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
      .from("customers")
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
  excludeId?: string,
) {
  let query = supabase.from("blogs").select("slug").like("slug", `${base}%`);
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

  const base = formData.slug || slugify(formData.title);
  const { slug: firstSlug, bump } = await resolveSlug(supabase, base);
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
  });

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("blogs")
      .insert(row(slug))
      .select()
      .single();

    if (!error) {
      revalidatePath("/dashboard/blogs");
      revalidatePath("/pages/blogs");
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

  // Check slug uniqueness (exclude current blog)
  const base = formData.slug || slugify(formData.title);
  const { slug: firstSlug, bump } = await resolveSlug(supabase, base, id);
  let slug = firstSlug;

  // Get current blog to check if it was previously unpublished, and whether
  // this is a customer submission awaiting review (so we can notify the author
  // when an admin approves it by publishing from the editor).
  const { data: currentBlog } = await supabase
    .from("blogs")
    .select("status, published_at, submitted_by, is_customer_submission")
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
          await sendBlogApprovedEmail({
            to: contact.email,
            firstName: contact.firstName,
            title: formData.title,
            slug,
          });
        }
      }

      revalidatePath("/dashboard/blogs");
      revalidatePath("/pages/blogs");
      revalidatePath(`/pages/blogs/${slug}`);
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

  const { error } = await supabase.from("blogs").delete().eq("id", id);

  if (error) {
    console.error("deleteBlog error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/blogs");
  revalidatePath("/pages/blogs");
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
  revalidatePath("/pages/blogs");
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
  revalidatePath("/pages/blogs");
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

  // Verify user is a customer
  const { data: customer } = await supabase
    .from("customers")
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

  const readingTime = calculateReadingTime(formData.content);
  const authorName = `${customer.first_name}${customer.last_name ? " " + customer.last_name : ""}`;

  const base = slugify(formData.title);
  const { slug: firstSlug, bump } = await resolveSlug(supabase, base);
  let slug = firstSlug;

  const row = (s: string) => ({
    title: formData.title.trim(),
    slug: s,
    excerpt: formData.excerpt.trim() || null,
    content: sanitizeBlogContent(formData.content),
    cover_image_url: formData.cover_image_url || null,
    author: authorName,
    categories: formData.categories.length > 0 ? formData.categories : [],
    tags: formData.tags.length > 0 ? formData.tags : [],
    status: "pending_review",
    featured: false,
    reading_time: readingTime,
    submitted_by: user.id,
    is_customer_submission: true,
    created_by: user.id,
    updated_by: user.id,
  });

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("blogs")
      .insert(row(slug))
      .select()
      .single();

    if (!error) {
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
// Update Customer Blog (only while status is 'pending_review')
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

  if (!formData.title.trim()) {
    return { error: "Title is required." };
  }

  if (!formData.content.trim()) {
    return { error: "Blog content is required." };
  }

  const readingTime = calculateReadingTime(formData.content);

  const { error } = await supabase
    .from("blogs")
    .update({
      title: formData.title.trim(),
      excerpt: formData.excerpt.trim() || null,
      content: sanitizeBlogContent(formData.content),
      cover_image_url: formData.cover_image_url || null,
      categories: formData.categories.length > 0 ? formData.categories : [],
      tags: formData.tags.length > 0 ? formData.tags : [],
      reading_time: readingTime,
      updated_by: user.id,
    })
    .eq("id", id)
    .eq("submitted_by", user.id)
    .eq("status", "pending_review");

  if (error) {
    console.error("updateCustomerBlog error:", error);
    return { error: error.message };
  }

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
      await sendBlogApprovedEmail({
        to: contact.email,
        firstName: contact.firstName,
        title: approved.title,
        slug: approved.slug,
      });
    }
  }

  revalidatePath("/dashboard/blogs");
  revalidatePath("/pages/blogs");
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
      await sendBlogRejectedEmail({
        to: contact.email,
        firstName: contact.firstName,
        title: target.title,
      });
    }
  }

  revalidatePath("/dashboard/blogs");
  return { success: true };
}
