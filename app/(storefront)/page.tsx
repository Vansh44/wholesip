import type { Metadata } from "next";
import StructuredData from "@/app/(storefront)/components/structured-data";
import { getCurrentStoreId } from "@/lib/store/resolve";
import { getStoreBrand } from "@/lib/store/brand";
import { getPublishedPage } from "@/lib/storefront/queries";
import { getDraftPageForPreview } from "@/lib/pages/preview";
import { resolveSectionData } from "@/lib/sections/resolve-data";
import { PageSectionRenderer } from "@/app/(storefront)/components/sections/page-section-renderer";
import {
  PreviewBridge,
  PreviewBadge,
} from "@/app/(storefront)/components/sections/preview-bridge";
import type { PageSectionItem } from "@/lib/sections/registry";
import "@/app/(storefront)/(pages)/shop/shop.css"; // .shop-card styles for product sections
import "@/app/(storefront)/components/homepage/homepage.css";

// The storefront homepage is the store_pages row with the empty slug (""), the
// "homepage sentinel". It's edited in /dashboard/builder like any other page —
// same section model, same draft → publish flow, same preview. The hero is just
// a custom_code section, so it's fully editable too. See CODEBASE.md §11.
//
// Storefront reads are cached per store (unstable_cache); the route stays
// dynamic only because getCurrentStoreId reads headers().
export const revalidate = 300;

const HOME_SLUG = "";

type Props = {
  searchParams: Promise<{ preview?: string }>;
};

const isPreview = (sp: { preview?: string }) => sp.preview === "1";

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const sp = await searchParams;
  const brand = await getStoreBrand();
  const fallbackTitle = brand.tagline
    ? `${brand.name} | ${brand.tagline}`
    : brand.name;

  // Preview renders draft content — always noindex.
  if (isPreview(sp)) {
    return {
      title: { absolute: `${brand.name} (preview)` },
      robots: { index: false, follow: false },
    };
  }

  const storeId = await getCurrentStoreId();
  const page = await getPublishedPage(storeId, HOME_SLUG);
  const title = page?.seo_title || fallbackTitle;
  return {
    title: { absolute: title },
    description: page?.seo_description || brand.tagline || undefined,
    alternates: { canonical: "/" },
    robots: page?.seo_noindex ? { index: false, follow: false } : undefined,
  };
}

async function renderSections(
  sections: PageSectionItem[],
  storeId: string,
  preview: boolean,
) {
  const resolved = await resolveSectionData(
    sections.filter((s) => s.enabled),
    storeId,
  );
  return (
    <main>
      <StructuredData />
      <PageSectionRenderer sections={sections} resolved={resolved} />
      {preview && (
        <>
          <PreviewBridge />
          <PreviewBadge />
        </>
      )}
    </main>
  );
}

export default async function Home({ searchParams }: Props) {
  const sp = await searchParams;
  const storeId = await getCurrentStoreId();

  // Builder preview: draft sections, admin-gated + uncached. Unauthorized or
  // missing → fall through to the published render (never leak, never error).
  if (isPreview(sp)) {
    const draft = await getDraftPageForPreview(storeId, HOME_SLUG);
    if (draft) return renderSections(draft.sections ?? [], storeId, true);
  }

  const page = await getPublishedPage(storeId, HOME_SLUG);
  if (!page) {
    // No published homepage yet — render an empty shell (still valid + indexable
    // via metadata). The merchant builds it in /dashboard/builder.
    return (
      <main>
        <StructuredData />
      </main>
    );
  }

  return renderSections(page.published_sections ?? [], storeId, false);
}
