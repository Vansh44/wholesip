import { createClient } from "./client";

export type UploadOptions = {
  bucketName?: string;
  folder?: string;
};

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Uploads a file via the server route (/api/upload) and returns its public URL.
 *
 * The upload runs server-side (Node runtime) instead of from the browser
 * Supabase client. This avoids the @supabase/ssr auth Web-Lock contention that
 * can occur with multiple open tabs and make a direct client storage upload
 * hang forever. A hard AbortController timeout guarantees the UI recovers.
 *
 * @param file The File object to upload
 * @param options Upload options (folder)
 * @returns The public URL of the uploaded image
 */
export async function uploadImage(file: File, options: UploadOptions = {}) {
  const { folder = "" } = options;

  // Fast client-side validation for immediate feedback.
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(
      `Unsupported file type: ${file.type || "unknown"}. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  if (folder) formData.append("folder", folder);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Upload timed out. Check your connection and try again.");
    }
    throw new Error("Network error while uploading. Please try again.");
  } finally {
    clearTimeout(timer);
  }

  const result = (await response.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };

  if (!response.ok || !result.url) {
    throw new Error(result.error || `Upload failed (${response.status}).`);
  }

  return result.url;
}

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Uploads a video and returns its public URL.
 *
 * Videos are too large to proxy through a serverless route (Vercel caps
 * request bodies ~4.5 MB), so this uses the signed-URL flow: the server
 * (/api/upload/sign-video) authenticates + validates and mints a one-time
 * signed upload URL; the file then goes DIRECTLY to Supabase Storage.
 */
export async function uploadVideo(file: File, options: UploadOptions = {}) {
  const { folder = "", bucketName = "media" } = options;

  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    throw new Error(
      `Unsupported video type: ${file.type || "unknown"}. Use MP4 or WebM.`,
    );
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(
      `Video too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_VIDEO_BYTES / 1024 / 1024} MB.`,
    );
  }

  const signRes = await fetch("/api/upload/sign-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: file.type, size: file.size, folder }),
  });
  const signed = (await signRes.json().catch(() => ({}))) as {
    provider?: "gcs" | "supabase";
    uploadUrl?: string;
    path?: string;
    token?: string;
    publicUrl?: string;
    error?: string;
  };
  if (!signRes.ok || !signed.publicUrl) {
    throw new Error(signed.error || `Upload failed (${signRes.status}).`);
  }

  // GCS: PUT the file directly to the v4 signed URL (Content-Type must match
  // what was signed). Supabase: upload via the token flow.
  if (signed.provider === "gcs") {
    if (!signed.uploadUrl) {
      throw new Error(`Upload failed (${signRes.status}).`);
    }
    const put = await fetch(signed.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!put.ok) {
      throw new Error(`Upload failed (${put.status}).`);
    }
    return signed.publicUrl;
  }

  if (!signed.path || !signed.token) {
    throw new Error(signed.error || `Upload failed (${signRes.status}).`);
  }
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(bucketName)
    .uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: file.type,
      cacheControl: "3600",
    });
  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
  return signed.publicUrl;
}

/**
 * Gets the public URL for a file in Supabase Storage
 * @param path The path to the file in the bucket
 * @param bucketName The name of the bucket (default: 'media')
 * @returns The public URL string
 */
export function getImageUrl(path: string, bucketName: string = "media") {
  const supabase = createClient();
  const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Deletes an image from Supabase Storage
 * @param path The path of the file to delete
 * @param bucketName The name of the bucket (default: 'media')
 */
export async function deleteImage(path: string, bucketName: string = "media") {
  const supabase = createClient();
  const { error } = await supabase.storage.from(bucketName).remove([path]);

  if (error) {
    console.error("Error deleting image:", error);
    throw error;
  }
}

/**
 * Extracts the file path from a Supabase Storage public URL
 * @param url The full public URL
 * @param bucketName The name of the bucket (default: 'media')
 * @returns The path of the file within the bucket, or null if it cannot be extracted
 */
export function extractPathFromUrl(
  url: string,
  bucketName: string = "media",
): string | null {
  if (!url) return null;

  try {
    const bucketUrlPart = `/object/public/${bucketName}/`;
    const index = url.indexOf(bucketUrlPart);
    if (index !== -1) {
      return url.substring(index + bucketUrlPart.length);
    }
    return null;
  } catch {
    return null;
  }
}
