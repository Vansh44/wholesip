import { SITE_URL, BRAND_NAME, BRAND_ALTERNATE_NAMES } from "@/lib/site";

// Organization + WebSite JSON-LD for the storefront homepage. The Organization
// `alternateName` list is the key signal that tells search engines "WholeSip" /
// "whole sip" is a single brand name — not two separate words — so they stop
// auto-correcting brand queries.
export default function StructuredData() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: BRAND_NAME,
        alternateName: BRAND_ALTERNATE_NAMES,
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
        description: "Zero preservatives. 100% real ingredients.",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: BRAND_NAME,
        alternateName: "wholesip",
        url: SITE_URL,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Static, no user input — safe to inline.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
