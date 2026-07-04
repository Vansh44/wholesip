import type { MetadataRoute } from "next";
import { PLATFORM_URL } from "@/lib/site";
import { ROOT_DOMAIN } from "@/lib/store/host";
import { getCurrentStoreOrNull } from "@/lib/store/resolve";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Host-aware: a real store host advertises its own canonical origin; the
  // platform apex (storemink.com) and any unresolved host must advertise the
  // platform itself — NOT the WholeSip fallback that getStoreUrl() would return
  // here (that pointed robots/sitemap at wholesip.com on storemink.com).
  const store = await getCurrentStoreOrNull();
  const siteUrl = store
    ? `https://${store.custom_domain ?? `${store.slug}.${ROOT_DOMAIN}`}`
    : PLATFORM_URL;
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
