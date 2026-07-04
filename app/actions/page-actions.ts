"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";
import { TAGS } from "@/lib/storefront/tags";
import { getStoreSetting } from "@/lib/settings/resolve";
import { sanitizeBlogContent } from "@/lib/sanitize";
import {
  validatePageSlug,
  validateSections,
  type PageSectionItem,
  type RichTextConfig,
  type ValidateMode,
} from "@/lib/sections/registry";

// ---------------------------------------------------------------------------
// Website-builder page actions.
//
// All reads/writes use the SERVICE-ROLE client because the draft `sections`
// column is revoked from anon+authenticated at the DB layer (see
// store_pages.sql) — RLS/column grants can't be the gate here. So
// getManagerUserId("builder") IS the trust boundary, and every query is
// explicitly scoped by store_id (service role bypasses RLS). Never select or
// return draft `sections` to a caller that hasn't passed this gate.
// ---------------------------------------------------------------------------

export interface ActionResult {
  success?: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

/** Builder list-row shape (no draft sections). */
export interface PageListItem {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published";
  updated_at: string;
  published_at: string | null;
}

/** Full draft page for the builder editor (includes draft sections). */
export interface PageDraft extends PageListItem {
  seo_title: string;
  seo_description: string;
  seo_noindex: boolean;
  sections: PageSectionItem[];
}

function revalidatePage(slug: string) {
  revalidatePath("/dashboard/builder");
  if (slug) revalidatePath(`/${slug}`);
  revalidateTag(TAGS.pages, "max");
}

/**
 * Validate + process a draft sections array for saving: shape/size via the
 * registry, then the cross-cutting server rules — reject custom_code when the
 * store setting is off, and sanitize rich_text HTML. Returns clean items or an
 * error. mode "draft" (autosave) skips completeness rules so a mid-edit save
 * never fails; "publish" is strict.
 */
async function processSections(
  raw: unknown,
  mode: ValidateMode = "publish",
): Promise<{ sections: PageSectionItem[] } | { error: string }> {
  const result = validateSections(raw, { mode });
  if ("error" in result) return result;

  const hasCustomCode = result.sections.some((s) => s.type === "custom_code");
  if (hasCustomCode && !(await getStoreSetting("pages.customCode"))) {
    return { error: "Custom code is disabled for this store." };
  }

  const sections = result.sections.map((s) => {
    if (s.type === "rich_text") {
      const c = s.config as RichTextConfig;
      return { ...s, config: { ...c, html: sanitizeBlogContent(c.html) } };
    }
    return s;
  });
  return { sections };
}

// --- Reads (builder only) ---------------------------------------------------

export async function listPages(): Promise<PageListItem[]> {
  const userId = await getManagerUserId("builder");
  if (!userId) return [];
  const storeId = await getActingStoreId();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("store_pages")
    .select("id, slug, title, status, updated_at, published_at")
    .eq("store_id", storeId)
    .neq("slug", "") // hide the homepage sentinel from the pages list
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("listPages error:", error.message);
    return [];
  }
  return (data ?? []) as PageListItem[];
}

/**
 * The homepage is the store_pages row with the empty slug ("") — the "homepage
 * sentinel". It's edited in the builder like any page, but it's hidden from
 * listPages() and must always exist. This returns it, creating an empty draft
 * row on demand for stores that predate the homepage migration (or new stores
 * that skipped the seed). Never deletable/renamable (guarded in delete/meta).
 */
export async function ensureHomepage(): Promise<PageListItem | null> {
  const userId = await getManagerUserId("builder");
  if (!userId) return null;
  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("store_pages")
    .select("id, slug, title, status, updated_at, published_at")
    .eq("store_id", storeId)
    .eq("slug", "")
    .maybeSingle();
  if (existing) return existing as PageListItem;

  const { data: created, error } = await admin
    .from("store_pages")
    .insert({
      store_id: storeId,
      slug: "",
      title: "Home",
      status: "draft",
      sections: [],
      published_sections: [],
      created_by: userId,
      updated_by: userId,
    })
    .select("id, slug, title, status, updated_at, published_at")
    .single();
  if (error) {
    console.error("ensureHomepage error:", error.message);
    return null;
  }
  return created as PageListItem;
}

