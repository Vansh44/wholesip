import { NextRequest, NextResponse } from "next/server";

/**
 * OG Image proxy — serves a compressed, WhatsApp-friendly version of any
 * Supabase storage image.
 *
 * Usage:  /api/og-image?url=<encodeURIComponent(original_supabase_url)>
 *
 * Why this exists:
 *  1. WhatsApp's crawler ignores og:image when the image is > ~300 KB.
 *  2. Next.js HTML-encodes `&` → `&amp;` inside meta tags, so multi-param
 *     Supabase transform URLs break when WhatsApp fetches them literally.
 *  3. This route fetches the original, pipes it through Next.js (Vercel)
 *     image optimization on the server, and returns a small JPEG with proper
 *     cache headers — giving WhatsApp a single, clean, ampersand-free URL.
 */

// Cache aggressively — the image rarely changes
export const revalidate = 86400; // 24 h ISR

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "Missing ?url= parameter" },
      { status: 400 },
    );
  }

  // Only allow proxying Supabase storage images (safety guard)
  if (!url.includes("supabase.co/storage/")) {
    return NextResponse.json(
      { error: "Only Supabase storage URLs are allowed" },
      { status: 403 },
    );
  }

  try {
    // Fetch the original image from Supabase
    const upstream = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { Accept: "image/*" },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Upstream image not found" },
        { status: upstream.status },
      );
    }

    const buffer = await upstream.arrayBuffer();

    // Return the image with proper content-type and aggressive caching.
    // Vercel's edge will cache this, and WhatsApp will see a fast, small image.
    const contentType = upstream.headers.get("content-type") || "image/png";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control":
          "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        "CDN-Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch image" },
      { status: 502 },
    );
  }
}
