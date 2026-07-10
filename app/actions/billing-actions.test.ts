/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Billing/tax admin actions write with the SERVICE-ROLE client after an
// app-layer manage check on the `billing` section, then bust the storefront
// cache tags. Mock the cache, the admin client and the access helpers.
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => "store-1"),
}));

import {
  saveBillingSettings,
  createTaxClass,
  updateTaxClass,
  deleteTaxClass,
  type BillingSettingsInput,
} from "./billing-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { makeChain, makeSupabase } from "./_test-helpers";

const STORE = "store-1";

function baseInput(
  overrides: Partial<BillingSettingsInput> = {},
): BillingSettingsInput {
  return {
    taxEnabled: true,
    pricesIncludeTax: false,
    defaultTaxClassId: null,
    businessName: "Acme",
    businessAddress: "1 St",
    taxId: "GSTIN123",
    contactEmail: "a@b.com",
    contactPhone: "999",
    logoUrl: "",
    invoicePrefix: "INV",
    accentColor: "#123456",
    footerNote: "",
    terms: "",
    template: {},
    ...overrides,
  };
}

describe("billing actions", () => {
  let admin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    admin = makeSupabase({
      store_billing_settings: makeChain(
        { data: null, error: null },
        { error: null },
      ),
      tax_classes: makeChain(
        { data: null, error: null },
        { data: [], error: null },
      ),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  // ---- saveBillingSettings ----
  describe("saveBillingSettings", () => {
    it("rejects unauthorised callers and never writes", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const res = await saveBillingSettings(baseInput());
      expect(res.error).toMatch(/not authorized/i);
      expect(
        admin._tables.store_billing_settings.upsert,
      ).not.toHaveBeenCalled();
    });

    it("falls an invalid accent colour back to the default hex", async () => {
      await saveBillingSettings(baseInput({ accentColor: "red; content:x" }));
      const row = admin._tables.store_billing_settings.upsert.mock.calls[0][0];
      expect(row.accent_color).toBe("#111111");
    });

    it("keeps a valid hex accent colour", async () => {
      await saveBillingSettings(baseInput({ accentColor: "#Abc123" }));
      const row = admin._tables.store_billing_settings.upsert.mock.calls[0][0];
      expect(row.accent_color).toBe("#Abc123");
    });

    it("rejects an unsafe logo url but keeps http(s) and site-relative ones", async () => {
      await saveBillingSettings(baseInput({ logoUrl: "javascript:alert(1)" }));
      expect(
        admin._tables.store_billing_settings.upsert.mock.calls[0][0].logo_url,
      ).toBeNull();

      await saveBillingSettings(
        baseInput({ logoUrl: "https://cdn.example.com/l.png" }),
      );
      expect(
        admin._tables.store_billing_settings.upsert.mock.calls[1][0].logo_url,
      ).toBe("https://cdn.example.com/l.png");

      await saveBillingSettings(baseInput({ logoUrl: "/logo.png" }));
      expect(
        admin._tables.store_billing_settings.upsert.mock.calls[2][0].logo_url,
      ).toBe("/logo.png");
    });

    it("falls an empty invoice prefix back to INV", async () => {
      await saveBillingSettings(baseInput({ invoicePrefix: "   " }));
      const row = admin._tables.store_billing_settings.upsert.mock.calls[0][0];
      expect(row.invoice_prefix).toBe("INV");
    });

    it("drops a default tax class that doesn't belong to the store", async () => {
      admin._tables.tax_classes.maybeSingle.mockResolvedValue({ data: null });
      const res = await saveBillingSettings(
        baseInput({ defaultTaxClassId: "foreign-tc" }),
      );
      expect(res.success).toBe(true);
      const row = admin._tables.store_billing_settings.upsert.mock.calls[0][0];
      expect(row.default_tax_class_id).toBeNull();
    });

    it("keeps a default tax class owned by the store", async () => {
      admin._tables.tax_classes.maybeSingle.mockResolvedValue({
        data: { id: "tc1" },
      });
      await saveBillingSettings(baseInput({ defaultTaxClassId: "tc1" }));
      const row = admin._tables.store_billing_settings.upsert.mock.calls[0][0];
      expect(row.default_tax_class_id).toBe("tc1");
      expect(row.store_id).toBe(STORE);
      expect(row.updated_by).toBe("user-1");
    });

    it("surfaces a DB write error", async () => {
      admin._tables.store_billing_settings = makeChain(
        { data: null, error: null },
        { error: { message: "boom" } },
      );
      const res = await saveBillingSettings(baseInput());
      expect(res.error).toMatch(/could not save/i);
    });
  });

  // ---- createTaxClass ----
  describe("createTaxClass", () => {
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const res = await createTaxClass({ name: "GST 18%", rate: 18 });
      expect(res.error).toMatch(/not authorized/i);
      expect(admin._tables.tax_classes.insert).not.toHaveBeenCalled();
    });

    it("requires a name", async () => {
      const res = await createTaxClass({ name: "   ", rate: 18 });
      expect(res.error).toMatch(/name is required/i);
      expect(admin._tables.tax_classes.insert).not.toHaveBeenCalled();
    });

    it("clamps the rate to 0..100 and inserts", async () => {
      admin._tables.tax_classes = makeChain(
        { data: { id: "tc-new" }, error: null },
        { data: [], error: null },
      );
      const over = await createTaxClass({ name: "Silly", rate: 150 });
      expect(over.success).toBe(true);
      expect(over.id).toBe("tc-new");
      expect(admin._tables.tax_classes.insert.mock.calls[0][0].rate).toBe(100);

      await createTaxClass({ name: "Neg", rate: -5 });
      expect(admin._tables.tax_classes.insert.mock.calls[1][0].rate).toBe(0);

      await createTaxClass({ name: "Frac", rate: 18.5 });
      expect(admin._tables.tax_classes.insert.mock.calls[2][0].rate).toBe(18.5);
    });

    it("maps a unique-violation to a friendly message", async () => {
      admin._tables.tax_classes = makeChain(
        { data: null, error: { code: "23505" } },
        { data: [], error: null },
      );
      const res = await createTaxClass({ name: "GST 18%", rate: 18 });
      expect(res.error).toMatch(/already exists/i);
    });
  });

  // ---- updateTaxClass ----
  describe("updateTaxClass", () => {
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const res = await updateTaxClass("tc1", { name: "x", rate: 5 });
      expect(res.error).toMatch(/not authorized/i);
    });

    it("rejects an empty id", async () => {
      const res = await updateTaxClass("", { name: "x", rate: 5 });
      expect(res.error).toMatch(/invalid tax class/i);
    });

    it("clamps the rate and updates", async () => {
      const res = await updateTaxClass("tc1", { name: "GST", rate: 200 });
      expect(res.success).toBe(true);
      const arg = admin._tables.tax_classes.update.mock.calls[0][0];
      expect(arg).toEqual({ name: "GST", rate: 100 });
      expect(admin._tables.tax_classes.eq).toHaveBeenCalledWith("id", "tc1");
      expect(admin._tables.tax_classes.eq).toHaveBeenCalledWith(
        "store_id",
        STORE,
      );
    });

    it("maps a unique-violation to a friendly message", async () => {
      admin._tables.tax_classes = makeChain(
        { data: null, error: null },
        { error: { code: "23505" } },
      );
      const res = await updateTaxClass("tc1", { name: "GST", rate: 5 });
      expect(res.error).toMatch(/already exists/i);
    });
  });

  // ---- deleteTaxClass ----
  describe("deleteTaxClass", () => {
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const res = await deleteTaxClass("tc1");
      expect(res.error).toMatch(/not authorized/i);
      expect(admin._tables.tax_classes.delete).not.toHaveBeenCalled();
    });

    it("rejects an empty id", async () => {
      const res = await deleteTaxClass("");
      expect(res.error).toMatch(/invalid tax class/i);
    });

    it("deletes the store's own row", async () => {
      const res = await deleteTaxClass("tc1");
      expect(res.success).toBe(true);
      expect(admin._tables.tax_classes.delete).toHaveBeenCalled();
      expect(admin._tables.tax_classes.eq).toHaveBeenCalledWith("id", "tc1");
      expect(admin._tables.tax_classes.eq).toHaveBeenCalledWith(
        "store_id",
        STORE,
      );
    });

    it("surfaces a DB error", async () => {
      admin._tables.tax_classes = makeChain(
        { data: null, error: null },
        { error: { message: "boom" } },
      );
      const res = await deleteTaxClass("tc1");
      expect(res.error).toMatch(/could not delete/i);
    });
  });
});
