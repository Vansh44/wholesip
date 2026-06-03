"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import sanitizeHtml from "sanitize-html";

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
  status: "draft" | "published";
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

async function getAdminUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

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

  let slug = formData.slug || slugify(formData.title);

  // Handle duplicate slugs
  const { data: existingSlugs } = await supabase
    .from("blogs")
    .select("slug")
    .like("slug", `${slug}%`);

  if (existingSlugs && existingSlugs.length > 0) {
    const slugSet = new Set(existingSlugs.map((b) => b.slug));
    if (slugSet.has(slug)) {
      let counter = 2;
      while (slugSet.has(`${slug}-${counter}`)) {
        counter++;
      }
      slug = `${slug}-${counter}`;
    }
  }

  const { data, error } = await supabase
    .from("blogs")
    .insert({
      title: formData.title,
      slug,
      excerpt: formData.excerpt || null,
      content: formData.content
        ? sanitizeHtml(formData.content, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat([
              "img",
              "h1",
              "h2",
              "h3",
              "h4",
              "s",
              "u",
            ]),
            allowedAttributes: {
              ...sanitizeHtml.defaults.allowedAttributes,
              img: ["src", "alt", "width", "height"],
              "*": ["class", "style", "id", "data-*"],
            },
          })
        : null,
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
    })
    .select()
    .single();

  if (error) {
    console.error("createBlog error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/blogs");
  revalidatePath("/pages/blogs");
  return { success: true, data: data as Record<string, unknown> };
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
  let slug = formData.slug || slugify(formData.title);

  const { data: existingSlugs } = await supabase
    .from("blogs")
    .select("slug, id")
    .like("slug", `${slug}%`)
    .neq("id", id);

  if (existingSlugs && existingSlugs.length > 0) {
    const slugSet = new Set(existingSlugs.map((b) => b.slug));
    if (slugSet.has(slug)) {
      let counter = 2;
      while (slugSet.has(`${slug}-${counter}`)) {
        counter++;
      }
      slug = `${slug}-${counter}`;
    }
  }

  // Get current blog to check if it was previously unpublished
  const { data: currentBlog } = await supabase
    .from("blogs")
    .select("status, published_at")
    .eq("id", id)
    .single();

  const publishedAt =
    formData.status === "published"
      ? (currentBlog?.published_at ?? new Date().toISOString())
      : null;

  const { error } = await supabase
    .from("blogs")
    .update({
      title: formData.title,
      slug,
      excerpt: formData.excerpt || null,
      content: formData.content
        ? sanitizeHtml(formData.content, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat([
              "img",
              "h1",
              "h2",
              "h3",
              "h4",
              "s",
              "u",
            ]),
            allowedAttributes: {
              ...sanitizeHtml.defaults.allowedAttributes,
              img: ["src", "alt", "width", "height"],
              "*": ["class", "style", "id", "data-*"],
            },
          })
        : null,
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
    })
    .eq("id", id);

  if (error) {
    console.error("updateBlog error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/blogs");
  revalidatePath("/pages/blogs");
  revalidatePath(`/pages/blogs/${slug}`);
  return { success: true };
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
    updateData.content = fields.content;
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
