import { describe, it, expect } from "vitest";
import {
  PLAN_IDS,
  PLAN_META,
  PLAN_LIMITS,
  normalizePlan,
  planAllows,
  isUpgrade,
  upgradeTargets,
  limitsFor,
} from "./plans";

describe("normalizePlan", () => {
  it("passes known plans through and coerces junk to free", () => {
    expect(normalizePlan("free")).toBe("free");
    expect(normalizePlan("starter")).toBe("starter");
    expect(normalizePlan("pro")).toBe("pro");
    expect(normalizePlan("growth")).toBe("free"); // retired plan id
    expect(normalizePlan(null)).toBe("free");
    expect(normalizePlan(42)).toBe("free");
  });
});

describe("planAllows", () => {
  it("no minPlan = available everywhere", () => {
    expect(planAllows("free")).toBe(true);
  });
  it("compares by rank", () => {
    expect(planAllows("free", "starter")).toBe(false);
    expect(planAllows("starter", "starter")).toBe(true);
    expect(planAllows("pro", "starter")).toBe(true);
    expect(planAllows("starter", "pro")).toBe(false);
  });
});

describe("upgrade rules (operator console, upgrade-only)", () => {
  it("isUpgrade is strict — never same or downward", () => {
    expect(isUpgrade("free", "starter")).toBe(true);
    expect(isUpgrade("free", "pro")).toBe(true);
    expect(isUpgrade("starter", "pro")).toBe(true);
    expect(isUpgrade("starter", "free")).toBe(false);
    expect(isUpgrade("pro", "pro")).toBe(false);
    expect(isUpgrade("pro", "starter")).toBe(false);
  });

  it("upgradeTargets matches the owner's spec exactly", () => {
    expect(upgradeTargets("free")).toEqual(["starter", "pro"]);
    expect(upgradeTargets("starter")).toEqual(["pro"]);
    expect(upgradeTargets("pro")).toEqual([]);
  });
});

describe("catalog consistency", () => {
  it("every plan has meta and limits", () => {
    for (const id of PLAN_IDS) {
      expect(PLAN_META[id].id).toBe(id);
      expect(PLAN_LIMITS[id]).toBeDefined();
    }
  });

  it("prices are ascending and yearly is cheaper than 12× monthly", () => {
    expect(PLAN_META.free.monthlyInr).toBe(0);
    expect(PLAN_META.starter.monthlyInr).toBeGreaterThan(0);
    expect(PLAN_META.pro.monthlyInr).toBeGreaterThan(
      PLAN_META.starter.monthlyInr,
    );
    for (const id of ["starter", "pro"] as const) {
      expect(PLAN_META[id].yearlyInr).toBeLessThan(
        PLAN_META[id].monthlyInr * 12,
      );
    }
  });

  it("limits never shrink as plans go up", () => {
    const cap = (n: number | null) => n ?? Infinity;
    expect(cap(PLAN_LIMITS.starter.maxProducts)).toBeGreaterThan(
      cap(PLAN_LIMITS.free.maxProducts),
    );
    expect(cap(PLAN_LIMITS.pro.maxProducts)).toBeGreaterThanOrEqual(
      cap(PLAN_LIMITS.starter.maxProducts),
    );
    expect(cap(PLAN_LIMITS.pro.aiGenerationsPerMonth)).toBeGreaterThanOrEqual(
      cap(PLAN_LIMITS.starter.aiGenerationsPerMonth),
    );
  });

  it("limitsFor tolerates junk plans", () => {
    expect(limitsFor("bogus")).toEqual(PLAN_LIMITS.free);
    expect(limitsFor("pro").maxProducts).toBeNull();
  });
});
