import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import {
  getPublishedProducts,
  getPublishedBlogCards,
} from "@/lib/storefront/queries";

// Regenerate hourly; the underlying product/blog reads are themselves cached
// and invalidated on dashboard edits.
export const revalidate = 3600;

type ChangeFreq = MetadataRoute.Sitemap[number]["changeFrequency"];

// Public, indexable content pages. Storefront URLs live under /pages/* (the
// homepage is "/"). Auth-gated / utility routes — cart, profile, order
// tracking, blog authoring, my-submissions — are intentionally left out.
const STATIC_PATHS: { path: string; priority: number; freq: ChangeFreq }[] = [
  { path: "/", priority: 1, freq: "daily" },
  { path: "/pages/shop", priority: 0.9, freq: "daily" },
  { path: "/pages/blogs", priority: 0.7, freq: "weekly" },
  { path: "/pages/gift-packs", priority: 0.7, freq: "weekly" },
  { path: "/pages/our-story", priority: 0.6, freq: "monthly" },
  { path: "/pages/ingredients", priority: 0.6, freq: "monthly" },
  { path: "/pages/process", priority: 0.5, freq: "monthly" },
  { path: "/pages/sustainability", priority: 0.5, freq: "monthly" },
  { path: "/pages/find-us", priority: 0.5, freq: "monthly" },
  { path: "/pages/wholesale", priority: 0.5, freq: "monthly" },
  { path: "/pages/contact", priority: 0.5, freq: "monthly" },
  { path: "/pages/enquiries", priority: 0.4, freq: "monthly" },
  { path: "/pages/faqs", priority: 0.4, freq: "monthly" },
  { path: "/pages/careers", priority: 0.3, freq: "monthly" },
  { path: "/pages/shipping", priority: 0.3, freq: "yearly" },
  { path: "/pages/returns", priority: 0.3, freq: "yearly" },
  { path: "/pages/refund-policy", priority: 0.3, freq: "yearly" },
  { path: "/pages/privacy-policy", priority: 0.3, freq: "yearly" },
  { path: "/pages/terms", priority: 0.3, freq: "yearly" },
  { path: "/pages/cookie-policy", priority: 0.3, freq: "yearly" },
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
  const [products, blogs] = await Promise.all([
    getPublishedProducts().catch(() => []),
    getPublishedBlogCards().catch(() => []),
  ]);

  const productEntries: MetadataRoute.Sitemap = (products as { slug: string }[])
    .filter((p) => p.slug)
    .map((p) => ({
      url: `${SITE_URL}/pages/shop/${p.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  const blogEntries: MetadataRoute.Sitemap = (
    blogs as { slug: string; published_at: string | null }[]
  )
    .filter((b) => b.slug)
    .map((b) => ({
      url: `${SITE_URL}/pages/blogs/${b.slug}`,
      lastModified: b.published_at ? new Date(b.published_at) : now,
      changeFrequency: "monthly",
      priority: 0.6,
    }));

  return [...staticEntries, ...productEntries, ...blogEntries];
}
