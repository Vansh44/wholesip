// ---------------------------------------------------------------------------
// Theme META — the client-safe catalog for the signup template picker.
// Deliberately split from the full definitions (lib/themes/definitions/*),
// which embed up-to-64KB custom_code strings and sample data: the signup page
// is a client component and must never bundle those. Server code resolves the
// full package via lib/themes/index.ts getThemeDefinition().
// ---------------------------------------------------------------------------

export type ThemeCategory = "general" | "food" | "fashion";

export interface ThemeMeta {
  id: string;
  name: string;
  description: string;
  category: ThemeCategory;
  /** Plan gate for the picker (undefined = every plan). Signup provisions
   *  plan "free", so gated themes render locked with an upsell note. */
  minPlan?: "starter" | "pro";
  /** Bundled preview image (public/ path). */
  previewImage: string;
  /** The live demo store's slug — Preview opens https://{demoSlug}.{root}. */
  demoSlug: string;
}

export const THEME_CATEGORIES: { id: ThemeCategory | "all"; label: string }[] =
  [
    { id: "all", label: "All" },
    { id: "general", label: "General & Grocery" },
    { id: "food", label: "Food & Beverages" },
    { id: "fashion", label: "Fashion & Lifestyle" },
  ];

export const THEME_META: ThemeMeta[] = [
  {
    id: "basket",
    name: "Basket",
    description:
      "A bright grocery-market theme — solid search header, category circles, offer tiles and quick-add product cards.",
    category: "food",
    previewImage: "/themes/basket/preview.webp",
    demoSlug: "demo-basket",
  },
];

export const DEFAULT_THEME_ID = "basket";

export function isThemeId(id: unknown): id is string {
  return typeof id === "string" && THEME_META.some((t) => t.id === id);
}
