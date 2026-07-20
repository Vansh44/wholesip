"use server";

import { eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { withService } from "@/lib/db/client";
import { storeMenus } from "@/drizzle/schema";
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
  try {
    const rows = await withService((db) =>
      db
        .select({
          header: storeMenus.header,
          footer_groups: storeMenus.footerGroups,
          footer_legal: storeMenus.footerLegal,
        })
        .from(storeMenus)
        .where(eq(storeMenus.storeId, storeId))
        .limit(1),
    );
    return normalizeMenus(rows[0] ?? null);
  } catch (err) {
    console.error(
      "getStoreMenusForEditor:",
      err instanceof Error ? err.message : err,
    );
    return normalizeMenus(null);
  }
}

export async function saveStoreMenus(
  input: unknown,
): Promise<{ success?: boolean; error?: string }> {
  const userId = await getManagerUserId("navigation");
  if (!userId) return { error: "Not authorized." };
  const storeId = await getActingStoreId();

  const menus = sanitizeMenusForSave(input);
  const updateFields = {
    header: menus.header,
    footerGroups: menus.footerGroups,
    footerLegal: menus.footerLegal,
    updatedBy: userId,
  };
  try {
    // One row per store: upsert keyed on store_id.
    await withService((db) =>
      db
        .insert(storeMenus)
        .values({ storeId, ...updateFields })
        .onConflictDoUpdate({
          target: storeMenus.storeId,
          set: updateFields,
        }),
    );
  } catch (err) {
    console.error(
      "saveStoreMenus error:",
      err instanceof Error ? err.message : err,
    );
    return { error: "Could not save navigation. Please try again." };
  }

  revalidateTag(TAGS.menus, "max");
  revalidatePath("/", "layout"); // header/footer render on every storefront route
  return { success: true };
}
