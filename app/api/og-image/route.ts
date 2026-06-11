import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

/**
 * OG Image proxy — serves a compressed, WhatsApp-friendly version of any
 * Supabase storage image.
 *
 * Usage:  /api/og-image?url=<encodeURIComponent(original_supabase_url)>
 *
 * Why this exists:
 *  1. WhatsApp's crawler silently drops og:image when the file is > ~300 KB.
 *  2. Next.js HTML-encodes `&` → `&amp;` inside meta tag attributes, so
 *     multi-param Supabase transform URLs break when WhatsApp fetches them.
 *  3. This route fetches the original image, compresses it to a small JPEG
 *     via sharp, and returns it with proper cache headers — giving WhatsApp
 *     a single, clean, ampersand-free URL and a small file it will display.
 */

const OG_WIDTH = 1200;
const JPEG_QUALITY = 70;

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
      headers: { Accept: "image/*" },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Upstream image not found" },
        { status: upstream.status },
      );
    }

    const inputBuffer = Buffer.from(await upstream.arrayBuffer());

    // Resize to OG-friendly dimensions and convert to JPEG for small file size
    const optimized = await sharp(inputBuffer)
      .resize(OG_WIDTH, undefined, { withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, progressive: true })
      .toBuffer();

    return new NextResponse(new Uint8Array(optimized), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(optimized.length),
        "Cache-Control":
          "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        "CDN-Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch or process image" },
      { status: 502 },
    );
  }
}
