/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
}));

import {
  createCardColor,
  updateCardColor,
  deleteCardColor,
} from "./color-actions";
import { createClient } from "@/lib/supabase/server";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { makeChain, makeSupabase } from "./_test-helpers";

const validForm = {
  name: "Cream",
  hex: "#f4dfe0",
  sort_order: 1,
};

// color-actions.ts manages the card-color palette shown on product cards.
// Every action is gated by getManagerUserId("colors") and validates the hex
// shape before any DB call.
describe("color-actions", () => {
  let supabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase({
      card_colors: makeChain({ data: { id: "c1" }, error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(supabase);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  describe("createCardColor", () => {
    // Without manage permission on Colours, the action rejects immediately.
    it("rejects when the caller lacks colors.manage", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await createCardColor(validForm);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Empty/whitespace name is rejected before any DB call.
    it("rejects empty name", async () => {
      const result = await createCardColor({ ...validForm, name: "   " });
      expect(result.error).toMatch(/name is required/i);
    });

    // Invalid hex shapes are rejected — must be #rgb or #rrggbb.
    it("rejects an invalid hex", async () => {
      const result = await createCardColor({ ...validForm, hex: "not-a-hex" });
      expect(result.error).toMatch(/valid hex/i);
    });

    // Normalization: 3-char hex (#fff) expands to 6-char (#ffffff) and is
    // lowercased so the palette stays consistent in the DB.
    it("normalises 3-digit hex to 6-digit lowercase", async () => {
      await createCardColor({ ...validForm, hex: "#FFF" });
      const inserted = supabase._tables.card_colors.insert.mock.calls[0][0];
      expect(inserted.hex).toBe("#ffffff");
    });

    // A hex value without the leading `#` should still work — the regex
    // accepts both forms and re-prefixes the output.
    it("accepts a hex without the leading hash", async () => {
      await createCardColor({ ...validForm, hex: "ABCDEF" });
      const inserted = supabase._tables.card_colors.insert.mock.calls[0][0];
      expect(inserted.hex).toBe("#abcdef");
    });

    // Happy path — well-formed input is inserted and trimmed.
    it("inserts trimmed name and normalised hex", async () => {
      await createCardColor({ ...validForm, name: "  Cream  " });
      const inserted = supabase._tables.card_colors.insert.mock.calls[0][0];
      expect(inserted.name).toBe("Cream");
      expect(inserted.hex).toBe("#f4dfe0");
    });
  });

  describe("updateCardColor", () => {
    // Same auth gate as create.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await updateCardColor("c1", validForm);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Same validation as create — hex must be a valid shape.
    it("rejects an invalid hex on update", async () => {
      const result = await updateCardColor("c1", { ...validForm, hex: "zzz" });
      expect(result.error).toMatch(/valid hex/i);
    });

    // Happy path — verifies the update payload includes the normalised hex.
    it("issues update with normalised payload", async () => {
      await updateCardColor("c1", validForm);
      const updateArg = supabase._tables.card_colors.update.mock.calls[0][0];
      expect(updateArg.hex).toBe("#f4dfe0");
      expect(updateArg.name).toBe("Cream");
    });
  });

  describe("deleteCardColor", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await deleteCardColor("c1");
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Happy path — issues a delete on card_colors filtered by id.
    it("deletes the row by id", async () => {
      const result = await deleteCardColor("c1");
      expect(result.success).toBe(true);
      expect(supabase._tables.card_colors.delete).toHaveBeenCalled();
    });
  });
});
