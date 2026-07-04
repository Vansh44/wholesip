import { describe, it, expect } from "vitest";
import { brandOgImageUrl } from "./og-card";

describe("brandOgImageUrl", () => {
  it("packs all fields into a single decodable `d` param", () => {
    const url = brandOgImageUrl({
      title: "Basket Demo",
      subtitle: "Fresh & fast",
      color: "#ef5a2a",
    });
    expect(url.startsWith("/api/og?d=")).toBe(true);
    const d = new URLSearchParams(url.split("?")[1]).get("d")!;
    expect(JSON.parse(d)).toEqual({
      title: "Basket Demo",
      subtitle: "Fresh & fast",
      color: "#ef5a2a",
    });
  });

  it("keeps a bare & out of the URL even when a field contains one", () => {
    const url = brandOgImageUrl({ title: "Tea & Coffee" });
    // Exactly one query param; the `&` is percent-encoded, never raw.
    expect(url.split("&")).toHaveLength(1);
    expect(url).toContain("%26");
  });

  it("omits absent optional fields", () => {
    const url = brandOgImageUrl({ title: "Store" });
    const d = new URLSearchParams(url.split("?")[1]).get("d")!;
    expect(JSON.parse(d)).toEqual({ title: "Store" });
  });
});
