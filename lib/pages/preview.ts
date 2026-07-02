import { createAdminClient } from "@/lib/supabase/admin";
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
//   • reads with the SERVICE-ROLE client, because the draft `sections` column is
//     revoked from anon+authenticated at the DB layer (store_pages.sql),
//   • is store-scoped explicitly (service role bypasses RLS).
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

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("store_pages")
    .select("id, slug, title, seo_title, seo_description, sections")
    .eq("store_id", storeId)
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as DraftPage;
}
