/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import {
  normalizeStructured,
  defaultBrandSoul,
  getBrandSoulForStore,
} from "./brand-voice";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeChain, makeSupabase } from "@/app/actions/_test-helpers";

describe("normalizeStructured", () => {
  it("keeps known keys, trims, and drops junk", () => {
    expect(
      normalizeStructured({
        sell: "  fresh juice  ",
        audience: "runners",
        bogus: "nope",
        personality: 42,
        avoid: "",
      }),
    ).toEqual({ sell: "fresh juice", audience: "runners" });
  });

  it("tolerates null/undefined/non-objects", () => {
    expect(normalizeStructured(null)).toEqual({});
    expect(normalizeStructured("junk")).toEqual({});
  });

  it("caps every field at 600 chars", () => {
    const out = normalizeStructured({ sell: "x".repeat(1000) });
    expect(out.sell!.length).toBe(600);
  });
});

describe("defaultBrandSoul", () => {
  it("folds in the store name, tagline and blurb when present", () => {
    const soul = defaultBrandSoul("Echos", "Fresh, daily", "A local grocer.");
    expect(soul).toContain("**Echos**");
    expect(soul).toContain('"Fresh, daily"');
    expect(soul).toContain("A local grocer.");
  });

  it("omits absent lines and always carries the guardrails", () => {
    const soul = defaultBrandSoul("Echos");
    expect(soul).not.toContain("tagline");
    expect(soul).toMatch(/never invent/i);
    expect(soul).toMatch(/no medical/i);
  });
});

describe("getBrandSoulForStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the saved brand guide when one exists", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({
        store_brand_profiles: makeChain({
          data: { content_md: "# My soul" },
          error: null,
        }),
      }) as any,
    );
    expect(await getBrandSoulForStore("s1")).toBe("# My soul");
  });

  it("falls back to the generic default built from the store's branding", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({
        store_brand_profiles: makeChain({ data: null, error: null }),
        stores: makeChain({
          data: {
            name: "Echos",
            settings: { brand: { tagline: "Fresh, daily" } },
          },
          error: null,
        }),
      }) as any,
    );
    const soul = await getBrandSoulForStore("s1");
    expect(soul).toContain("**Echos**");
    expect(soul).toContain("Fresh, daily");
  });

  it("treats a whitespace-only saved guide as unset", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({
        store_brand_profiles: makeChain({
          data: { content_md: "   " },
          error: null,
        }),
        stores: makeChain({
          data: { name: "Echos", settings: {} },
          error: null,
        }),
      }) as any,
    );
    expect(await getBrandSoulForStore("s1")).toContain("**Echos**");
  });
});
