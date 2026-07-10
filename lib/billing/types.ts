// ---------------------------------------------------------------------------
// Billing / invoicing types + defaults — pure module (no server imports) so it
// can be shared by server components, actions, client editors, and tests.
//
// Scope: tax classes per product (+ store default), inclusive/exclusive prices,
// and a per-store invoice template. See supabase/invoicing.sql for storage.
// ---------------------------------------------------------------------------

/** A named tax rate bucket (row of public.tax_classes). */
export interface TaxClass {
  id: string;
  name: string;
  /** Percentage, 0..100. */
  rate: number;
  sortOrder: number;
}

/** Invoice template options (stored in store_billing_settings.template jsonb). */
export interface InvoiceTemplate {
  /** Heading printed at the top of the invoice. */
  title: string;
  showLogo: boolean;
  showBusinessAddress: boolean;
  showTaxId: boolean;
  showBillingAddress: boolean;
  showPaymentMethod: boolean;
  /** Show the order's customer notes on the invoice. */
  showNotes: boolean;
}

/** The resolved billing/invoice configuration for a store. */
export interface BillingSettings {
  // tax
  taxEnabled: boolean;
  pricesIncludeTax: boolean;
  defaultTaxClassId: string | null;
  // business identity (printed on invoices)
  businessName: string | null;
  businessAddress: string | null;
  taxId: string | null; // GSTIN / tax registration number
  contactEmail: string | null;
  contactPhone: string | null;
  logoUrl: string | null;
  // invoice template
  invoicePrefix: string;
  accentColor: string;
  footerNote: string | null;
  terms: string | null;
  template: InvoiceTemplate;
}

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplate = {
  title: "Invoice",
  showLogo: true,
  showBusinessAddress: true,
  showTaxId: true,
  showBillingAddress: true,
  showPaymentMethod: true,
  showNotes: true,
};

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  taxEnabled: false,
  pricesIncludeTax: false,
  defaultTaxClassId: null,
  businessName: null,
  businessAddress: null,
  taxId: null,
  contactEmail: null,
  contactPhone: null,
  logoUrl: null,
  invoicePrefix: "INV",
  accentColor: "#111111",
  footerNote: null,
  terms: null,
  template: DEFAULT_INVOICE_TEMPLATE,
};

/** Map a public.tax_classes row (snake_case) to the app TaxClass shape. */
export function rowToTaxClass(row: Record<string, unknown>): TaxClass {
  return {
    id: String(row.id),
    name: typeof row.name === "string" ? row.name : "",
    rate: Number(row.rate ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

/**
 * Map a public.store_billing_settings row to BillingSettings, falling back to
 * DEFAULT_BILLING_SETTINGS for a store with no row (or for missing columns).
 */
export function rowToBillingSettings(
  row: Record<string, unknown> | null | undefined,
): BillingSettings {
  if (!row) return DEFAULT_BILLING_SETTINGS;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v : null;
  return {
    taxEnabled: row.tax_enabled === true,
    pricesIncludeTax: row.prices_include_tax === true,
    defaultTaxClassId: str(row.default_tax_class_id),
    businessName: str(row.business_name),
    businessAddress: str(row.business_address),
    taxId: str(row.tax_id),
    contactEmail: str(row.contact_email),
    contactPhone: str(row.contact_phone),
    logoUrl: str(row.logo_url),
    invoicePrefix:
      str(row.invoice_prefix) ?? DEFAULT_BILLING_SETTINGS.invoicePrefix,
    accentColor: str(row.accent_color) ?? DEFAULT_BILLING_SETTINGS.accentColor,
    footerNote: str(row.footer_note),
    terms: str(row.terms),
    template: normalizeTemplate(row.template),
  };
}

/**
 * Coerce an arbitrary (jsonb) value into a complete InvoiceTemplate, so junk in
 * the column can never crash the invoice renderer. Unknown keys are dropped and
 * missing keys fall back to the default.
 */
export function normalizeTemplate(raw: unknown): InvoiceTemplate {
  const t = (raw ?? {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    title:
      typeof t.title === "string" && t.title.trim()
        ? t.title.trim().slice(0, 60)
        : DEFAULT_INVOICE_TEMPLATE.title,
    showLogo: bool(t.showLogo, DEFAULT_INVOICE_TEMPLATE.showLogo),
    showBusinessAddress: bool(
      t.showBusinessAddress,
      DEFAULT_INVOICE_TEMPLATE.showBusinessAddress,
    ),
    showTaxId: bool(t.showTaxId, DEFAULT_INVOICE_TEMPLATE.showTaxId),
    showBillingAddress: bool(
      t.showBillingAddress,
      DEFAULT_INVOICE_TEMPLATE.showBillingAddress,
    ),
    showPaymentMethod: bool(
      t.showPaymentMethod,
      DEFAULT_INVOICE_TEMPLATE.showPaymentMethod,
    ),
    showNotes: bool(t.showNotes, DEFAULT_INVOICE_TEMPLATE.showNotes),
  };
}
