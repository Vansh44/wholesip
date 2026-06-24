import { describe, it, expect } from "vitest";
import { getOgImageUrl } from "./og-image";

// getOgImageUrl() builds the og:image proxy URL. The whole point of the proxy
// is a SINGLE clean query param (the encoded source URL) so there's no bare `&`
// for Next.js to HTML-encode into `&amp;` and break WhatsApp/Twitter fetches.
describe("getOgImageUrl", () => {
  // Nullish / empty inputs must yield undefined (no og:image tag rendered).
  it("returns undefined for null, undefined, and empty string", () => {
    expect(getOgImageUrl(null)).toBeUndefined();
    expect(getOgImageUrl(undefined)).toBeUndefined();
    expect(getOgImageUrl("")).toBeUndefined();
  });

  // A simple URL is wrapped through the proxy with the source encoded.
  it("routes a real URL through the og-image proxy", () => {
    const src = "https://cdn.example.com/x.png";
    expect(getOgImageUrl(src)).toBe(
      `/api/og-image?url=${encodeURIComponent(src)}`,
    );
  });

  // The critical case: a source URL that itself has query params (&, =, ?)
  // must be fully percent-encoded so the proxy URL has just ONE query param
  // and no stray ampersands.
  it("encodes special characters so there's a single query param", () => {
    const src =
      "https://cdn.example.com/x.png?width=800&quality=60&format=webp";
    const out = getOgImageUrl(src)!;

    // Exactly one `?` (the proxy's own) — the source's `?` is encoded to %3F.
    expect(out.split("?")).toHaveLength(2);
    // No raw `&` survives — they're all encoded to %26.
    expect(out).not.toContain("&");
    expect(out).toContain("%26");
    expect(out).toContain("%3F");
    expect(out).toBe(`/api/og-image?url=${encodeURIComponent(src)}`);
  });
});
