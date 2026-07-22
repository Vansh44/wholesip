import { describe, it, expect } from "vitest";
import { getOgImageUrl } from "./og-image";

// getOgImageUrl() decides whether an image needs the /api/og-image proxy. The
// proxy only accepts our managed GCS storage URLs (it compresses them below
// WhatsApp's ~300 KB og:image limit). Non-managed images are returned as-is,
// because routing them through the proxy would 403 and blank the share card.
const GCS_SRC = "https://storage.googleapis.com/storemink-media/products/x.png";

describe("getOgImageUrl", () => {
  // Nullish / empty inputs must yield undefined (no og:image tag rendered).
  it("returns undefined for null, undefined, and empty string", () => {
    expect(getOgImageUrl(null)).toBeUndefined();
    expect(getOgImageUrl(undefined)).toBeUndefined();
    expect(getOgImageUrl("")).toBeUndefined();
  });

  // A managed GCS storage URL is wrapped through the proxy with the source encoded.
  it("routes a GCS storage URL through the og-image proxy", () => {
    expect(getOgImageUrl(GCS_SRC)).toBe(
      `/api/og-image?url=${encodeURIComponent(GCS_SRC)}`,
    );
  });

  // Any query params on the source (?, &, =) must be fully percent-encoded so
  // the proxy URL has just ONE query param and no stray ampersands.
  it("encodes special characters so there's a single query param", () => {
    const src = `${GCS_SRC}?width=800&quality=60&format=webp`;
    const out = getOgImageUrl(src)!;

    // Exactly one `?` (the proxy's own) — the source's `?` is encoded to %3F.
    expect(out.split("?")).toHaveLength(2);
    // No raw `&` survives — they're all encoded to %26.
    expect(out).not.toContain("&");
    expect(out).toContain("%26");
    expect(out).toContain("%3F");
    expect(out).toBe(`/api/og-image?url=${encodeURIComponent(src)}`);
  });

  // Site-relative /public assets (e.g. theme imagery) are NOT proxied — the
  // route would reject them. Returned untouched for metadataBase to absolutize.
  it("passes a site-relative /public path through unchanged", () => {
    expect(getOgImageUrl("/themes/basket/p-tomato.webp")).toBe(
      "/themes/basket/p-tomato.webp",
    );
  });

  // A non-managed absolute URL is likewise passed through, not proxied.
  it("passes a non-managed absolute URL through unchanged", () => {
    const src = "https://cdn.example.com/x.png";
    expect(getOgImageUrl(src)).toBe(src);
  });
});
