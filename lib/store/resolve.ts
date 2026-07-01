import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { parseHost } from "@/lib/store/host";

// Re-exported so existing importers (and resolve.test.ts) keep working.
export { parseHost, type HostKind } from "@/lib/store/host";

// ---------------------------------------------------------------------------
// Tenant resolution.
//
// Every request belongs to exactly one store. We resolve it from the request's
// Host header:
//   acme.storemink.com        -> store with slug "acme"
//   shop.acme.com         -> store whose custom_domain = "shop.acme.com"
//   storemink.com / app.*     -> the platform itself (no store)
//   localhost / *.vercel  -> the platform (dev/preview)
//
// During the single-tenant period (only WholeSip exists, served at the root /
// localhost), `getCurrentStore()` falls back to WholeSip so the site renders
// exactly as it does today. Once subdomains go live, the same code resolves
// real stores with no further change.
// ---------------------------------------------------------------------------

export interface Store {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan: string;
  custom_domain: string | null;
  settings: Record<string, unknown>;
}

// WholeSip — Store #1. Matches the fixed id seeded in multitenant_01_schema.sql.
// Used as the single-tenant fallback until real subdomains are live.
export const WHOLESIP_STORE_ID = "a0000000-0000-4000-8000-000000000001";

// Cache tag for store lookups — call `revalidateTag(STORE_TAG)` after a store
// is created or its settings/domain change.
export const STORE_TAG = "stores";

const STORE_COLUMNS = "id, slug, name, status, plan, custom_domain, settings";

// Cached store lookup by Host header. Returns null for platform hosts and for
// hosts that don't map to an active store. Tolerates DB errors (returns null).
const lookupStoreByHost = unstable_cache(
  async (host: string): Promise<Store | null> => {
    const kind = parseHost(host);
    if (kind.type === "platform") return null;

    const supabase = createPublicClient();
    const query = supabase
      .from("stores")
      .select(STORE_COLUMNS)
      .eq("status", "active")
      .limit(1);

    const { data, error } =
      kind.type === "store-subdomain"
        ? await query.eq("slug", kind.slug).maybeSingle()
        : await query.eq("custom_domain", kind.domain).maybeSingle();

    if (error) {
      console.error("lookupStoreByHost:", error.message);
      return null;
    }
    return (data as Store | null) ?? null;
  },
  ["store-by-host"],
  { tags: [STORE_TAG], revalidate: 300 },
);

// Cached store lookup by id — used for the WholeSip fallback.
export const lookupStoreById = unstable_cache(
  async (id: string): Promise<Store | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("stores")
      .select(STORE_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("lookupStoreById:", error.message);
      return null;
    }
    return (data as Store | null) ?? null;
  },
  ["store-by-id"],
  { tags: [STORE_TAG], revalidate: 300 },
);

// Resolve the store for the *current* request. Never returns null: platform /
// unknown hosts fall back to WholeSip so the site keeps rendering during the
// single-tenant period.
export async function getCurrentStore(): Promise<Store> {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") || headersList.get("host");
  const resolved = await lookupStoreByHost(host ?? "");
  if (resolved) return resolved;

  const fallback = await lookupStoreById(WHOLESIP_STORE_ID);
  if (fallback) return fallback;

  // Last-resort synthetic store so callers never crash even if the row is
  // somehow missing (e.g. mid-migration). store_id still resolves correctly.
  return {
    id: WHOLESIP_STORE_ID,
    slug: "wholesip",
    name: "WholeSip",
    status: "active",
    plan: "pro",
    custom_domain: null,
    settings: {},
  };
}

// Convenience: just the current store's id (the value threaded into queries).
export async function getCurrentStoreId(): Promise<string> {
  return (await getCurrentStore()).id;
}
