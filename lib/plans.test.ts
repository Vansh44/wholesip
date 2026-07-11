import { describe, it, expect } from "vitest";
import {
  PLAN_IDS,
  PLAN_META,
  PLAN_LIMITS,
  normalizePlan,
  effectivePlan,
  planAllows,
  limitsFor,
} from "./plans";

describe("normalizePlan", () => {
  it("passes known plans through and coerces junk to free", () => {
    expect(normalizePlan("free")).toBe("free");
    expect(normalizePlan("basic")).toBe("basic");
    expect(normalizePlan("pro")).toBe("pro");
    expect(normalizePlan("growth")).toBe("free"); // retired plan id
    expect(normalizePlan(null)).toBe("free");
    expect(normalizePlan(42)).toBe("free");
  });

  it("maps the retired 'starter' id to basic (rollout alias)", () => {
    expect(normalizePlan("starter")).toBe("basic");
  });
});

describe("effectivePlan (timed plans)", () => {
  const now = new Date("2026-07-11T12:00:00.000Z");

  it("no expiry = the stored plan, indefinitely", () => {
    expect(effectivePlan({ plan: "pro", plan_expires_at: null }, now)).toBe(
      "pro",
    );
    expect(effectivePlan({ plan: "basic" }, now)).toBe("basic");
  });

  it("a future expiry keeps the plan", () => {
    expect(
      effectivePlan(
        { plan: "pro", plan_expires_at: "2026-08-01T00:00:00.000Z" },
        now,
      ),
    ).toBe("pro");
  });

  it("a past expiry lapses to free", () => {
    expect(
      effectivePlan(
        { plan: "pro", plan_expires_at: "2026-07-01T00:00:00.000Z" },
        now,
      ),
    ).toBe("free");
  });

  it("expiry exactly now counts as expired", () => {
    expect(
      effectivePlan(
        { plan: "basic", plan_expires_at: "2026-07-11T12:00:00.000Z" },
        now,
      ),
    ).toBe("free");
  });

  it("accepts Date objects", () => {
    expect(
      effectivePlan(
        { plan: "basic", plan_expires_at: new Date("2027-01-01") },
        now,
      ),
    ).toBe("basic");
  });

  it("an unparseable expiry fails open (treated as indefinite)", () => {
    expect(
      effectivePlan({ plan: "pro", plan_expires_at: "not-a-date" }, now),
    ).toBe("pro");
  });

  it("normalizes legacy plan ids before checking expiry", () => {
    expect(
      effectivePlan(
        { plan: "starter", plan_expires_at: "2027-01-01T00:00:00.000Z" },
        now,
      ),
    ).toBe("basic");
    expect(
      effectivePlan(
        { plan: "starter", plan_expires_at: "2026-01-01T00:00:00.000Z" },
        now,
      ),
    ).toBe("free");
  });
});

describe("planAllows", () => {
  it("no minPlan = available everywhere", () => {
    expect(planAllows("free")).toBe(true);
  });
  it("compares by rank", () => {
    expect(planAllows("free", "basic")).toBe(false);
    expect(planAllows("basic", "basic")).toBe(true);
    expect(planAllows("pro", "basic")).toBe(true);
    expect(planAllows("basic", "pro")).toBe(false);
  });
});

describe("catalog consistency", () => {
  it("every plan has meta and limits", () => {
    for (const id of PLAN_IDS) {
      expect(PLAN_META[id].id).toBe(id);
      expect(PLAN_LIMITS[id]).toBeDefined();
    }
  });

  it("prices match the owner-approved catalog", () => {
    expect(PLAN_META.free.monthlyInr).toBe(0);
    expect(PLAN_META.basic.monthlyInr).toBe(500);
    expect(PLAN_META.basic.yearlyInr).toBe(5000);
    expect(PLAN_META.pro.monthlyInr).toBe(1500);
    expect(PLAN_META.pro.yearlyInr).toBe(15000);
  });

  it("yearly is cheaper than 12× monthly", () => {
    for (const id of ["basic", "pro"] as const) {
      expect(PLAN_META[id].yearlyInr).toBeLessThan(
        PLAN_META[id].monthlyInr * 12,
      );
    }
  });

  it("every plan meters AI (credits top up the monthly allowance)", () => {
    expect(PLAN_LIMITS.free.aiGenerationsPerMonth).toBe(3);
    expect(PLAN_LIMITS.basic.aiGenerationsPerMonth).toBe(10);
    expect(PLAN_LIMITS.pro.aiGenerationsPerMonth).toBe(50);
  });

  it("online payments are a paid-plan feature (basic+)", () => {
    expect(PLAN_LIMITS.free.onlinePayments).toBe(false);
    expect(PLAN_LIMITS.basic.onlinePayments).toBe(true);
    expect(PLAN_LIMITS.pro.onlinePayments).toBe(true);
  });

  it("limits never shrink as plans go up", () => {
    const cap = (n: number | null) => n ?? Infinity;
    expect(cap(PLAN_LIMITS.basic.maxProducts)).toBeGreaterThan(
      cap(PLAN_LIMITS.free.maxProducts),
    );
    expect(cap(PLAN_LIMITS.pro.maxProducts)).toBeGreaterThanOrEqual(
      cap(PLAN_LIMITS.basic.maxProducts),
    );
    expect(cap(PLAN_LIMITS.pro.aiGenerationsPerMonth)).toBeGreaterThanOrEqual(
      cap(PLAN_LIMITS.basic.aiGenerationsPerMonth),
    );
  });

  it("limitsFor tolerates junk plans", () => {
    expect(limitsFor("bogus")).toEqual(PLAN_LIMITS.free);
    expect(limitsFor("pro").maxProducts).toBeNull();
  });
});
