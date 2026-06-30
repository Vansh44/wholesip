import { getCurrentStore } from "@/lib/store/resolve";

// A store's public brand identity. Stored under stores.settings.brand (jsonb)
// and edited from the dashboard. Falls back to sensible defaults so a brand-new
// store (with empty settings) still shows its name.
export interface StoreBrand {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  tagline: string | null;
}

export const DEFAULT_PRIMARY = "#1f7a5a";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

// Resolve a brand object from a store's settings, applying defaults.
export function brandFromSettings(
  settings: Record<string, unknown> | null | undefined,
  fallbackName: string,
): StoreBrand {
  const b = ((settings?.brand as Record<string, unknown>) ?? {}) as Record<
    string,
    unknown
  >;
  return {
    name: str(b.name) ?? fallbackName,
    logoUrl: str(b.logoUrl),
    primaryColor: str(b.primaryColor) ?? DEFAULT_PRIMARY,
    tagline: str(b.tagline),
  };
}

// The brand for the CURRENT request's store (resolved from host).
export async function getStoreBrand(): Promise<StoreBrand> {
  const store = await getCurrentStore();
  return brandFromSettings(store.settings, store.name);
}
