import {
  GCS_PUBLIC_HOST,
  gcsPathFromUrl,
  gcsDeletePaths,
} from "@/lib/storage/gcs";
import { logError } from "@/lib/observability/logger";

// Server-only helpers to keep object storage in sync with the database.
// Uploads add files to Google Cloud Storage; removing a URL from a row only
// drops the reference, so without this the file would be orphaned in the bucket.
//
// GCS-only: media lives in GCS (storage.googleapis.com/<bucket>/…). Legacy
// Supabase-hosted URLs (from before the Phase-3 migration) are left untouched —
// they keep serving until the Supabase project is decommissioned.

// Escaped host for use inside a RegExp (dots are regex metachars).
const GCS_HOST_RE = GCS_PUBLIC_HOST.replace(/\./g, "\\.");

// Pull every managed (GCS) media URL out of an HTML string — e.g. images the
// rich-text editor embedded in a blog body. Returns unique URLs.
export function extractMediaUrlsFromHtml(
  html: string | null | undefined,
): string[] {
  if (!html) return [];
  const re = new RegExp(
    // storage.googleapis.com/<bucket>/<path>
    `https?://${GCS_HOST_RE}/[^/"'\\s)]+/[^"'\\s)]+`,
    "g",
  );
  return Array.from(new Set(html.match(re) ?? []));
}

// Best-effort deletion of GCS objects by their public URL. Never throws — a
// storage hiccup must not fail the surrounding DB write. Non-GCS URLs (e.g.
// legacy Supabase) are ignored.
export async function deleteStorageUrls(
  urls: (string | null | undefined)[],
): Promise<void> {
  const gcsPaths = new Set<string>();

  for (const url of urls) {
    if (!url) continue;
    const gcsPath = gcsPathFromUrl(url);
    if (gcsPath) gcsPaths.add(gcsPath);
  }

  if (gcsPaths.size > 0) {
    try {
      await gcsDeletePaths([...gcsPaths]);
    } catch (err) {
      logError("deleteStorageUrls: GCS delete failed", err);
    }
  }
}
