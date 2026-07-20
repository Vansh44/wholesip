/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "./_test-helpers";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => "a0000000-0000-4000-8000-000000000001"),
}));

// The ported data layer: with* runners invoke the callback with the mock db.
const dbHolder = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/lib/db/client", () => ({
  withUser: vi.fn((_identity: any, fn: any) => fn(dbHolder.current.db)),
  withService: vi.fn((fn: any) => fn(dbHolder.current.db)),
  withAnon: vi.fn((fn: any) => fn(dbHolder.current.db)),
}));

import {
  createCardColor,
  updateCardColor,
  deleteCardColor,
} from "./color-actions";
import { getManagerUserId } from "@/app/dashboard/lib/access";

const validForm = { name: "Cream", hex: "#f4dfe0", sort_order: 1 };

// color-actions.ts manages the card-color palette shown on product cards.
// Every action is gated by getManagerUserId("colors") and validates the hex
// shape before any DB call; writes run through withUser (RLS-enforced).
describe("color-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbHolder.current = makeDbMock({ returning: [{ id: "c1" }] });
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  describe("createCardColor", () => {
    it("rejects when the caller lacks colors.manage", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await createCardColor(validForm);
      expect(result.error).toMatch(/not authenticated/i);
      expect(dbHolder.current.calls.insert).toHaveLength(0);
    });

    it("rejects empty name", async () => {
      const result = await createCardColor({ ...validForm, name: "   " });
      expect(result.error).toMatch(/name is required/i);
    });

    it("rejects an invalid hex", async () => {
      const result = await createCardColor({ ...validForm, hex: "not-a-hex" });
      expect(result.error).toMatch(/valid hex/i);
    });

    it("normalises 3-digit hex to 6-digit lowercase", async () => {
      await createCardColor({ ...validForm, hex: "#FFF" });
      expect(dbHolder.current.calls.values[0].hex).toBe("#ffffff");
    });

    it("accepts a hex without the leading hash", async () => {
      await createCardColor({ ...validForm, hex: "ABCDEF" });
      expect(dbHolder.current.calls.values[0].hex).toBe("#abcdef");
    });

    it("inserts trimmed name, normalised hex and the acting store id", async () => {
      const result = await createCardColor({ ...validForm, name: "  Cream  " });
      const inserted = dbHolder.current.calls.values[0];
      expect(inserted.name).toBe("Cream");
      expect(inserted.hex).toBe("#f4dfe0");
      expect(inserted.storeId).toBe("a0000000-0000-4000-8000-000000000001");
      expect(result).toEqual({ success: true, data: { id: "c1" } });
    });
  });

  describe("updateCardColor", () => {
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await updateCardColor("c1", validForm);
      expect(result.error).toMatch(/not authenticated/i);
      expect(dbHolder.current.calls.update).toHaveLength(0);
    });

    it("rejects an invalid hex on update", async () => {
      const result = await updateCardColor("c1", { ...validForm, hex: "zzz" });
      expect(result.error).toMatch(/valid hex/i);
    });

    it("issues update with normalised payload", async () => {
      const result = await updateCardColor("c1", validForm);
      const updateArg = dbHolder.current.calls.set[0];
      expect(updateArg.hex).toBe("#f4dfe0");
      expect(updateArg.name).toBe("Cream");
      expect(result.success).toBe(true);
    });
  });

  describe("deleteCardColor", () => {
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await deleteCardColor("c1");
      expect(result.error).toMatch(/not authenticated/i);
      expect(dbHolder.current.calls.delete).toHaveLength(0);
    });

    it("deletes the row by id", async () => {
      const result = await deleteCardColor("c1");
      expect(result.success).toBe(true);
      expect(dbHolder.current.calls.delete).toHaveLength(1);
    });
  });
});
