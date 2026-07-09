import { describe, it, expect } from "vitest";
import {
  luhnCheckDigit,
  isValidCode,
  formatStoreCode,
  formatSku,
  formatVariantSku,
  formatOrderRef,
  refKind,
} from "./identifiers";

describe("luhnCheckDigit", () => {
  // The canonical vectors from the spec — these MUST match the SQL sm_luhn()
  // used by the backfill (supabase/identifiers_02_backfill.sql), so both paths
  // produce identical codes for the same numbers.
  it("computes the documented check digits", () => {
    expect(luhnCheckDigit("10010001")).toBe(5); // store 1001, product 0001
    expect(luhnCheckDigit("10011000")).toBe(6); // store 1001, order 1000
    expect(luhnCheckDigit("1001000101")).toBe(3); // store 1001, prod 0001, var 01
  });

  it("ignores non-digit characters (can be passed a full code)", () => {
    expect(luhnCheckDigit("SKU10010001")).toBe(luhnCheckDigit("10010001"));
  });

  it("always returns a single digit 0-9", () => {
    for (let n = 0; n < 500; n++) {
      const d = luhnCheckDigit(String(n));
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(9);
    }
  });
});

describe("format generators (exact strings from the spec)", () => {
  it("store code is a bare, zero-padded number", () => {
    expect(formatStoreCode(1000)).toBe("1000");
    expect(formatStoreCode(1001)).toBe("1001");
    expect(formatStoreCode(12345)).toBe("12345"); // grows past 4 digits
  });

  it("product SKU", () => {
    expect(formatSku(1001, 1)).toBe("SKU100100015");
    expect(formatSku(1001, 7)).toBe("SKU100100072");
  });

  it("variant SKU (parent product code + V## + check)", () => {
    expect(formatVariantSku(1001, 1, 1)).toBe("SKU10010001V013");
  });

  it("order reference", () => {
    expect(formatOrderRef(1001, 1000)).toBe("ORD100110006");
  });
});

describe("isValidCode", () => {
  it("accepts every freshly generated code", () => {
    for (let store = 1000; store < 1010; store++) {
      for (let seq = 1; seq < 60; seq++) {
        expect(isValidCode(formatSku(store, seq))).toBe(true);
        expect(isValidCode(formatOrderRef(store, 1000 + seq))).toBe(true);
        expect(isValidCode(formatVariantSku(store, seq, 1))).toBe(true);
      }
    }
  });

  it("rejects a code whose check digit was altered", () => {
    const good = formatOrderRef(1001, 1000); // ORD100110006
    const bad = good.slice(0, -1) + ((Number(good.slice(-1)) + 1) % 10);
    expect(isValidCode(bad)).toBe(false);
  });

  it("catches a single-digit transposition in the payload", () => {
    // ORD100110006 -> swap two adjacent payload digits; check no longer matches.
    const good = "ORD100110006";
    expect(isValidCode(good)).toBe(true);
    const swapped = "ORD100101006"; // 1000 -> 0100 within the sequence portion
    expect(isValidCode(swapped)).toBe(false);
  });

  it("rejects junk / too-short input", () => {
    expect(isValidCode("")).toBe(false);
    expect(isValidCode("SKU")).toBe(false);
    expect(isValidCode("nope")).toBe(false);
  });
});

describe("refKind", () => {
  it("routes by prefix, case-insensitively", () => {
    expect(refKind("SKU100100015")).toBe("sku");
    expect(refKind("ord100110006")).toBe("order");
    expect(refKind("1001")).toBeNull();
  });
});
