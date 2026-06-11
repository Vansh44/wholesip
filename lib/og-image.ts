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

  // Use the og-image proxy so there's a single clean URL with no ampersand issues
  return `/api/og-image?url=${encodeURIComponent(imageUrl)}`;
}
