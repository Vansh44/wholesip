/**
 * Build an absolute og:image URL that WhatsApp, Twitter, etc. can reliably
 * fetch.
 *
 * The problem: stored product/cover images are often 800 KB – 1 MB, well over
 * WhatsApp's ~300 KB limit.
 *
 * The solution: proxy through our own `/api/og-image?url=…` route, which
 * returns a compressed image with proper caching. The URL has only ONE query
 * param (the encoded source URL), so there's no `&` for Next.js to corrupt into
 * `&amp;` inside `<meta>` tags.
 */
export function getOgImageUrl(
  imageUrl: string | null | undefined,
): string | undefined {
  if (!imageUrl) return undefined;

  // The proxy exists SOLELY to shrink large stored images below WhatsApp's
  // ~300 KB limit. The route ONLY accepts our managed GCS storage URLs (see
  // app/api/og-image/route.ts), so route only those through it. Anything else
  // (a site-relative /public theme asset, an already-small CDN image) is
  // returned untouched; metadataBase resolves a relative path to an absolute
  // URL. Proxying such a URL would 403 and leave the share card with no image.
  if (imageUrl.includes("storage.googleapis.com/")) {
    return `/api/og-image?url=${encodeURIComponent(imageUrl)}`;
  }
  return imageUrl;
}
