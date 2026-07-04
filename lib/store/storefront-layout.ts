import { getCurrentStoreOrNull } from "./resolve";
import { getThemeDefinition } from "@/lib/themes";
import { isThemeId } from "@/lib/themes/meta";
import type { ThemeLayout } from "@/lib/themes/types";

// Resolve the current host store's theme layout flags for server components
// that need to branch MARKUP (not just CSS) — the product-detail page and the
// cart, which pass `grocery` down to their client components. CSS-only
// switches use the `sm-*` root classes the (storefront) layout already emits.
//
// getCurrentStoreOrNull is unstable_cache-backed, so this dedupes with the
// layout's own store resolution within a request. Absent/unknown theme = {}
// (classic layout), so a store with no real theme is untouched.
export async function getStorefrontLayout(): Promise<ThemeLayout> {
  const store = await getCurrentStoreOrNull();
  const template = (store?.settings as Record<string, unknown> | null)
    ?.template;
  if (!isThemeId(template)) return {};
  return getThemeDefinition(template).design.layout ?? {};
}
