import { describe, it, expect } from "vitest";
import { getOgImageUrl } from "./og-image";

// getOgImageUrl() decides whether an image needs the /api/og-image proxy. The
// proxy only accepts Supabase storage URLs (it compresses them and collapses
// their transform params into a SINGLE clean query param so Next.js can't
// HTML-encode a bare `&` into `&amp;`). Non-Supabase images are returned as-is,
// because routing them through the proxy would 403 and blank the share card.
const SUPABASE_SRC =
  "https://xyz.supabase.co/storage/v1/object/public/media/products/x.png";

describe("getOgImageUrl", () => {
  // Nullish / empty inputs must yield undefined (no og:image tag rendered).
  it("returns undefined for null, undefined, and empty string", () => {
    expect(getOgImageUrl(null)).toBeUndefined();
    expect(getOgImageUrl(undefined)).toBeUndefined();
    expect(getOgImageUrl("")).toBeUndefined();
  });

  // A Supabase storage URL is wrapped through the proxy with the source encoded.
  it("routes a Supabase storage URL through the og-image proxy", () => {
    expect(getOgImageUrl(SUPABASE_SRC)).toBe(
      `/api/og-image?url=${encodeURIComponent(SUPABASE_SRC)}`,
    );
  });

  // The critical case: a Supabase transform URL with query params (&, =, ?)
  // must be fully percent-encoded so the proxy URL has just ONE query param
  // and no stray ampersands.
  it("encodes special characters so there's a single query param", () => {
    const src = `${SUPABASE_SRC}?width=800&quality=60&format=webp`;
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

  // A non-Supabase absolute URL is likewise passed through, not proxied.
  it("passes a non-Supabase absolute URL through unchanged", () => {
    const src = "https://cdn.example.com/x.png";
    expect(getOgImageUrl(src)).toBe(src);
  });
});
