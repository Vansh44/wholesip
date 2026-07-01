"use server";

import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActingStoreId } from "@/app/dashboard/lib/access";
import { STORE_TAG } from "@/lib/store/resolve";
import { brandFromSettings, type StoreBrand } from "@/lib/store/brand";

export interface ActionResult {
  success?: boolean;
  error?: string;
}

// Current brand for the acting admin's store (full object incl. defaults),
// used to pre-fill the dashboard editor.
export async function getStoreBrandingForEditor(): Promise<StoreBrand> {
  const storeId = await getActingStoreId();
  const admin = createAdminClient();
  const { data } = await admin
    .from("stores")
    .select("name, settings, slug, custom_domain")
    .eq("id", storeId)
    .single();
  const domain =
    data?.custom_domain || `${data?.slug || "store"}.storemink.com`;
  return brandFromSettings(
    (data?.settings as Record<string, unknown>) ?? {},
    (data?.name as string) ?? "Store",
    domain,
  );
}

function clean(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

// Persist branding from the dashboard editor. Merges into settings.brand,
// preserves any other settings (and badges, which the editor doesn't expose
// yet), and busts the store-lookup cache so the storefront updates at once.
export async function saveStoreBranding(
  formData: FormData,
): Promise<ActionResult> {
  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  const name = clean(formData.get("name"));
  if (!name) return { error: "Store name is required." };

  const { data: store } = await admin
    .from("stores")
    .select("settings")
    .eq("id", storeId)
    .single();
  const settings = ((store?.settings as Record<string, unknown>) ??
    {}) as Record<string, unknown>;
  const existingBrand = (settings.brand as Record<string, unknown>) ?? {};

  const brand = {
    ...existingBrand, // keep fields the editor doesn't manage (e.g. badges)
    name,
    logoUrl: clean(formData.get("logoUrl")),
    primaryColor: clean(formData.get("primaryColor")) ?? "#1f7a5a",
    tagline: clean(formData.get("tagline")),
    blurb: clean(formData.get("blurb")),
    legalName: clean(formData.get("legalName")),
    creditLine: clean(formData.get("creditLine")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    hours: clean(formData.get("hours")),
    social: {
      instagram: clean(formData.get("instagram")),
      youtube: clean(formData.get("youtube")),
      whatsapp: clean(formData.get("whatsapp")),
    },
  };

  const { error } = await admin
    .from("stores")
    .update({ settings: { ...settings, brand }, name })
    .eq("id", storeId);

  if (error) {
    console.error("saveStoreBranding:", error.message);
    return { error: "Could not save branding. Please try again." };
  }

  revalidateTag(STORE_TAG);
  return { success: true };
}
