/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => "store-1"),
}));
vi.mock("@/lib/ai/gemini", () => ({
  callGemini: vi.fn(),
}));
vi.mock("@/lib/ai/quota", () => ({
  consumeAiQuota: vi.fn(async () => ({ allowed: true })),
  getAiUsage: vi.fn(async () => ({ used: 2, cap: 10 })),
}));

import {
  getBrandVoiceForEditor,
  saveBrandVoice,
  generateBrandVoice,
} from "./brand-voice-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { callGemini } from "@/lib/ai/gemini";
import { consumeAiQuota } from "@/lib/ai/quota";
import { makeChain, makeSupabase } from "./_test-helpers";

function makeAdmin(
  profile: any = { content_md: "# Guide", structured: { sell: "juice" } },
) {
  return makeSupabase({
    store_brand_profiles: makeChain(
      { data: profile, error: null },
      {
        error: null,
      },
    ),
    stores: makeChain({ data: { name: "Echos" }, error: null }),
  });
}

describe("brand-voice actions", () => {
  let admin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    admin = makeAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
    vi.mocked(consumeAiQuota).mockResolvedValue({ allowed: true });
    vi.mocked(callGemini).mockResolvedValue({ text: "# Echos — Brand Voice" });
  });

  describe("getBrandVoiceForEditor", () => {
    it("returns the profile plus the month's AI usage", async () => {
      const data = await getBrandVoiceForEditor();
      expect(data.content).toBe("# Guide");
      expect(data.structured).toEqual({ sell: "juice" });
      expect(data.usage).toEqual({ used: 2, cap: 10 });
    });
  });

  describe("saveBrandVoice", () => {
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const res = await saveBrandVoice({ content: "x", structured: {} });
      expect(res.error).toMatch(/not authenticated/i);
      expect(admin._tables.store_brand_profiles.upsert).not.toHaveBeenCalled();
    });

    it("rejects an over-long guide", async () => {
      const res = await saveBrandVoice({
        content: "x".repeat(20_001),
        structured: {},
      });
      expect(res.error).toMatch(/too long/i);
    });

    it("upserts trimmed content + normalized answers", async () => {
      const res = await saveBrandVoice({
        content: "  # Soul  ",
        structured: { sell: " juice ", bogus: "drop-me" } as any,
      });
      expect(res.success).toBe(true);
      const arg = admin._tables.store_brand_profiles.upsert.mock.calls[0][0];
      expect(arg.store_id).toBe("store-1");
      expect(arg.content_md).toBe("# Soul");
      expect(arg.structured).toEqual({ sell: "juice" });
      expect(arg.updated_by).toBe("user-1");
    });

    it("allows clearing the guide (empty = fall back to the default voice)", async () => {
      const res = await saveBrandVoice({ content: "", structured: {} });
      expect(res.success).toBe(true);
      const arg = admin._tables.store_brand_profiles.upsert.mock.calls[0][0];
      expect(arg.content_md).toBe("");
    });
  });

  describe("generateBrandVoice", () => {
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const res = await generateBrandVoice({ sell: "juice" });
      expect(res.error).toMatch(/not authenticated/i);
      expect(callGemini).not.toHaveBeenCalled();
    });

    it("requires at least 'what you sell'", async () => {
      const res = await generateBrandVoice({});
      expect(res.error).toMatch(/what you sell/i);
      expect(consumeAiQuota).not.toHaveBeenCalled(); // no credit burned
    });

    it("blocks when the monthly AI quota is spent", async () => {
      vi.mocked(consumeAiQuota).mockResolvedValueOnce({
        allowed: false,
        error: "You've used all 10 AI generations…",
      });
      const res = await generateBrandVoice({ sell: "juice" });
      expect(res.error).toMatch(/AI generations/i);
      expect(callGemini).not.toHaveBeenCalled();
    });

    it("composes the guide from the merchant's answers (not saved yet)", async () => {
      const res = await generateBrandVoice({
        sell: "fresh juice",
        personality: "warm, honest",
      });
      expect(res.content).toBe("# Echos — Brand Voice");
      // The prompt carries the store name and the answers verbatim.
      const [, userText] = vi.mocked(callGemini).mock.calls[0];
      expect(userText).toContain("Echos");
      expect(userText).toContain("fresh juice");
      expect(userText).toContain("warm, honest");
      // Review-before-save: generation must NOT write the profile.
      expect(admin._tables.store_brand_profiles.upsert).not.toHaveBeenCalled();
    });

    it("surfaces a Gemini error", async () => {
      vi.mocked(callGemini).mockResolvedValueOnce({ error: "AI busy" });
      const res = await generateBrandVoice({ sell: "juice" });
      expect(res.error).toBe("AI busy");
    });
  });
});
