import { and, eq } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { storePages } from "@/drizzle/schema";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import type { PageSectionItem } from "@/lib/sections/registry";

// ---------------------------------------------------------------------------
// Draft preview loader for the website builder.
//
// The storefront [pageSlug] route renders the PUBLISHED snapshot from a cached
// anon read. When the builder's preview iframe requests `?preview=1`, we
// instead render the live DRAFT `sections`. This loader:
//   • is UNCACHED (a fresh read every time — never poisons the published cache),
//   • authorizes via getManagerUserId("builder") — the exact gate the builder's
//     server actions use — so only a store admin sees unpublished content,
//   • reads with the SERVICE scope, because the draft `sections` column is
//     revoked from anon+authenticated at the DB layer (store_pages.sql),
//   • is store-scoped explicitly (the service scope bypasses RLS).
// Returns null when unauthorized or missing — the caller then falls back to the
// published render, so preview never leaks and never errors.
// ---------------------------------------------------------------------------

export interface DraftPage {
  id: string;
  slug: string;
  title: string;
  seo_title: string;
  seo_description: string;
  sections: PageSectionItem[];
}

export async function getDraftPageForPreview(
  storeId: string,
  slug: string,
): Promise<DraftPage | null> {
  // Authorize first — no admin, no draft. (Also short-circuits anonymous
  // visitors who append ?preview=1 to a URL.)
  const userId = await getManagerUserId("builder");
  if (!userId) return null;

  try {
    const rows = await withService((db) =>
      db
        .select({
          id: storePages.id,
          slug: storePages.slug,
          title: storePages.title,
          seo_title: storePages.seoTitle,
          seo_description: storePages.seoDescription,
          sections: storePages.sections,
        })
        .from(storePages)
        .where(and(eq(storePages.storeId, storeId), eq(storePages.slug, slug)))
        .limit(1),
    );
    return (rows[0] as unknown as DraftPage | undefined) ?? null;
  } catch (err) {
    console.error(
      "getDraftPageForPreview:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
