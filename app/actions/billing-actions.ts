"use server";

import { revalidateTag, revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { TAGS } from "@/lib/storefront/tags";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";
import {
  rowToBillingSettings,
  rowToTaxClass,
  normalizeTemplate,
  type BillingSettings,
  type TaxClass,
  type InvoiceTemplate,
} from "@/lib/billing/types";

// Invoices & Billing admin actions (/dashboard/billing). Gated on the `billing`
// permission section. The storefront/checkout reads the same data cached via
// getStoreBillingSettings / getStoreTaxClasses (public); these are the write side
// (service-role after an app-layer manage check — the store_menus pattern).

const MAX = {
  name: 120,
  addr: 600,
  id: 40,
  contact: 200,
  url: 600,
  note: 800,
  terms: 4000,
};

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function cleanOrNull(v: unknown, max: number): string | null {
  const s = clean(v, max);
  return s || null;
}
function cleanRate(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n * 1000) / 1000));
}
// Accent colour renders into an inline style attr on the invoice — keep it a
// strict hex so a saved value can never inject CSS.
function safeHex(v: unknown, fallback: string): string {
  const s = clean(v, 9);
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback;
}
// Logo may be a Supabase Storage URL or a site-relative path; reject anything
// that isn't an http(s) URL or an absolute path (no javascript:/data: etc.).
function safeUrlOrNull(v: unknown): string | null {
  const s = clean(v, MAX.url);
  if (!s) return null;
  if (/^https?:\/\//i.test(s) || s.startsWith("/")) return s;
  return null;
}

export interface BillingSettingsInput {
  taxEnabled: boolean;
  pricesIncludeTax: boolean;
  defaultTaxClassId: string | null;
  businessName: string;
  businessAddress: string;
  taxId: string;
  contactEmail: string;
  contactPhone: string;
  logoUrl: string;
  invoicePrefix: string;
  accentColor: string;
  footerNote: string;
  terms: string;
  template: Partial<InvoiceTemplate>;
}

// ---- Reads (dashboard editor) --------------------------------------------

export async function getBillingForEditor(): Promise<{
  settings: BillingSettings;
  taxClasses: TaxClass[];
}> {
  const storeId = await getActingStoreId();
  const admin = createAdminClient();
  const [{ data: settingsRow }, { data: classRows }] = await Promise.all([
    admin
      .from("store_billing_settings")
      .select("*")
      .eq("store_id", storeId)
      .maybeSingle(),
    admin
      .from("tax_classes")
      .select("id, name, rate, sort_order")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);
  return {
    settings: rowToBillingSettings(
      settingsRow as Record<string, unknown> | null,
    ),
    taxClasses: (classRows ?? []).map((r) =>
      rowToTaxClass(r as Record<string, unknown>),
    ),
  };
}

// ---- Billing / invoice settings ------------------------------------------

export async function saveBillingSettings(
  input: BillingSettingsInput,
): Promise<{ success?: boolean; error?: string }> {
  const userId = await getManagerUserId("billing");
  if (!userId) return { error: "Not authorized." };
  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  // A default tax class must belong to THIS store (FK doesn't enforce tenancy).
  let defaultTaxClassId: string | null = null;
  if (input?.defaultTaxClassId) {
    const { data: owned } = await admin
      .from("tax_classes")
      .select("id")
      .eq("id", input.defaultTaxClassId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (owned) defaultTaxClassId = input.defaultTaxClassId;
  }

  const row = {
    store_id: storeId,
    tax_enabled: input?.taxEnabled === true,
    prices_include_tax: input?.pricesIncludeTax === true,
    default_tax_class_id: defaultTaxClassId,
    business_name: cleanOrNull(input?.businessName, MAX.name),
    business_address: cleanOrNull(input?.businessAddress, MAX.addr),
    tax_id: cleanOrNull(input?.taxId, MAX.id),
    contact_email: cleanOrNull(input?.contactEmail, MAX.contact),
    contact_phone: cleanOrNull(input?.contactPhone, MAX.contact),
    logo_url: safeUrlOrNull(input?.logoUrl),
    invoice_prefix: clean(input?.invoicePrefix, 10) || "INV",
    accent_color: safeHex(input?.accentColor, "#111111"),
    footer_note: cleanOrNull(input?.footerNote, MAX.note),
    terms: cleanOrNull(input?.terms, MAX.terms),
    template: normalizeTemplate(input?.template),
    updated_by: userId,
  };

  const { error } = await admin
    .from("store_billing_settings")
    .upsert(row, { onConflict: "store_id" });
  if (error) {
    console.error("saveBillingSettings error:", error.message);
    return { error: "Could not save billing settings. Please try again." };
  }

  revalidateTag(TAGS.billing, "max");
  revalidatePath("/checkout"); // checkout re-reads tax config
  return { success: true };
}

// ---- Tax classes CRUD -----------------------------------------------------

export async function createTaxClass(input: {
  name: string;
  rate: number;
}): Promise<{ success?: boolean; error?: string; id?: string }> {
  const userId = await getManagerUserId("billing");
  if (!userId) return { error: "Not authorized." };
  const storeId = await getActingStoreId();

  const name = clean(input?.name, 80);
  if (!name) return { error: "Tax class name is required." };
  const rate = cleanRate(input?.rate);

  const admin = createAdminClient();
  // Next sort_order = current count (append to the end).
  const { count } = await admin
    .from("tax_classes")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId);

  const { data, error } = await admin
    .from("tax_classes")
    .insert({ store_id: storeId, name, rate, sort_order: count ?? 0 })
    .select("id")
    .single();
  if (error || !data) {
    // 23505 = unique_violation (duplicate name for this store).
    if (error?.code === "23505")
      return { error: "A tax class with that name already exists." };
    console.error("createTaxClass error:", error?.message);
    return { error: "Could not create tax class." };
  }

  revalidateTag(TAGS.billing, "max");
  return { success: true, id: data.id as string };
}

export async function updateTaxClass(
  id: string,
  input: { name: string; rate: number },
): Promise<{ success?: boolean; error?: string }> {
  const userId = await getManagerUserId("billing");
  if (!userId) return { error: "Not authorized." };
  if (typeof id !== "string" || !id) return { error: "Invalid tax class." };
  const storeId = await getActingStoreId();

  const name = clean(input?.name, 80);
  if (!name) return { error: "Tax class name is required." };
  const rate = cleanRate(input?.rate);

  const admin = createAdminClient();
  const { error } = await admin
    .from("tax_classes")
    .update({ name, rate })
    .eq("id", id)
    .eq("store_id", storeId);
  if (error) {
    if (error.code === "23505")
      return { error: "A tax class with that name already exists." };
    console.error("updateTaxClass error:", error.message);
    return { error: "Could not update tax class." };
  }

  revalidateTag(TAGS.billing, "max");
  revalidateTag(TAGS.products, "max"); // a rate change affects product tax
  return { success: true };
}

export async function deleteTaxClass(
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  const userId = await getManagerUserId("billing");
  if (!userId) return { error: "Not authorized." };
  if (typeof id !== "string" || !id) return { error: "Invalid tax class." };
  const storeId = await getActingStoreId();

  const admin = createAdminClient();
  // ON DELETE SET NULL on products.tax_class_id + store_billing_settings
  // .default_tax_class_id — deleting a class simply unassigns it, never deletes
  // products or breaks the settings row.
  const { error } = await admin
    .from("tax_classes")
    .delete()
    .eq("id", id)
    .eq("store_id", storeId);
  if (error) {
    console.error("deleteTaxClass error:", error.message);
    return { error: "Could not delete tax class." };
  }

  revalidateTag(TAGS.billing, "max");
  revalidateTag(TAGS.products, "max");
  return { success: true };
}
