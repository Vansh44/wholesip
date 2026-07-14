import { createAdminClient } from "./admin";
import {
  GCS_PUBLIC_HOST,
  gcsPathFromUrl,
  gcsDeletePaths,
} from "@/lib/storage/gcs";
import { logError } from "@/lib/observability/logger";

// Server-only helpers to keep object storage in sync with the database.
// Uploads add files to the media backend; removing a URL from a row only drops
// the reference, so without this the file would be orphaned in the bucket.
//
// PROVIDER-AWARE (GCP migration Phase 3): during the transition some stored
// URLs point at Supabase Storage (…/object/public/media/…) and newer ones at
// Google Cloud Storage (storage.googleapis.com/<bucket>/…). Every helper here
// recognises BOTH formats and routes deletions to the right backend.

const STORAGE_BUCKET = "media";
const SUPABASE_MARKER = `/object/public/${STORAGE_BUCKET}/`;
// Escaped host for use inside a RegExp (dots are regex metachars).
const GCS_HOST_RE = GCS_PUBLIC_HOST.replace(/\./g, "\\.");

// Turn a Supabase public URL (…/object/public/media/<path>) into its in-bucket
// path. Returns null for non-Supabase URLs (incl. GCS — use gcsPathFromUrl).
export function pathFromPublicUrl(url: string): string | null {
  const i = url.indexOf(SUPABASE_MARKER);
  return i === -1 ? null : url.substring(i + SUPABASE_MARKER.length);
}

// Pull every managed media URL out of an HTML string (e.g. images the
// rich-text editor embedded in a blog body). Matches BOTH Supabase and GCS
// public URLs. Returns unique URLs.
export function extractMediaUrlsFromHtml(
  html: string | null | undefined,
): string[] {
  if (!html) return [];
  const re = new RegExp(
    // …/object/public/media/…   OR   storage.googleapis.com/<bucket>/…
    // Leading part is `*` (not `+`): a GCS URL has the host right after
    // https:// with no prefix to consume.
    `https?://[^"'\\s)]*(?:/object/public/${STORAGE_BUCKET}/|${GCS_HOST_RE}/[^/"'\\s)]+/)[^"'\\s)]+`,
    "g",
  );
  return Array.from(new Set(html.match(re) ?? []));
}

// Best-effort deletion, split by backend. Supabase URLs go through the
// service-role client (bypasses storage RLS); GCS URLs through the GCS SDK.
// Never throws — a storage hiccup must not fail the surrounding DB write.
export async function deleteStorageUrls(
  urls: (string | null | undefined)[],
): Promise<void> {
  const supabasePaths = new Set<string>();
  const gcsPaths = new Set<string>();

  for (const url of urls) {
    if (!url) continue;
    const gcsPath = gcsPathFromUrl(url);
    if (gcsPath) {
      gcsPaths.add(gcsPath);
      continue;
    }
    const supabasePath = pathFromPublicUrl(url);
    if (supabasePath) supabasePaths.add(supabasePath);
  }

  if (supabasePaths.size > 0) {
    try {
      const admin = createAdminClient();
      const { error } = await admin.storage
        .from(STORAGE_BUCKET)
        .remove([...supabasePaths]);
      if (error) logError("deleteStorageUrls: Supabase remove failed", error);
    } catch (err) {
      logError("deleteStorageUrls: Supabase remove threw", err);
    }
  }

  if (gcsPaths.size > 0) {
    await gcsDeletePaths([...gcsPaths]);
  }
}
