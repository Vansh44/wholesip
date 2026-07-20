/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "./_test-helpers";

// Billing/tax admin actions write with the SERVICE scope after an app-layer
// manage check on the `billing` section, then bust the storefront cache tags.
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => "store-1"),
}));

// The ported data layer: with* runners invoke the callback with the mock db.
const dbHolder = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/lib/db/client", () => ({
  withUser: vi.fn((_identity: any, fn: any) =>
    Promise.resolve(fn(dbHolder.current.db)),
  ),
  withService: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
  withAnon: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
}));

import {
  saveBillingSettings,
  createTaxClass,
  updateTaxClass,
  deleteTaxClass,
  type BillingSettingsInput,
} from "./billing-actions";
import { getManagerUserId } from "@/app/dashboard/lib/access";

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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbHolder.current = makeDbMock({ returning: [{ id: "tc-new" }] });
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  // ---- saveBillingSettings (upsert = insert … onConflictDoUpdate) ----
  describe("saveBillingSettings", () => {
    it("rejects unauthorised callers and never writes", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const res = await saveBillingSettings(baseInput());
      expect(res.error).toMatch(/not authorized/i);
      expect(dbHolder.current.calls.insert).toHaveLength(0);
    });

    it("falls an invalid accent colour back to the default hex", async () => {
      await saveBillingSettings(baseInput({ accentColor: "red; content:x" }));
      expect(dbHolder.current.calls.values[0].accentColor).toBe("#111111");
    });

    it("keeps a valid hex accent colour", async () => {
      await saveBillingSettings(baseInput({ accentColor: "#Abc123" }));
      expect(dbHolder.current.calls.values[0].accentColor).toBe("#Abc123");
    });

    it("rejects an unsafe logo url but keeps http(s) and site-relative ones", async () => {
      await saveBillingSettings(baseInput({ logoUrl: "javascript:alert(1)" }));
      expect(dbHolder.current.calls.values[0].logoUrl).toBeNull();

      await saveBillingSettings(
        baseInput({ logoUrl: "https://cdn.example.com/l.png" }),
      );
      expect(dbHolder.current.calls.values[1].logoUrl).toBe(
        "https://cdn.example.com/l.png",
      );

      await saveBillingSettings(baseInput({ logoUrl: "/logo.png" }));
      expect(dbHolder.current.calls.values[2].logoUrl).toBe("/logo.png");
    });

    it("falls an empty invoice prefix back to INV", async () => {
      await saveBillingSettings(baseInput({ invoicePrefix: "   " }));
      expect(dbHolder.current.calls.values[0].invoicePrefix).toBe("INV");
    });

    it("drops a default tax class that doesn't belong to the store", async () => {
      // Ownership lookup finds nothing.
      dbHolder.current = makeDbMock({ selectQueue: [[]] });
      const res = await saveBillingSettings(
        baseInput({ defaultTaxClassId: "foreign-tc" }),
      );
      expect(res.success).toBe(true);
      expect(dbHolder.current.calls.values[0].defaultTaxClassId).toBeNull();
    });

    it("keeps a default tax class owned by the store", async () => {
      dbHolder.current = makeDbMock({ selectQueue: [[{ id: "tc1" }]] });
      await saveBillingSettings(baseInput({ defaultTaxClassId: "tc1" }));
      const row = dbHolder.current.calls.values[0];
      expect(row.defaultTaxClassId).toBe("tc1");
      expect(row.storeId).toBe(STORE);
      expect(row.updatedBy).toBe("user-1");
      // Conflict clause makes a repeat save an update (one row per store).
      expect(dbHolder.current.calls.onConflict).toHaveLength(1);
    });

    it("surfaces a DB write error", async () => {
      dbHolder.current.db.insert = vi.fn(() => {
        throw new Error("boom");
      });
      const res = await saveBillingSettings(baseInput());
      expect(res.error).toMatch(/could not save/i);
    });
  });

  // ---- createTaxClass (select #1 = the sort_order count) ----
  describe("createTaxClass", () => {
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const res = await createTaxClass({ name: "GST 18%", rate: 18 });
      expect(res.error).toMatch(/not authorized/i);
      expect(dbHolder.current.calls.insert).toHaveLength(0);
    });

    it("requires a name", async () => {
      const res = await createTaxClass({ name: "   ", rate: 18 });
      expect(res.error).toMatch(/name is required/i);
      expect(dbHolder.current.calls.insert).toHaveLength(0);
    });

    it("clamps the rate to 0..100 and inserts", async () => {
      dbHolder.current = makeDbMock({
        returning: [{ id: "tc-new" }],
        selectQueue: [[{ n: 0 }], [{ n: 1 }], [{ n: 2 }]],
      });
      const over = await createTaxClass({ name: "Silly", rate: 150 });
      expect(over.success).toBe(true);
      expect(over.id).toBe("tc-new");
      expect(dbHolder.current.calls.values[0].rate).toBe(100);

      await createTaxClass({ name: "Neg", rate: -5 });
      expect(dbHolder.current.calls.values[1].rate).toBe(0);

      await createTaxClass({ name: "Frac", rate: 18.5 });
      expect(dbHolder.current.calls.values[2].rate).toBe(18.5);
      // sort_order appends to the end (= the current count).
      expect(dbHolder.current.calls.values[2].sortOrder).toBe(2);
    });

    it("maps a unique-violation to a friendly message", async () => {
      dbHolder.current.db.insert = vi.fn(() => {
        throw Object.assign(new Error("Failed query"), {
          cause: Object.assign(new Error("dup"), { code: "23505" }),
        });
      });
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

    it("clamps the rate and updates (id + store scoped)", async () => {
      const res = await updateTaxClass("tc1", { name: "GST", rate: 200 });
      expect(res.success).toBe(true);
      expect(dbHolder.current.calls.set[0]).toEqual({ name: "GST", rate: 100 });
      expect(dbHolder.current.calls.where).toHaveLength(1);
    });

    it("maps a unique-violation to a friendly message", async () => {
      dbHolder.current.db.update = vi.fn(() => {
        throw Object.assign(new Error("dup"), { code: "23505" });
      });
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
      expect(dbHolder.current.calls.delete).toHaveLength(0);
    });

    it("rejects an empty id", async () => {
      const res = await deleteTaxClass("");
      expect(res.error).toMatch(/invalid tax class/i);
    });

    it("deletes the store's own row", async () => {
      const res = await deleteTaxClass("tc1");
      expect(res.success).toBe(true);
      expect(dbHolder.current.calls.delete).toHaveLength(1);
      expect(dbHolder.current.calls.where).toHaveLength(1);
    });

    it("surfaces a DB error", async () => {
      dbHolder.current.db.delete = vi.fn(() => {
        throw new Error("boom");
      });
      const res = await deleteTaxClass("tc1");
      expect(res.error).toMatch(/could not delete/i);
    });
  });
});
