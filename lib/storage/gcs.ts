// Google Cloud Storage backend for media (GCP migration Phase 3 — see
// docs/gcp-migration-phase5-6.md and CODEBASE.md §7).
//
// New image/video uploads go here when GCS_BUCKET is set; otherwise the app
// falls back to Supabase Storage (fully backward-compatible, reversible). Auth
// is Application Default Credentials (ADC) — automatic on Cloud Run's default
// service account, local dev via `gcloud auth application-default login`. An
// optional base64 service-account JSON (GCP_SA_KEY) is honoured for hosts
// without ADC (e.g. Vercel) and is REQUIRED to sign video upload URLs off
// Cloud Run (user ADC can't sign; Cloud Run signs via IAM SignBlob).
//
// Server-only (the @google-cloud/storage SDK is Node-only). Objects are served
// from a PUBLIC bucket (uniform bucket-level access + allUsers:objectViewer),
// so the public URL is a plain https://storage.googleapis.com/<bucket>/<path>.

import type { Storage } from "@google-cloud/storage";
import { logError } from "@/lib/observability/logger";

export const GCS_PUBLIC_HOST = "storage.googleapis.com";

// The configured media bucket (null when GCS is not the backend).
export const GCS_BUCKET_NAME = process.env.GCS_BUCKET || null;

/** True when GCS is configured as the media backend. */
export const gcsConfigured = Boolean(GCS_BUCKET_NAME);

let _storage: Storage | null = null;

async function bucket() {
  if (!GCS_BUCKET_NAME) throw new Error("GCS_BUCKET is not set.");
  if (!_storage) {
    const { Storage } = await import("@google-cloud/storage");
    const keyB64 = process.env.GCP_SA_KEY;
    _storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID,
      ...(keyB64
        ? {
            credentials: JSON.parse(
              Buffer.from(keyB64, "base64").toString("utf8"),
            ),
          }
        : {}),
    });
  }
  return _storage.bucket(GCS_BUCKET_NAME);
}

/** Public URL for an in-bucket path. */
export function gcsPublicUrl(path: string): string {
  return `https://${GCS_PUBLIC_HOST}/${GCS_BUCKET_NAME}/${path}`;
}

/** Parse a GCS public URL back to its in-bucket path, or null if it isn't one. */
export function gcsPathFromUrl(url: string): string | null {
  if (!GCS_BUCKET_NAME || !url) return null;
  const marker = `${GCS_PUBLIC_HOST}/${GCS_BUCKET_NAME}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.substring(i + marker.length);
}

/** Upload bytes and return the public URL. Object is public via bucket policy. */
export async function gcsUploadObject(
  path: string,
  bytes: Uint8Array,
  contentType: string,
  cacheControl = "public, max-age=3600",
): Promise<string> {
  const b = await bucket();
  await b.file(path).save(Buffer.from(bytes), {
    contentType,
    resumable: false,
    metadata: { cacheControl },
  });
  return gcsPublicUrl(path);
}

/**
 * Mint a one-time v4 signed URL the client can PUT a video to directly (the
 * serverless body cap makes proxying large files impossible). The signed URL
 * binds the content type, so the client MUST send the same Content-Type header.
 */
export async function gcsSignUploadUrl(
  path: string,
  contentType: string,
): Promise<string> {
  const b = await bucket();
  const [url] = await b.file(path).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 10 * 60 * 1000, // 10 minutes
    contentType,
  });
  return url;
}

/** Best-effort delete of in-bucket paths. Never throws. */
export async function gcsDeletePaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const b = await bucket();
    await Promise.all(
      paths.map((p) =>
        b
          .file(p)
          .delete({ ignoreNotFound: true })
          .catch((err) => logError("gcs: delete failed", err, { path: p })),
      ),
    );
  } catch (err) {
    logError("gcs: delete batch failed", err);
  }
}
