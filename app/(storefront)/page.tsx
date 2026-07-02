import Hero from "@/app/(storefront)/components/hero/Hero";
import StructuredData from "@/app/(storefront)/components/structured-data";
import { getEnabledHomepageSections } from "@/lib/storefront/queries";
import { getCurrentStoreId, WHOLESIP_STORE_ID } from "@/lib/store/resolve";
import { getStoreBrand } from "@/lib/store/brand";
import { HomepageSectionRenderer } from "@/app/(storefront)/components/homepage/homepage-section-renderer";
import { resolveSectionData } from "@/lib/sections/resolve-data";
import type { HomepageSection } from "@/lib/homepage/section-types";
import "@/app/(storefront)/(pages)/shop/shop.css"; // .shop-card styles for featured grid
import "@/app/(storefront)/components/homepage/homepage.css";

// Storefront reads run through `unstable_cache` (lib/storefront/queries) so the
// homepage no longer hits the DB on every visit. ISR-revalidate as a freshness
// fallback; dashboard edits invalidate the cache instantly via revalidateTag /
// revalidatePath("/") in the actions.
export const revalidate = 300;

export async function generateMetadata() {
  const brand = await getStoreBrand();
  const title = brand.tagline ? `${brand.name} | ${brand.tagline}` : brand.name;
  return {
    title: { absolute: title },
    description: brand.tagline ?? undefined,
    alternates: { canonical: "/" },
  };
}

export default async function Home() {
  const storeId = await getCurrentStoreId();

  // Enabled sections in order. If the table is missing (migration not applied
  // yet) we just render the hero.
  const sections = (await getEnabledHomepageSections(
    storeId,
  )) as HomepageSection[];

  if (sections.length === 0) {
    return (
      <main>
        <StructuredData />
        {storeId === WHOLESIP_STORE_ID && <Hero />}
      </main>
    );
  }

  // Batched, cached per-section data resolution (shared with custom pages).
  const resolved = await resolveSectionData(sections, storeId);

  return (
    <main>
      <StructuredData />
      {storeId === WHOLESIP_STORE_ID && <Hero />}
      <div className="home-sections">
        {sections.map((s) => (
          <HomepageSectionRenderer key={s.id} section={s} resolved={resolved} />
        ))}
      </div>
    </main>
  );
}
