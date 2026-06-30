import type { MetadataRoute } from "next";
import { getStoreUrl } from "@/lib/site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await getStoreUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep the admin app, auth flows, API, and personal/utility pages out of
      // the index.
      disallow: [
        "/dashboard",
        "/auth",
        "/api",
        "/cart",
        "/profile",
        "/track-order",
        "/blogs/write",
        "/blogs/my-submissions",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
