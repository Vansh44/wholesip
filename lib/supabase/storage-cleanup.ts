import { createAdminClient } from "./admin";

// Server-only helpers to keep Supabase Storage in sync with the database.
// Uploads add files to the `media` bucket; removing a URL from a row only drops
// the reference, so without this the file would be orphaned in the bucket.

const STORAGE_BUCKET = "media";

// Turn a public URL (…/object/public/media/<path>) into its in-bucket path.
export function pathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${STORAGE_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.substring(i + marker.length);
}

// Pull every media-bucket image URL out of an HTML string (e.g. images the
// rich-text editor embedded in a blog body). Returns unique URLs.
export function extractMediaUrlsFromHtml(
  html: string | null | undefined,
): string[] {
  if (!html) return [];
  const re = new RegExp(
    `https?://[^"'\\s)]+/object/public/${STORAGE_BUCKET}/[^"'\\s)]+`,
    "g",
  );
  return Array.from(new Set(html.match(re) ?? []));
}

// Best-effort deletion via the service-role client (bypasses storage RLS).
// Never throws — a storage hiccup must not fail the surrounding DB write.
export async function deleteStorageUrls(
  urls: (string | null | undefined)[],
): Promise<void> {
  const paths = Array.from(
    new Set(
      urls
        .map((u) => (u ? pathFromPublicUrl(u) : null))
        .filter((p): p is string => !!p),
    ),
  );
  if (paths.length === 0) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin.storage.from(STORAGE_BUCKET).remove(paths);
    if (error) console.error("deleteStorageUrls error:", error);
  } catch (err) {
    console.error("deleteStorageUrls threw:", err);
  }
}
