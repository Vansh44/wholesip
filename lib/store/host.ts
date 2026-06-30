// Pure host classification — no server/Node imports, so it's safe to use from
// the edge proxy (proxy.ts) as well as server components. The DB-backed
// resolution lives in ./resolve.ts (which re-exports parseHost from here).

// The platform's apex domain. Subdomains of it map to stores.
export const ROOT_DOMAIN = (
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "storemink.com"
).toLowerCase();

export type HostKind =
  | { type: "store-subdomain"; slug: string }
  | { type: "custom-domain"; domain: string }
  | { type: "platform" };

// Map a raw Host header to what it refers to: a store subdomain, a merchant's
// custom domain, or the Storemink platform itself (apex / app / local dev / preview).
export function parseHost(host: string | null | undefined): HostKind {
  if (!host) return { type: "platform" };
  const hostname = host.split(":")[0].trim().toLowerCase();
  if (!hostname) return { type: "platform" };

  // Local dev + Vercel previews render the platform, except `{slug}.localhost`,
  // which lets us test a store's storefront locally.
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return { type: "platform" };
  }
  if (hostname.endsWith(".localhost")) {
    const slug = hostname.slice(0, -".localhost".length);
    return slug ? { type: "store-subdomain", slug } : { type: "platform" };
  }
  if (hostname.endsWith(".vercel.app")) return { type: "platform" };

  // The apex and reserved platform hosts are not stores.
  if (
    hostname === ROOT_DOMAIN ||
    hostname === `www.${ROOT_DOMAIN}` ||
    hostname === `app.${ROOT_DOMAIN}`
  ) {
    return { type: "platform" };
  }

  // A subdomain of the root domain → store slug (everything before `.root`).
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    const slug = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
    return slug ? { type: "store-subdomain", slug } : { type: "platform" };
  }

  // Anything else is a merchant's own (custom) domain.
  return { type: "custom-domain", domain: hostname };
}

// True when the host is the Storemink platform (landing / login / signup), not a store.
export function isPlatformHost(host: string | null | undefined): boolean {
  return parseHost(host).type === "platform";
}

// Cookie `Domain` so a Supabase session is shared across ALL *.storemink.com
// subdomains (platform + every store) — lets an owner who signs up on
// storemink.com land logged-in on their {slug}.storemink.com dashboard. Returns
// undefined for localhost, previews, and custom domains (e.g. wholesip.com),
// which stay host-only and are therefore unaffected.
export function cookieDomainForHost(
  host: string | null | undefined,
): string | undefined {
  if (!host) return undefined;
  const hostname = host.split(":")[0].trim().toLowerCase();
  if (hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    return `.${ROOT_DOMAIN}`;
  }
  return undefined;
}

// The `help.{root}` subdomain — the help centre.
export function isHelpHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0].trim().toLowerCase();
  return hostname === `help.${ROOT_DOMAIN}` || hostname === "help.localhost";
}
