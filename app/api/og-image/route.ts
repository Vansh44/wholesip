import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { GCS_PUBLIC_HOST, GCS_BUCKET_NAME } from "@/lib/storage/gcs";

/**
 * OG Image proxy — serves a compressed, WhatsApp-friendly version of any
 * managed GCS storage image.
 *
 * Usage:  /api/og-image?url=<encodeURIComponent(managed_storage_url)>
 *
 * Why this exists:
 *  1. WhatsApp's crawler silently drops og:image when the file is > ~300 KB.
 *  2. This route fetches the original image, compresses it to a small JPEG
 *     via sharp, and returns it with proper cache headers.
 *
 * Caching: no server-side persistence — the `Cache-Control`/`CDN-Cache-Control`
 * headers below let the browser/CDN cache the optimized JPEG, so repeat requests
 * for the same card are served from cache without re-running sharp.
 */

export const runtime = "nodejs";

// A true 1200×630 card — the standard OG ratio (1.91:1) that Facebook,
// Twitter/X and LinkedIn expect, so the width/height we declare in page
// metadata is honest. `contain` + white pad keeps the whole product/cover
// visible (no awkward cropping) while still filling the fixed canvas.
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const JPEG_QUALITY = 70;

const CACHE_HEADERS = {
  "Content-Type": "image/jpeg",
  "Cache-Control":
    "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
  "CDN-Cache-Control": "public, max-age=86400",
  "Access-Control-Allow-Origin": "*",
};

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "Missing ?url= parameter" },
      { status: 400 },
    );
  }

  // Only allow proxying our OWN managed media (Google Cloud Storage). Parse and
  // validate STRUCTURALLY — a substring test (`url.includes("googleapis.com")`)
  // is trivially bypassable with a URL like
  // `http://169.254.169.254/?x=storage.googleapis.com`, turning this fetch()
  // into an SSRF vector against internal/metadata hosts. Scope strictly to the
  // configured bucket so this can't proxy arbitrary public GCS objects.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  const isGcs =
    parsed.hostname === GCS_PUBLIC_HOST &&
    GCS_BUCKET_NAME !== null &&
    parsed.pathname.startsWith(`/${GCS_BUCKET_NAME}/`);
  if (parsed.protocol !== "https:" || !isGcs) {
    return NextResponse.json(
      { error: "Only managed storage URLs are allowed" },
      { status: 403 },
    );
  }

  // Cheap guard against cache-busting floods hammering sharp. Generous because
  // legitimate social crawlers may fan out across pages.
  const { allowed } = await rateLimit(`og:${clientIp(request.headers)}`, {
    max: 120,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Fetch the original, compress, and return (cached by the response headers).
  try {
    const upstream = await fetch(url, { headers: { Accept: "image/*" } });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Upstream image not found" },
        { status: upstream.status },
      );
    }

    const inputBuffer = Buffer.from(await upstream.arrayBuffer());
    const optimized = await sharp(inputBuffer)
      .resize(OG_WIDTH, OG_HEIGHT, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        withoutEnlargement: true,
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: JPEG_QUALITY, progressive: true })
      .toBuffer();

    return new NextResponse(new Uint8Array(optimized), {
      status: 200,
      headers: CACHE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch or process image" },
      { status: 502 },
    );
  }
}
