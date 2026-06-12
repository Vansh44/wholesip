import { describe, it, expect } from "vitest";
import { getOgImageUrl } from "./og-image";

// getOgImageUrl() builds the <meta property="og:image"> value. It proxies
// through /api/og-image so WhatsApp/Twitter see a single clean URL with no
// raw ampersands (Next.js HTML-encodes & → &amp; inside meta tags, which
// breaks Supabase transform URLs that use ?w=…&q=…).
describe("getOgImageUrl", () => {
  // Returns undefined (not "undefined" string) so Next.js omits the tag.
  it("returns undefined for null/undefined/empty", () => {
    expect(getOgImageUrl(null)).toBeUndefined();
    expect(getOgImageUrl(undefined)).toBeUndefined();
    expect(getOgImageUrl("")).toBeUndefined();
  });

  // Verifies the proxy URL shape and that the source URL is encoded into the
  // single `url=` query parameter.
  it("wraps a URL in the /api/og-image proxy", () => {
    expect(getOgImageUrl("https://cdn.example.com/a.png")).toBe(
      "/api/og-image?url=" +
        encodeURIComponent("https://cdn.example.com/a.png"),
    );
  });

  // The whole point of this helper — a source URL with ampersands gets
  // percent-encoded so the final URL has only ONE query parameter at the
  // outer level. Otherwise WhatsApp's HTML decoder corrupts it.
  it("URL-encodes the inner source (no raw ampersands)", () => {
    const out = getOgImageUrl(
      "https://cdn.example.com/a.png?w=800&q=60",
    ) as string;
    expect(out).toContain("%26"); // & encoded
    expect(out.split("&").length).toBe(1); // only the outer URL has no second param
  });
});
