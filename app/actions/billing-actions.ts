"use server";

import { and, asc, count, eq } from "drizzle-orm";
import { revalidateTag, revalidatePath } from "next/cache";
import { withService } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import { storeBillingSettings, taxClasses } from "@/drizzle/schema";
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
// getStoreBillingSettings / getStoreTaxClasses (public); these are the write
// side (service scope after an app-layer manage check — the store_menus pattern).

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
// Logo may be a storage URL or a site-relative path; reject anything that
// isn't an http(s) URL or an absolute path (no javascript:/data: etc.).
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

// Aliased select preserving the snake_case row shape rowToBillingSettings maps.
const BILLING_SETTINGS_COLUMNS = {
  store_id: storeBillingSettings.storeId,
  tax_enabled: storeBillingSettings.taxEnabled,
  prices_include_tax: storeBillingSettings.pricesIncludeTax,
  default_tax_class_id: storeBillingSettings.defaultTaxClassId,
  business_name: storeBillingSettings.businessName,
  business_address: storeBillingSettings.businessAddress,
  tax_id: storeBillingSettings.taxId,
  contact_email: storeBillingSettings.contactEmail,
  contact_phone: storeBillingSettings.contactPhone,
  logo_url: storeBillingSettings.logoUrl,
  invoice_prefix: storeBillingSettings.invoicePrefix,
  accent_color: storeBillingSettings.accentColor,
  footer_note: storeBillingSettings.footerNote,
  terms: storeBillingSettings.terms,
  template: storeBillingSettings.template,
};

// ---- Reads (dashboard editor) --------------------------------------------

export async function getBillingForEditor(): Promise<{
  settings: BillingSettings;
  taxClasses: TaxClass[];
}> {
  const storeId = await getActingStoreId();
  try {
    return await withService(async (db) => {
      const [settingsRows, classRows] = await Promise.all([
        db
          .select(BILLING_SETTINGS_COLUMNS)
          .from(storeBillingSettings)
          .where(eq(storeBillingSettings.storeId, storeId))
          .limit(1),
        db
          .select({
            id: taxClasses.id,
            name: taxClasses.name,
            rate: taxClasses.rate,
            sort_order: taxClasses.sortOrder,
          })
          .from(taxClasses)
          .where(eq(taxClasses.storeId, storeId))
          .orderBy(asc(taxClasses.sortOrder), asc(taxClasses.name)),
      ]);
      return {
        settings: rowToBillingSettings(
          (settingsRows[0] as Record<string, unknown> | undefined) ?? null,
        ),
        taxClasses: classRows.map((r) =>
          rowToTaxClass(r as Record<string, unknown>),
        ),
      };
    });
  } catch (err) {
    console.error(
      "getBillingForEditor:",
      err instanceof Error ? err.message : err,
    );
    return { settings: rowToBillingSettings(null), taxClasses: [] };
  }
}

// ---- Billing / invoice settings ------------------------------------------

export async function saveBillingSettings(
  input: BillingSettingsInput,
): Promise<{ success?: boolean; error?: string }> {
  const userId = await getManagerUserId("billing");
  if (!userId) return { error: "Not authorized." };
  const storeId = await getActingStoreId();

  // A default tax class must belong to THIS store (FK doesn't enforce tenancy).
  let defaultTaxClassId: string | null = null;
  if (input?.defaultTaxClassId) {
    try {
      const owned = await withService((db) =>
        db
          .select({ id: taxClasses.id })
          .from(taxClasses)
          .where(
            and(
              eq(taxClasses.id, input.defaultTaxClassId!),
              eq(taxClasses.storeId, storeId),
            ),
          )
          .limit(1),
      );
      if (owned[0]) defaultTaxClassId = input.defaultTaxClassId;
    } catch (err) {
      console.error("saveBillingSettings ownership check:", err);
    }
  }

  // Every column except the conflict key (store_id) — used as both the insert
  // payload and the on-conflict update set.
  const updateFields = {
    taxEnabled: input?.taxEnabled === true,
    pricesIncludeTax: input?.pricesIncludeTax === true,
    defaultTaxClassId,
    businessName: cleanOrNull(input?.businessName, MAX.name),
    businessAddress: cleanOrNull(input?.businessAddress, MAX.addr),
    taxId: cleanOrNull(input?.taxId, MAX.id),
    contactEmail: cleanOrNull(input?.contactEmail, MAX.contact),
    contactPhone: cleanOrNull(input?.contactPhone, MAX.contact),
    logoUrl: safeUrlOrNull(input?.logoUrl),
    invoicePrefix: clean(input?.invoicePrefix, 10) || "INV",
    accentColor: safeHex(input?.accentColor, "#111111"),
    footerNote: cleanOrNull(input?.footerNote, MAX.note),
    terms: cleanOrNull(input?.terms, MAX.terms),
    template: normalizeTemplate(input?.template),
    updatedBy: userId,
  };

  try {
    // Single-row-per-store table: upsert keyed on store_id.
    await withService((db) =>
      db
        .insert(storeBillingSettings)
        .values({ storeId, ...updateFields })
        .onConflictDoUpdate({
          target: storeBillingSettings.storeId,
          set: updateFields,
        }),
    );
  } catch (err) {
    console.error(
      "saveBillingSettings error:",
      err instanceof Error ? err.message : err,
    );
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

  try {
    const id = await withService(async (db) => {
      // Next sort_order = current count (append to the end).
      const [countRow] = await db
        .select({ n: count() })
        .from(taxClasses)
        .where(eq(taxClasses.storeId, storeId));

      const [inserted] = await db
        .insert(taxClasses)
        .values({ storeId, name, rate, sortOrder: countRow?.n ?? 0 })
        .returning({ id: taxClasses.id });
      return inserted.id;
    });
    revalidateTag(TAGS.billing, "max");
    return { success: true, id };
  } catch (err) {
    // 23505 = unique_violation (duplicate name for this store).
    if (isUniqueViolation(err))
      return { error: "A tax class with that name already exists." };
    console.error(
      "createTaxClass error:",
      err instanceof Error ? err.message : err,
    );
    return { error: "Could not create tax class." };
  }
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

  try {
    await withService((db) =>
      db
        .update(taxClasses)
        .set({ name, rate })
        .where(and(eq(taxClasses.id, id), eq(taxClasses.storeId, storeId))),
    );
  } catch (err) {
    if (isUniqueViolation(err))
      return { error: "A tax class with that name already exists." };
    console.error(
      "updateTaxClass error:",
      err instanceof Error ? err.message : err,
    );
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

  try {
    // ON DELETE SET NULL on products.tax_class_id + store_billing_settings
    // .default_tax_class_id — deleting a class simply unassigns it, never
    // deletes products or breaks the settings row.
    await withService((db) =>
      db
        .delete(taxClasses)
        .where(and(eq(taxClasses.id, id), eq(taxClasses.storeId, storeId))),
    );
  } catch (err) {
    console.error(
      "deleteTaxClass error:",
      err instanceof Error ? err.message : err,
    );
    return { error: "Could not delete tax class." };
  }

  revalidateTag(TAGS.billing, "max");
  revalidateTag(TAGS.products, "max");
  return { success: true };
}
