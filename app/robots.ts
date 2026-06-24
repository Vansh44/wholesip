import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
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
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
