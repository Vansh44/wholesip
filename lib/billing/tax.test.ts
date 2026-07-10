import { describe, it, expect } from "vitest";
import { computeTax, round2 } from "./tax";

describe("round2", () => {
  it("rounds to 2 decimals and guards non-finite", () => {
    expect(round2(18.005)).toBe(18.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });
});

describe("computeTax", () => {
  it("returns zero tax when disabled", () => {
    const r = computeTax({
      lines: [{ amount: 100, rate: 18 }],
      enabled: false,
    });
    expect(r.totalTax).toBe(0);
    expect(r.lines[0].tax).toBe(0);
    expect(r.byRate).toEqual([]);
  });

  it("exclusive: adds tax on top of the net amount", () => {
    const r = computeTax({
      lines: [{ amount: 100, rate: 18, label: "GST 18%" }],
      pricesIncludeTax: false,
    });
    expect(r.totalTax).toBe(18);
    expect(r.lines[0].taxableValue).toBe(100);
    expect(r.lines[0].tax).toBe(18);
    expect(r.byRate).toEqual([
      { rate: 18, label: "GST 18%", taxableValue: 100, tax: 18 },
    ]);
  });

  it("inclusive: carves tax out of the gross amount", () => {
    const r = computeTax({
      lines: [{ amount: 118, rate: 18, label: "GST 18%" }],
      pricesIncludeTax: true,
    });
    expect(r.totalTax).toBe(18);
    expect(r.lines[0].taxableValue).toBe(100);
    expect(r.lines[0].tax).toBe(18);
    expect(r.inclusive).toBe(true);
  });

  it("groups multiple rates into byRate buckets", () => {
    const r = computeTax({
      lines: [
        { amount: 100, rate: 18, label: "GST 18%" },
        { amount: 200, rate: 5, label: "GST 5%" },
        { amount: 50, rate: 18, label: "GST 18%" },
      ],
      pricesIncludeTax: false,
    });
    expect(r.totalTax).toBe(round2(27 + 10)); // (150*18%)+(200*5%) = 27 + 10
    expect(r.byRate).toEqual([
      { rate: 5, label: "GST 5%", taxableValue: 200, tax: 10 },
      { rate: 18, label: "GST 18%", taxableValue: 150, tax: 27 },
    ]);
  });

  it("allocates the order discount proportionally before taxing", () => {
    const r = computeTax({
      lines: [
        { amount: 100, rate: 18, label: "GST 18%" },
        { amount: 100, rate: 18, label: "GST 18%" },
      ],
      discount: 40,
      pricesIncludeTax: false,
    });
    // Each line discounted to 80, tax 14.4, total 28.8
    expect(r.lines[0].discountedAmount).toBe(80);
    expect(r.lines[1].discountedAmount).toBe(80);
    expect(r.totalTax).toBe(28.8);
    expect(r.byRate[0]).toEqual({
      rate: 18,
      label: "GST 18%",
      taxableValue: 160,
      tax: 28.8,
    });
  });

  it("caps discount at the total and guards empty / zero", () => {
    expect(computeTax({ lines: [] }).totalTax).toBe(0);
    const r = computeTax({
      lines: [{ amount: 100, rate: 18 }],
      discount: 999,
      pricesIncludeTax: false,
    });
    // Discount capped at 100 → nothing taxable
    expect(r.lines[0].discountedAmount).toBe(0);
    expect(r.totalTax).toBe(0);
  });

  it("treats a zero-rate line as untaxed but keeps it in lines", () => {
    const r = computeTax({
      lines: [{ amount: 100, rate: 0, label: "Exempt" }],
      pricesIncludeTax: false,
    });
    expect(r.totalTax).toBe(0);
    expect(r.lines[0].taxableValue).toBe(100);
    expect(r.byRate).toEqual([]);
  });
});
