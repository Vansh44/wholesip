import { getStoreBrand } from "@/lib/store/brand";
import { getStoreUrl } from "@/lib/site";

// Organization + WebSite JSON-LD for the current store's storefront homepage,
// resolved from that store's brand + canonical origin (not a hardcoded brand).
export default async function StructuredData() {
  const [brand, siteUrl] = await Promise.all([getStoreBrand(), getStoreUrl()]);
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: brand.name,
        url: siteUrl,
        logo: brand.logoUrl ?? `${siteUrl}/icon.svg`,
        ...(brand.tagline ? { description: brand.tagline } : {}),
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: brand.name,
        url: siteUrl,
        publisher: { "@id": `${siteUrl}/#organization` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
