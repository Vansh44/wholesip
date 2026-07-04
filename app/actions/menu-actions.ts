"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { TAGS } from "@/lib/storefront/tags";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";
import {
  normalizeMenus,
  sanitizeMenusForSave,
  type StoreMenus,
} from "@/lib/menus";

// Per-store navigation editor actions (/dashboard/navigation). The storefront
// reads menus via the cached getStoreMenus (public); these are the admin
// read/write side. Gated on the `navigation` permission section.

/**
 * Current menus for the editor — the store's stored row, or DEFAULT_MENUS when
 * a field is empty/absent (so the editor always opens with usable nav to tweak).
 */
export async function getStoreMenusForEditor(): Promise<StoreMenus> {
  const storeId = await getActingStoreId();
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_menus")
    .select("header, footer_groups, footer_legal")
    .eq("store_id", storeId)
    .maybeSingle();
  return normalizeMenus(data);
}

export async function saveStoreMenus(
  input: unknown,
): Promise<{ success?: boolean; error?: string }> {
  const userId = await getManagerUserId("navigation");
  if (!userId) return { error: "Not authorized." };
  const storeId = await getActingStoreId();

  const menus = sanitizeMenusForSave(input);
  const admin = createAdminClient();
  const { error } = await admin.from("store_menus").upsert(
    {
      store_id: storeId,
      header: menus.header,
      footer_groups: menus.footerGroups,
      footer_legal: menus.footerLegal,
      updated_by: userId,
    },
    { onConflict: "store_id" },
  );
  if (error) {
    console.error("saveStoreMenus error:", error.message);
    return { error: "Could not save navigation. Please try again." };
  }

  revalidateTag(TAGS.menus, "max");
  revalidatePath("/", "layout"); // header/footer render on every storefront route
  return { success: true };
}
