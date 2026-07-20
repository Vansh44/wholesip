export type UploadOptions = {
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
 * Uploads an image via the server route (/api/upload) and returns its public
 * URL. The upload runs server-side (Node runtime): the route optimizes with
 * sharp and stores to Google Cloud Storage. A hard AbortController timeout
 * guarantees the UI recovers if the request stalls.
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
 * Videos are too large to proxy through a serverless route, so this uses the
 * signed-URL flow: the server (/api/upload/sign-video) authenticates + validates
 * and mints a one-time v4 signed PUT URL; the file then goes DIRECTLY to Google
 * Cloud Storage.
 */
export async function uploadVideo(file: File, options: UploadOptions = {}) {
  const { folder = "" } = options;

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
    uploadUrl?: string;
    publicUrl?: string;
    error?: string;
  };
  if (!signRes.ok || !signed.uploadUrl || !signed.publicUrl) {
    throw new Error(signed.error || `Upload failed (${signRes.status}).`);
  }

  // PUT the file directly to the v4 signed URL (Content-Type must match what
  // was signed).
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
