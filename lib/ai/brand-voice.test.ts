/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "@/app/actions/_test-helpers";

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
  normalizeStructured,
  defaultBrandSoul,
  getBrandSoulForStore,
} from "./brand-voice";

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

// Selects: #1 the saved profile, #2 (fallback only) the store's branding.
describe("getBrandSoulForStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the saved brand guide when one exists", async () => {
    dbHolder.current = makeDbMock({
      selectQueue: [[{ content_md: "# My soul" }]],
    });
    expect(await getBrandSoulForStore("s1")).toBe("# My soul");
  });

  it("falls back to the generic default built from the store's branding", async () => {
    dbHolder.current = makeDbMock({
      selectQueue: [
        [],
        [{ name: "Echos", settings: { brand: { tagline: "Fresh, daily" } } }],
      ],
    });
    const soul = await getBrandSoulForStore("s1");
    expect(soul).toContain("**Echos**");
    expect(soul).toContain("Fresh, daily");
  });

  it("treats a whitespace-only saved guide as unset", async () => {
    dbHolder.current = makeDbMock({
      selectQueue: [[{ content_md: "   " }], [{ name: "Echos", settings: {} }]],
    });
    expect(await getBrandSoulForStore("s1")).toContain("**Echos**");
  });
});
