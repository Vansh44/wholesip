import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/rate-limit";

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
 *     via sharp, and returns it with proper cache headers.
 *
 * Caching: the optimized JPEG is persisted to `media/og-cache/<hash>.jpg` keyed
 * by the source URL. On a cache hit we stream that small file straight back —
 * sharp (CPU) and the large upstream fetch only run on a true miss. Combined
 * with the CDN cache headers below, repeat requests are cheap.
 */

export const runtime = "nodejs";

// A true 1200×630 card — the standard OG ratio (1.91:1) that Facebook,
// Twitter/X and LinkedIn expect, so the width/height we declare in page
// metadata is honest. `contain` + white pad keeps the whole product/cover
// visible (no awkward cropping) while still filling the fixed canvas.
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const JPEG_QUALITY = 70;
const CACHE_BUCKET = "media";
// Versioned: bumping this (or the dimensions) invalidates previously cached
// files, which were generated with the old aspect-preserving logic.
const CACHE_PREFIX = "og-cache/v2";

const CACHE_HEADERS = {
  "Content-Type": "image/jpeg",
  "Cache-Control":
    "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
  "CDN-Cache-Control": "public, max-age=86400",
  "Access-Control-Allow-Origin": "*",
};

function cachePath(url: string): string {
  const hash = createHash("sha1").update(url).digest("hex");
  return `${CACHE_PREFIX}/${hash}.jpg`;
}

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

  // Cheap guard against cache-busting floods hammering sharp. Generous because
  // legitimate social crawlers may fan out across pages.
  const { allowed } = await rateLimit(`og:${clientIp(request.headers)}`, {
    max: 120,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const admin = createAdminClient();
  const path = cachePath(url);

  // 1. Cache hit — serve the already-optimized small file, skip sharp entirely.
  try {
    const { data: cached } = await admin.storage
      .from(CACHE_BUCKET)
      .download(path);
    if (cached) {
      const buf = new Uint8Array(await cached.arrayBuffer());
      return new NextResponse(buf, { status: 200, headers: CACHE_HEADERS });
    }
  } catch {
    // Fall through to generate on any download error.
  }

  // 2. Cache miss — fetch the original, compress, persist, and return.
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

    // Persist for next time (best-effort — never fail the response on a
    // cache-write error). upsert so concurrent misses don't collide.
    admin.storage
      .from(CACHE_BUCKET)
      .upload(path, new Uint8Array(optimized), {
        cacheControl: "86400",
        upsert: true,
        contentType: "image/jpeg",
      })
      .then(({ error }) => {
        if (error) console.error("og-image cache write failed:", error.message);
      });

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
