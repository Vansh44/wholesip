"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { dbErrorMessage } from "@/lib/db/errors";
import { mediaAssets } from "@/drizzle/schema";
import { getActingStoreId, getManagerUserId } from "@/app/dashboard/lib/access";
import {
  gcsConfigured,
  gcsUploadObject,
  gcsPathFromUrl,
  gcsDeletePaths,
} from "@/lib/storage/gcs";
import { processImageUpload } from "@/lib/storage/process-image";

export interface MediaAsset {
  id: string;
  url: string;
  path: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

// Aliased to the snake_case shape the view/page expect (Drizzle keys are camel).
const ASSET_COLUMNS = {
  id: mediaAssets.id,
  url: mediaAssets.url,
  path: mediaAssets.path,
  filename: mediaAssets.filename,
  content_type: mediaAssets.contentType,
  size_bytes: mediaAssets.sizeBytes,
  created_at: mediaAssets.createdAt,
};

/**
 * Upload one image to the store's media library: validate + optimize (shared
 * with /api/upload), store to GCS under a store-scoped path, and record a
 * media_assets row. Gated on the `media` section. If the DB write fails the
 * just-uploaded object is removed so no orphan is left in the bucket.
 */
export async function uploadMediaAsset(
  formData: FormData,
): Promise<{ asset?: MediaAsset; error?: string }> {
  const userId = await getManagerUserId("media");
  if (!userId) return { error: "You don't have access to the media library." };
  if (!gcsConfigured) return { error: "Uploads are not configured." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file provided." };

  const processed = await processImageUpload(file);
  if (!processed.ok) return { error: processed.error };

  const storeId = await getActingStoreId();
  const fileName = `${Math.random().toString(36).slice(2, 12)}_${Date.now()}.${processed.data.ext}`;
  const path = `stores/${storeId}/media/${fileName}`;

  let url: string;
  try {
    url = await gcsUploadObject(
      path,
      processed.data.bytes,
      processed.data.contentType,
    );
  } catch (err) {
    console.error(
      "uploadMediaAsset (GCS):",
      err instanceof Error ? err.message : err,
    );
    return { error: "Upload failed. Please try again." };
  }

  try {
    const [row] = await withService((db) =>
      db
        .insert(mediaAssets)
        .values({
          storeId,
          url,
          path,
          filename: (file.name || "").slice(0, 255),
          contentType: processed.data.contentType,
          sizeBytes: processed.data.bytes.length,
          createdBy: userId,
        })
        .returning(ASSET_COLUMNS),
    );
    revalidatePath("/dashboard/media");
    return { asset: row as unknown as MediaAsset };
  } catch (err) {
    // Row didn't persist → remove the orphaned object so the bucket stays clean.
    await gcsDeletePaths([path]);
    console.error(
      "uploadMediaAsset (insert):",
      err instanceof Error ? err.message : err,
    );
    return { error: dbErrorMessage(err, "Could not save the upload.") };
  }
}

/**
 * Delete a library item: removes the media_assets row (store-scoped) AND the
 * underlying object from the GCS bucket. Gated on the `media` section.
 */
export async function deleteMediaAsset(
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  const userId = await getManagerUserId("media");
  if (!userId) return { error: "You don't have access to the media library." };
  if (typeof id !== "string" || !id.trim()) return { error: "Invalid item." };

  const storeId = await getActingStoreId();

  // Fetch (store-scoped) to get the bucket path before deleting.
  const rows = await withService((db) =>
    db
      .select({ path: mediaAssets.path, url: mediaAssets.url })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.storeId, storeId)))
      .limit(1),
  ).catch(() => [] as { path: string; url: string }[]);
  const asset = rows[0];
  if (!asset) return { error: "That media item no longer exists." };

  // DB row is the library's source of truth → delete it first, then best-effort
  // remove the object (gcsDeletePaths never throws).
  try {
    await withService((db) =>
      db
        .delete(mediaAssets)
        .where(and(eq(mediaAssets.id, id), eq(mediaAssets.storeId, storeId))),
    );
  } catch (err) {
    console.error(
      "deleteMediaAsset:",
      err instanceof Error ? err.message : err,
    );
    return { error: dbErrorMessage(err, "Could not delete this item.") };
  }

  const path = asset.path || gcsPathFromUrl(asset.url);
  if (path) await gcsDeletePaths([path]);

  revalidatePath("/dashboard/media");
  return { success: true };
}
