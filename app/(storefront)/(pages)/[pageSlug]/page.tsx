import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStorefrontStoreId } from "@/lib/store/resolve";
import { getStoreBrand } from "@/lib/store/brand";
import { getPublishedPage } from "@/lib/storefront/queries";
import { getDraftPageForPreview } from "@/lib/pages/preview";
import { resolveSectionData } from "@/lib/sections/resolve-data";
import { PageSectionRenderer } from "@/app/(storefront)/components/sections/page-section-renderer";
import {
  PreviewBridge,
  PreviewBadge,
} from "@/app/(storefront)/components/sections/preview-bridge";
import { BuilderOverlay } from "@/app/(storefront)/components/sections/builder-overlay";
import type { PageSectionItem } from "@/lib/sections/registry";
import "@/app/(storefront)/(pages)/shop/shop.css"; // .shop-card styles for product sections
import "@/app/(storefront)/components/homepage/homepage.css";

// Custom merchant pages built in /dashboard/builder. This dynamic segment sits
// alongside the static (pages)/* routes; App Router serves the static siblings
// (shop, blogs, our-story, …) first, so this only ever handles slugs that don't
// match a built-in route. Unknown slugs fall through to a cached 404.
//
// Storefront reads are cached per store (unstable_cache); the page stays
// dynamic only because requireStorefrontStoreId reads headers().
export const revalidate = 300;

type Props = {
  params: Promise<{ pageSlug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

const isPreview = (sp: { preview?: string }) => sp.preview === "1";

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const [{ pageSlug }, sp] = await Promise.all([params, searchParams]);
  const storeId = await requireStorefrontStoreId();

  // Preview renders draft content — always noindex, minimal metadata.
  if (isPreview(sp)) {
    const draft = await getDraftPageForPreview(storeId, pageSlug);
    if (draft) {
      return {
        title: `${draft.title || draft.slug} (preview)`,
        robots: { index: false, follow: false },
      };
    }
  }

  const page = await getPublishedPage(storeId, pageSlug);
  if (!page) return {};

  const brand = await getStoreBrand();
  const title = page.seo_title || page.title || brand.name;
  return {
    title,
    description: page.seo_description || undefined,
    alternates: { canonical: `/${page.slug}` },
    robots: page.seo_noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description: page.seo_description || undefined,
      url: `/${page.slug}`,
      type: "website",
    },
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
      <PageSectionRenderer sections={sections} resolved={resolved} />
      {preview && (
        <>
          <PreviewBridge />
          <PreviewBadge />
          <BuilderOverlay />
        </>
      )}
    </main>
  );
}

export default async function StorePage({ params, searchParams }: Props) {
  const [{ pageSlug }, sp] = await Promise.all([params, searchParams]);
  const storeId = await requireStorefrontStoreId();

  // Builder preview: draft sections, admin-gated + uncached. Unauthorized or
  // missing → fall through to the published render (never leak, never error).
  if (isPreview(sp)) {
    const draft = await getDraftPageForPreview(storeId, pageSlug);
    if (draft) {
      return renderSections(draft.sections ?? [], storeId, true);
    }
  }

  const page = await getPublishedPage(storeId, pageSlug);
  if (!page) notFound();

  return renderSections(page.published_sections ?? [], storeId, false);
}
