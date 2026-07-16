"use server";

import { eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { TAGS } from "@/lib/storefront/tags";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";
import { withUser } from "@/lib/db/client";
import { cardColors } from "@/drizzle/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardColorFormData {
  name: string;
  hex: string;
  sort_order: number;
}

export interface ActionResult {
  success?: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Allowed when the caller's role grants `manage` on the Colours section.
async function getAdminUserId(): Promise<string | null> {
  return getManagerUserId("colors");
}

// Normalize to a 6-digit lowercase hex (#rrggbb). Returns null if invalid.
function normalizeHex(input: string): string | null {
  const v = input.trim().toLowerCase();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${h}`;
}

function revalidateColors() {
  revalidatePath("/dashboard/colors");
  revalidatePath("/dashboard/products");
  revalidatePath("/shop");
  // Card colors render on product cards — refresh the cached product reads.
  revalidateTag(TAGS.products, "max");
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createCardColor(
  formData: CardColorFormData,
): Promise<ActionResult> {
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();

  if (!formData.name.trim()) return { error: "Name is required." };
  const hex = normalizeHex(formData.hex);
  if (!hex) return { error: "Enter a valid hex colour (e.g. #f4dfe0)." };

  try {
    // RLS (is_store_admin) gates the insert against the caller's store.
    const [row] = await withUser({ uid: userId }, (db) =>
      db
        .insert(cardColors)
        .values({
          name: formData.name.trim(),
          hex,
          sortOrder: formData.sort_order ?? 0,
          storeId,
        })
        .returning(),
    );
    revalidateColors();
    return { success: true, data: row as Record<string, unknown> };
  } catch (err) {
    console.error("createCardColor error:", err);
    return {
      error: err instanceof Error ? err.message : "Failed to create colour.",
    };
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateCardColor(
  id: string,
  formData: CardColorFormData,
): Promise<ActionResult> {
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  if (!formData.name.trim()) return { error: "Name is required." };
  const hex = normalizeHex(formData.hex);
  if (!hex) return { error: "Enter a valid hex colour (e.g. #f4dfe0)." };

  try {
    // No store filter needed: RLS (is_store_admin) confines the update to the
    // caller's own store; updated_at is maintained by the DB trigger.
    await withUser({ uid: userId }, (db) =>
      db
        .update(cardColors)
        .set({
          name: formData.name.trim(),
          hex,
          sortOrder: formData.sort_order ?? 0,
        })
        .where(eq(cardColors.id, id)),
    );
    revalidateColors();
    return { success: true };
  } catch (err) {
    console.error("updateCardColor error:", err);
    return {
      error: err instanceof Error ? err.message : "Failed to update colour.",
    };
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
// Products keep their stored hex (products.card_color) even if the palette
// entry is removed — deleting a shade just takes it out of the dropdown.

export async function deleteCardColor(id: string): Promise<ActionResult> {
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  try {
    // RLS (is_store_admin) confines the delete to the caller's own store.
    await withUser({ uid: userId }, (db) =>
      db.delete(cardColors).where(eq(cardColors.id, id)),
    );
    revalidateColors();
    return { success: true };
  } catch (err) {
    console.error("deleteCardColor error:", err);
    return {
      error: err instanceof Error ? err.message : "Failed to delete colour.",
    };
  }
}
