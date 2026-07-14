import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { gcsConfigured, gcsUploadObject } from "@/lib/storage/gcs";
import { logError } from "@/lib/observability/logger";

// Run on the Node runtime; uploads happen server-side via the user's cookie
// session. This avoids the browser @supabase/ssr Web-Locks auth contention
// (multiple open tabs) that can make client-side storage uploads hang forever.
export const runtime = "nodejs";

const BUCKET = "media";
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB (input cap)

// Optimization targets. Re-encoding to WebP at a sane width keeps stored files
// small (often <200 KB from a multi-MB upload), so storage and bandwidth grow
// far slower at scale. Animated GIFs and already-efficient AVIF are passed
// through untouched (re-encoding a GIF would drop the animation).
const MAX_WIDTH = 1600;
const WEBP_QUALITY = 80;
// SVG is deliberately NOT passed through: a crafted SVG can carry <script> that
// executes when the file is opened directly on the storage origin. We instead
// rasterize it to WebP via sharp (below), and refuse to store the raw bytes.
const PASS_THROUGH_TYPES = ["image/gif", "image/avif"];

export async function POST(request: Request) {
  const supabase = await createClient();

  // Require an authenticated user (admins for dashboard, logged-in customers
  // for blog covers). Prevents anonymous abuse of the media bucket.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Throttle per user — image processing is CPU-bound, so cap how fast a single
  // account can drive uploads. 60 / minute is generous for real editing.
  const { allowed } = await rateLimit(`upload:${user.id}`, {
    max: 60,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please slow down and try again shortly." },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid upload payload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const folder = ((form.get("folder") as string) || "").replace(
    /[^a-z0-9/_-]/gi,
    "",
  );

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || "unknown"}.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      {
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`,
      },
      { status: 400 },
    );
  }

  const original = new Uint8Array(await file.arrayBuffer());

  // Optimize where it's safe to. On any sharp failure, fall back to the
  // original bytes so an odd image never breaks the upload.
  let bytes: Uint8Array = original;
  let contentType = file.type;
  let ext =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "bin";

  if (!PASS_THROUGH_TYPES.includes(file.type)) {
    try {
      const optimized = await sharp(original)
        .rotate() // honor EXIF orientation before stripping metadata
        .resize(MAX_WIDTH, undefined, { withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      bytes = new Uint8Array(optimized);
      contentType = "image/webp";
      ext = "webp";
    } catch (e) {
      console.error("Image optimization failed:", e);
      // Storing the original is only safe for already-inert raster formats. An
      // SVG that sharp couldn't rasterize must never be persisted raw — that's
      // exactly the payload we're guarding against — so reject it instead.
      if (file.type === "image/svg+xml") {
        return NextResponse.json(
          { error: "Could not process this SVG. Please upload a PNG or JPG." },
          { status: 400 },
        );
      }
      console.error("Storing original bytes for", file.type);
    }
  }

  const fileName = `${Math.random().toString(36).substring(2, 12)}_${Date.now()}.${ext}`;
  const filePath = folder ? `${folder}/${fileName}` : fileName;

  // Google Cloud Storage when configured (Phase 3), else Supabase Storage.
  if (gcsConfigured) {
    try {
      const url = await gcsUploadObject(filePath, bytes, contentType);
      return NextResponse.json({ url });
    } catch (err) {
      logError("upload: GCS upload failed", err, { path: filePath });
      return NextResponse.json(
        { error: "Upload failed. Please try again." },
        { status: 500 },
      );
    }
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, bytes, {
      cacheControl: "3600",
      upsert: false,
      contentType,
    });

  if (error) {
    logError("upload: Supabase upload failed", error, { path: filePath });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return NextResponse.json({ url: pub.publicUrl });
}
