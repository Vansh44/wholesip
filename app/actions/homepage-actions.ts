"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { TAGS } from "@/lib/storefront/tags";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";
import { deleteStorageUrls } from "@/lib/supabase/storage-cleanup";
import {
  validateConfig,
  type HomepageSectionType,
} from "@/lib/homepage/section-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionResult {
  success?: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Allowed when the caller's role grants `manage` on the Homepage section.
async function getAdminUserId(): Promise<string | null> {
  return getManagerUserId("homepage");
}

function revalidateHomepage() {
  revalidatePath("/dashboard/homepage");
  revalidatePath("/"); // storefront homepage route
  revalidateTag(TAGS.homepage, "max");
}

// Pull a promo banner's stored image url (for cleanup). Non-banner rows → null.
function bannerImage(type: string, config: unknown): string | null {
  if (type !== "promo_banner") return null;
  const url = (config as { image_url?: unknown } | null)?.image_url;
  return typeof url === "string" && url ? url : null;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createSection(
  type: HomepageSectionType,
  rawConfig: unknown,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();

  const result = validateConfig(type, rawConfig);
  if ("error" in result) return { error: result.error };

  // Append at the end.
  const { data: last } = await supabase
    .from("homepage_sections")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("homepage_sections")
    .insert({
      type,
      config: result.config,
      sort_order: nextOrder,
      enabled: true,
      store_id: storeId,
    })
    .select()
    .single();

  if (error) {
    console.error("createSection error:", error);
    return { error: error.message };
  }
  revalidateHomepage();
  return { success: true, data: data as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Update (config only — type is immutable to avoid config-shape mismatch)
// ---------------------------------------------------------------------------

export async function updateSection(
  id: string,
  rawConfig: unknown,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const { data: existing } = await supabase
    .from("homepage_sections")
    .select("type, config")
    .eq("id", id)
    .single();
  if (!existing) return { error: "Section not found." };

  const type = existing.type as HomepageSectionType;
  const result = validateConfig(type, rawConfig);
  if ("error" in result) return { error: result.error };

  const { error } = await supabase
    .from("homepage_sections")
    .update({ config: result.config })
    .eq("id", id);

  if (error) {
    console.error("updateSection error:", error);
    return { error: error.message };
  }

  // Purge a replaced/cleared banner image from storage.
  const oldImage = bannerImage(type, existing.config);
  const newImage = bannerImage(type, result.config);
  if (oldImage && oldImage !== newImage) await deleteStorageUrls([oldImage]);

  revalidateHomepage();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteSection(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const { data: existing } = await supabase
    .from("homepage_sections")
    .select("type, config")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("homepage_sections")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteSection error:", error);
    return { error: error.message };
  }

  const img = existing ? bannerImage(existing.type, existing.config) : null;
  if (img) await deleteStorageUrls([img]);

  revalidateHomepage();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Toggle enabled
// ---------------------------------------------------------------------------

export async function toggleSection(
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("homepage_sections")
    .update({ enabled })
    .eq("id", id);

  if (error) {
    console.error("toggleSection error:", error);
    return { error: error.message };
  }
  revalidateHomepage();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Reorder — sort_order becomes the index of each id in the given order.
// A handful of rows, so per-row updates are fine.
// ---------------------------------------------------------------------------

export async function reorderSections(
  orderedIds: string[],
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const results = await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("homepage_sections").update({ sort_order: i }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("reorderSections error:", failed.error);
    return { error: failed.error.message };
  }

  revalidateHomepage();
  return { success: true };
}
