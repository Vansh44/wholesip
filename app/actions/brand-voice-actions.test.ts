/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "./_test-helpers";

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
  getBrandVoiceForEditor,
  saveBrandVoice,
  generateBrandVoice,
} from "./brand-voice-actions";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { callGemini } from "@/lib/ai/gemini";
import { consumeAiQuota } from "@/lib/ai/quota";

describe("brand-voice actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbHolder.current = makeDbMock();
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
    vi.mocked(consumeAiQuota).mockResolvedValue({ allowed: true });
    vi.mocked(callGemini).mockResolvedValue({ text: "# Echos — Brand Voice" });
  });

  describe("getBrandVoiceForEditor", () => {
    it("returns the profile plus the month's AI usage", async () => {
      // select #1 = the stored profile (getBrandVoiceProfile).
      dbHolder.current = makeDbMock({
        selectQueue: [
          [{ content_md: "# Guide", structured: { sell: "juice" } }],
        ],
      });
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
      expect(dbHolder.current.calls.insert).toHaveLength(0);
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
      const arg = dbHolder.current.calls.values[0];
      expect(arg.storeId).toBe("store-1");
      expect(arg.contentMd).toBe("# Soul");
      expect(arg.structured).toEqual({ sell: "juice" });
      expect(arg.updatedBy).toBe("user-1");
      // One row per store: repeat saves update via the conflict clause.
      expect(dbHolder.current.calls.onConflict).toHaveLength(1);
    });

    it("allows clearing the guide (empty = fall back to the default voice)", async () => {
      const res = await saveBrandVoice({ content: "", structured: {} });
      expect(res.success).toBe(true);
      expect(dbHolder.current.calls.values[0].contentMd).toBe("");
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
      // select #1 = the store's name for the prompt.
      dbHolder.current = makeDbMock({ selectQueue: [[{ name: "Echos" }]] });
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
      expect(dbHolder.current.calls.insert).toHaveLength(0);
    });

    it("surfaces a Gemini error", async () => {
      vi.mocked(callGemini).mockResolvedValueOnce({ error: "AI busy" });
      const res = await generateBrandVoice({ sell: "juice" });
      expect(res.error).toBe("AI busy");
    });
  });
});