export async function getPageDraft(id: string): Promise<PageDraft | null> {
  const userId = await getManagerUserId("builder");
  if (!userId) return null;
  const storeId = await getActingStoreId();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("store_pages")
    .select(
      "id, slug, title, status, updated_at, published_at, seo_title, seo_description, seo_noindex, sections",
    )
    .eq("store_id", storeId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as PageDraft;
}

// --- Mutations --------------------------------------------------------------

export async function createPage(
  rawSlug: string,
  rawTitle: string,
): Promise<ActionResult> {
  const userId = await getManagerUserId("builder");
  if (!userId) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();

  const slugResult = validatePageSlug(rawSlug);
  if ("error" in slugResult) return { error: slugResult.error };
  const slug = slugResult.slug;
  const title = (rawTitle || "").trim() || slug;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("store_pages")
    .select("id")
    .eq("store_id", storeId)
    .eq("slug", slug)
    .maybeSingle();
  if (existing)
    return { error: `A page with the slug "${slug}" already exists.` };

  const { data, error } = await admin
    .from("store_pages")
    .insert({
      store_id: storeId,
      slug,
      title,
      status: "draft",
      sections: [],
      published_sections: [],
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    console.error("createPage error:", error.message);
    return { error: "Could not create the page. Please try again." };
  }

  revalidatePage(slug);
  return { success: true, data: { id: data.id } };
}

export async function updatePageMeta(
  id: string,
  fields: {
    title?: string;
    slug?: string;
    seo_title?: string;
    seo_description?: string;
    seo_noindex?: boolean;
  },
): Promise<ActionResult> {
  const userId = await getManagerUserId("builder");
  if (!userId) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  const { data: page } = await admin
    .from("store_pages")
    .select("slug")
    .eq("store_id", storeId)
    .eq("id", id)
    .maybeSingle();
  if (!page) return { error: "Page not found." };
  // The homepage sentinel's slug is immutable and it's never renamed here.
  const isHomepage = page.slug === "";

  const update: Record<string, unknown> = { updated_by: userId };

  if (fields.slug !== undefined && !isHomepage) {
    const slugResult = validatePageSlug(fields.slug);
    if ("error" in slugResult) return { error: slugResult.error };
    if (slugResult.slug !== page.slug) {
      const { data: clash } = await admin
        .from("store_pages")
        .select("id")
        .eq("store_id", storeId)
        .eq("slug", slugResult.slug)
        .maybeSingle();
      if (clash) return { error: `The slug "${slugResult.slug}" is taken.` };
      update.slug = slugResult.slug;
    }
  }
  if (fields.title !== undefined) update.title = fields.title.trim();
  if (fields.seo_title !== undefined)
    update.seo_title = fields.seo_title.trim();
  if (fields.seo_description !== undefined)
    update.seo_description = fields.seo_description.trim();
  if (fields.seo_noindex !== undefined)
    update.seo_noindex = !!fields.seo_noindex;

  const { error } = await admin
    .from("store_pages")
    .update(update)
    .eq("store_id", storeId)
    .eq("id", id);
  if (error) {
    console.error("updatePageMeta error:", error.message);
    return { error: "Could not save. Please try again." };
  }

  revalidatePage((update.slug as string) ?? page.slug);
  return { success: true };
}

export async function savePageDraft(
  id: string,
  rawSections: unknown,
  expectedUpdatedAt?: string,
): Promise<ActionResult> {
  const userId = await getManagerUserId("builder");
  if (!userId) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  const { data: page } = await admin
    .from("store_pages")
    .select("slug, updated_at")
    .eq("store_id", storeId)
    .eq("id", id)
    .maybeSingle();
  if (!page) return { error: "Page not found." };

  // Stale-tab guard: refuse to clobber edits saved from another tab/session.
  // data.stale lets the autosave hook distinguish this (hard block + reload)
  // from a transient failure (retry).
  if (expectedUpdatedAt && page.updated_at !== expectedUpdatedAt) {
    return {
      error:
        "This page was changed somewhere else. Reload the builder to get the latest version before saving.",
      data: { stale: true },
    };
  }

  // Draft mode: safety normalisation only — a half-configured section must
  // never make autosave fail (publish re-validates strictly).
  const processed = await processSections(rawSections, "draft");
  if ("error" in processed) return { error: processed.error };

  // .select() returns the trigger-stamped updated_at in the same round trip —
  // the client feeds it back as the next expectedUpdatedAt (stale-tab token).
  // No revalidatePath here: autosave fires every few seconds and the builder
  // list doesn't need per-keystroke freshness (create/publish/delete revalidate).
  const { data: saved, error } = await admin
    .from("store_pages")
    .update({ sections: processed.sections, updated_by: userId })
    .eq("store_id", storeId)
    .eq("id", id)
    .select("updated_at")
    .single();
  if (error) {
    console.error("savePageDraft error:", error.message);
    return { error: "Could not save the draft. Please try again." };
  }

  return { success: true, data: { updated_at: saved.updated_at as string } };
}

export async function publishPage(
  id: string,
  expectedUpdatedAt?: string,
): Promise<ActionResult> {
  const userId = await getManagerUserId("builder");
  if (!userId) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  const { data: page } = await admin
    .from("store_pages")
    .select("slug, sections, updated_at")
    .eq("store_id", storeId)
    .eq("id", id)
    .maybeSingle();
  if (!page) return { error: "Page not found." };

  // Same stale-tab guard as savePageDraft — publishing from a tab that hasn't
  // seen the latest draft would push someone else's half-finished edits live.
  if (expectedUpdatedAt && page.updated_at !== expectedUpdatedAt) {
    return {
      error:
        "This page was changed somewhere else. Reload the builder to get the latest version before publishing.",
      data: { stale: true },
    };
  }

  // Strict re-validation on publish (completeness rules + the custom-code
  // setting may have changed since the last draft save).
  const processed = await processSections(page.sections, "publish");
  if ("error" in processed) return { error: processed.error };

  const { data: saved, error } = await admin
    .from("store_pages")
    .update({
      published_sections: processed.sections,
      sections: processed.sections,
      status: "published",
      published_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("store_id", storeId)
    .eq("id", id)
    .select("updated_at, published_at")
    .single();
  if (error) {
    console.error("publishPage error:", error.message);
    return { error: "Could not publish. Please try again." };
  }

  revalidatePage(page.slug);
  return {
    success: true,
    data: {
      updated_at: saved.updated_at as string,
      published_at: saved.published_at as string,
    },
  };
}

export async function unpublishPage(id: string): Promise<ActionResult> {
  const userId = await getManagerUserId("builder");
  if (!userId) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  const { data: page } = await admin
    .from("store_pages")
    .select("slug")
    .eq("store_id", storeId)
    .eq("id", id)
    .maybeSingle();
  if (!page) return { error: "Page not found." };

  const { error } = await admin
    .from("store_pages")
    .update({ status: "draft", updated_by: userId })
    .eq("store_id", storeId)
    .eq("id", id);
  if (error) {
    console.error("unpublishPage error:", error.message);
    return { error: "Could not unpublish. Please try again." };
  }

  revalidatePage(page.slug);
  return { success: true };
}

export async function deletePage(id: string): Promise<ActionResult> {
  const userId = await getManagerUserId("builder");
  if (!userId) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  const { data: page } = await admin
    .from("store_pages")
    .select("slug")
    .eq("store_id", storeId)
    .eq("id", id)
    .maybeSingle();
  if (!page) return { error: "Page not found." };
  // The homepage sentinel is never deletable through the builder.
  if (page.slug === "") return { error: "The homepage can't be deleted." };

  const { error } = await admin
    .from("store_pages")
    .delete()
    .eq("store_id", storeId)
    .eq("id", id);
  if (error) {
    console.error("deletePage error:", error.message);
    return { error: "Could not delete the page. Please try again." };
  }

  revalidatePage(page.slug);
  return { success: true };
}
