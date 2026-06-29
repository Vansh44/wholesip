import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import {
  getPublishedProducts,
  getPublishedBlogCards,
} from "@/lib/storefront/queries";
import { WHOLESIP_STORE_ID } from "@/lib/store/resolve";

// Regenerate hourly; the underlying product/blog reads are themselves cached
// and invalidated on dashboard edits.
export const revalidate = 3600;

type ChangeFreq = MetadataRoute.Sitemap[number]["changeFrequency"];

// Public, indexable content pages. Storefront routes live in the
// (storefront)/ route groups — both are parenthesised, so they add no
// URL segment (e.g. /shop, not /pages/shop). Auth-gated / utility routes —
// cart, profile, order tracking, blog authoring, my-submissions — are
// intentionally left out.
const STATIC_PATHS: { path: string; priority: number; freq: ChangeFreq }[] = [
  { path: "/", priority: 1, freq: "daily" },
  { path: "/shop", priority: 0.9, freq: "daily" },
  { path: "/blogs", priority: 0.7, freq: "weekly" },
  { path: "/gift-packs", priority: 0.7, freq: "weekly" },
  { path: "/our-story", priority: 0.6, freq: "monthly" },
  { path: "/ingredients", priority: 0.6, freq: "monthly" },
  { path: "/process", priority: 0.5, freq: "monthly" },
  { path: "/sustainability", priority: 0.5, freq: "monthly" },
  { path: "/find-us", priority: 0.5, freq: "monthly" },
  { path: "/wholesale", priority: 0.5, freq: "monthly" },
  { path: "/contact", priority: 0.5, freq: "monthly" },
  { path: "/enquiries", priority: 0.4, freq: "monthly" },
  { path: "/faqs", priority: 0.4, freq: "monthly" },
  { path: "/careers", priority: 0.3, freq: "monthly" },
  { path: "/shipping", priority: 0.3, freq: "yearly" },
  { path: "/returns", priority: 0.3, freq: "yearly" },
  { path: "/refund-policy", priority: 0.3, freq: "yearly" },
  { path: "/privacy-policy", priority: 0.3, freq: "yearly" },
  { path: "/terms", priority: 0.3, freq: "yearly" },
  { path: "/cookie-policy", priority: 0.3, freq: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({
    url: `${SITE_URL}${p.path === "/" ? "" : p.path}`,
    lastModified: now,
    changeFrequency: p.freq,
    priority: p.priority,
  }));

  // Dynamic product + blog detail pages. A failed DB read must never break the
  // sitemap, so fall back to just the static set.
  // SITE_URL is WholeSip's canonical origin, so this sitemap is scoped to the
  // WholeSip store. Per-store sitemaps (resolved by host) come in a later phase.
  const [products, blogs] = await Promise.all([
    getPublishedProducts(WHOLESIP_STORE_ID).catch(() => []),
    getPublishedBlogCards(WHOLESIP_STORE_ID).catch(() => []),
  ]);

  const productEntries: MetadataRoute.Sitemap = (products as { slug: string }[])
    .filter((p) => p.slug)
    .map((p) => ({
      url: `${SITE_URL}/shop/${p.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  const blogEntries: MetadataRoute.Sitemap = (
    blogs as { slug: string; published_at: string | null }[]
  )
    .filter((b) => b.slug)
    .map((b) => ({
      url: `${SITE_URL}/blogs/${b.slug}`,
      lastModified: b.published_at ? new Date(b.published_at) : now,
      changeFrequency: "monthly",
      priority: 0.6,
    }));

  return [...staticEntries, ...productEntries, ...blogEntries];
}
