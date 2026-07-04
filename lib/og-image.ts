/**
 * Build an absolute og:image URL that WhatsApp, Twitter, etc. can reliably
 * fetch.
 *
 * The problem: Supabase storage images are often 800 KB – 1 MB, well over
 * WhatsApp's ~300 KB limit. And when we try to use Supabase's image-transform
 * endpoint with query params (e.g. `?width=800&quality=60`), Next.js
 * HTML-encodes the `&` to `&amp;` inside `<meta>` tags, which breaks the URL
 * when WhatsApp fetches it literally.
 *
 * The solution: proxy through our own `/api/og-image?url=…` route, which
 * returns the image with proper caching. The URL has only ONE query param
 * (the encoded source URL), so there's no `&` to corrupt.
 */
export function getOgImageUrl(
  imageUrl: string | null | undefined,
): string | undefined {
  if (!imageUrl) return undefined;

  // The proxy exists SOLELY to (a) shrink large Supabase storage images below
  // WhatsApp's ~300 KB limit and (b) collapse Supabase transform URLs (which
  // carry ?width=&quality=… params) into a single clean query param so Next.js
  // can't turn a bare `&` into `&amp;`. The route ONLY accepts Supabase storage
  // URLs (see app/api/og-image/route.ts) — so route only those through it.
  // Anything else (a site-relative /public theme asset, an already-small CDN
  // image) is returned untouched; metadataBase resolves a relative path to an
  // absolute URL. Proxying such a URL would 403 and leave the share card with
  // no image.
  if (imageUrl.includes("supabase.co/storage/")) {
    return `/api/og-image?url=${encodeURIComponent(imageUrl)}`;
  }
  return imageUrl;
}
