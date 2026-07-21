import { count, desc, eq } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { mediaAssets } from "@/drizzle/schema";
import { requireSectionAccess, getActingStoreId } from "../lib/access";
import { DASHBOARD_PAGE_SIZE, pickPage } from "../lib/list-params";
import { MediaLibraryView } from "./media-library-view";
import type { MediaAsset } from "@/app/actions/media-actions";

export default async function MediaDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSectionAccess("media", "view");

  const sp = await searchParams;
  const page = pickPage(sp.page);
  const pageSize = DASHBOARD_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const storeId = await getActingStoreId();

  let assets: MediaAsset[] = [];
  let total = 0;
  try {
    const result = await withService(async (db) => {
      // Sequential (not Promise.all): one pooled connection serialises queries
      // anyway, so parallelising only trips pg's in-flight-query deprecation.
      const rows = await db
        .select({
          id: mediaAssets.id,
          url: mediaAssets.url,
          path: mediaAssets.path,
          filename: mediaAssets.filename,
          content_type: mediaAssets.contentType,
          size_bytes: mediaAssets.sizeBytes,
          created_at: mediaAssets.createdAt,
        })
        .from(mediaAssets)
        .where(eq(mediaAssets.storeId, storeId))
        .orderBy(desc(mediaAssets.createdAt))
        .limit(pageSize)
        .offset(from);
      const countRows = await db
        .select({ n: count() })
        .from(mediaAssets)
        .where(eq(mediaAssets.storeId, storeId));
      return { rows, total: countRows[0]?.n ?? 0 };
    });
    assets = result.rows as unknown as MediaAsset[];
    total = result.total;
  } catch (err) {
    console.error(
      "MediaDashboardPage load:",
      err instanceof Error ? err.message : err,
    );
  }

  return (
    <MediaLibraryView
      assets={assets}
      total={total}
      page={page}
      pageSize={pageSize}
    />
  );
}
