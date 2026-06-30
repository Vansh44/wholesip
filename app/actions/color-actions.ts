"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { TAGS } from "@/lib/storefront/tags";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";

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
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();

  if (!formData.name.trim()) return { error: "Name is required." };
  const hex = normalizeHex(formData.hex);
  if (!hex) return { error: "Enter a valid hex colour (e.g. #f4dfe0)." };

  const { data, error } = await supabase
    .from("card_colors")
    .insert({
      name: formData.name.trim(),
      hex,
      sort_order: formData.sort_order ?? 0,
      store_id: storeId,
    })
    .select()
    .single();

  if (error) {
    console.error("createCardColor error:", error);
    return { error: error.message };
  }
  revalidateColors();
  return { success: true, data: data as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateCardColor(
  id: string,
  formData: CardColorFormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  if (!formData.name.trim()) return { error: "Name is required." };
  const hex = normalizeHex(formData.hex);
  if (!hex) return { error: "Enter a valid hex colour (e.g. #f4dfe0)." };

  const { error } = await supabase
    .from("card_colors")
    .update({
      name: formData.name.trim(),
      hex,
      sort_order: formData.sort_order ?? 0,
    })
    .eq("id", id);

  if (error) {
    console.error("updateCardColor error:", error);
    return { error: error.message };
  }
  revalidateColors();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
// Products keep their stored hex (products.card_color) even if the palette
// entry is removed — deleting a shade just takes it out of the dropdown.

export async function deleteCardColor(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const { error } = await supabase.from("card_colors").delete().eq("id", id);
  if (error) {
    console.error("deleteCardColor error:", error);
    return { error: error.message };
  }
  revalidateColors();
  return { success: true };
}
