// Shared image ingest for uploads (the media library action + /api/upload).
// Validates type/size, then optimizes to WebP with sharp (small stored files,
// EXIF-rotated, metadata stripped). SVG is rasterized, never stored raw (a
// crafted SVG can carry <script> that runs on the storage origin). Server-only.

import sharp from "sharp";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB (input cap)

// Re-encode to WebP at a sane width so a multi-MB upload stores as <200 KB.
const MAX_WIDTH = 1600;
const WEBP_QUALITY = 80;
// Already-efficient / animation-bearing formats are passed through untouched
// (re-encoding a GIF would drop the animation).
const PASS_THROUGH_TYPES = ["image/gif", "image/avif"];

export interface ProcessedImage {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
}

export type ProcessImageResult =
  | { ok: true; data: ProcessedImage }
  | { ok: false; error: string; status: number };

/** Validate + optimize an uploaded image. Never throws — returns a typed result. */
export async function processImageUpload(
  file: File,
): Promise<ProcessImageResult> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      ok: false,
      error: `Unsupported file type: ${file.type || "unknown"}.`,
      status: 400,
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`,
      status: 400,
    };
  }

  const original = new Uint8Array(await file.arrayBuffer());

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
      // An SVG sharp couldn't rasterize must NEVER be stored raw — that's the
      // payload we're guarding against.
      if (file.type === "image/svg+xml") {
        return {
          ok: false,
          error: "Could not process this SVG. Please upload a PNG or JPG.",
          status: 400,
        };
      }
      console.error("Image optimization failed, storing original:", e);
    }
  }

  return { ok: true, data: { bytes, contentType, ext } };
}
