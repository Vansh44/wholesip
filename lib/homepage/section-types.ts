// ---------------------------------------------------------------------------
// Homepage section catalog — the single source of truth for the composable
// homepage builder. Pure module (no server imports) so it can be shared by the
// server actions (validation), the dashboard editor, and the storefront
// renderers alike — mirrors how app/dashboard/lib/permissions.ts and
// lib/pricing.ts are shared across surfaces.
//
// To add a NEW block type later (e.g. USP strip, testimonials):
//   1. add it to HomepageSectionType
//   2. add its *Config interface + a branch to HomepageSectionConfig
//   3. add an EMPTY_CONFIG default + a SECTION_TYPE_META entry
//   4. add a validate branch in app/actions/homepage-actions.ts
//   5. add an editor sub-form + a storefront renderer
// No DB migration needed — config lives in a JSONB column.
// ---------------------------------------------------------------------------

export type HomepageSectionType =
  | "hero"
  | "featured_products"
  | "shop_by_category"
  | "promo_banner"
  | "tile_grid"
  | "usp_bar"
  | "faq_accordion"
  | "latest_blogs"
  | "rich_text"
  | "custom_code";

export const HOMEPAGE_SECTION_TYPES: HomepageSectionType[] = [
  "hero",
  "featured_products",
  "shop_by_category",
  "promo_banner",
  "tile_grid",
  "usp_bar",
  "faq_accordion",
  "latest_blogs",
  "rich_text",
  "custom_code",
];

// --- Per-type config shapes ------------------------------------------------

export type FeaturedSource = "featured" | "manual" | "category";

export interface FeaturedProductsConfig {
  heading: string;
  subheading: string;
  /** How products are chosen. */
  source: FeaturedSource;
  /** Ordered product ids — used when source = "manual". */
  product_ids: string[];
  /** Category id — used when source = "category". */
  category_id: string | null;
  /** Max products to show (featured/category modes). 1–12. */
  limit: number;
}

export type CategorySource = "all" | "selected";

export interface ShopByCategoryConfig {
  heading: string;
  subheading: string;
  /** "all" active categories, or only the "selected" ids (in admin order). */
  source: CategorySource;
  category_ids: string[];
  /** Wrapped grid vs horizontal scroll row. */
  layout: "grid" | "scroll";
  /** Tile shape: circular image chips (the historical look — absent on
   *  pre-existing rows = "circles") or rounded-rect image cards. */
  display?: "circles" | "cards";
}

export type BannerAlignment = "left" | "center" | "right";
export type BannerTheme = "light" | "dark";

export interface PromoBannerConfig {
  /** The only storage-backed field — drives image cleanup on change/delete. */
  image_url: string;
  heading: string;
  subtext: string;
  cta_label: string;
  cta_href: string;
  alignment: BannerAlignment;
  theme: BannerTheme;
}

/**
 * First-class hero — replaces the custom_code hero hack. "banner" is an inset
 * rounded card on a solid colour field (grocery style), "split" is a
 * half-copy / half-image band, "minimal" is a centred statement. `background`
 * is a strict colour (rendered into an inline style attr, same rule as
 * SectionStyle.background); empty = the theme's default surface.
 */
export type HeroVariant = "banner" | "split" | "minimal";

export interface HeroConfig {
  variant: HeroVariant;
  heading: string;
  subheading: string;
  cta_label: string;
  cta_href: string;
  image_url: string;
  /** Optional floating promo pill ("51% off this week"). */
  badge_text: string;
  /** Strict colour for the hero field; "" = theme surface. */
  background: string;
  /** Text colour on that field: "dark" ink (light bg) or "light" (dark bg). */
  theme: BannerTheme;
  alignment: "left" | "center";
}

/** Icon catalog for USP items — fixed set so the renderer can map names to
 *  bundled lucide icons (never merchant-supplied markup). */
export const USP_ICONS = [
  "star",
  "badge-check",
  "truck",
  "shield",
  "leaf",
  "gift",
  "lock",
  "refresh",
  "clock",
  "heart",
  "headphones",
  "sparkles",
] as const;
export type UspIcon = (typeof USP_ICONS)[number];

export interface UspItem {
  icon: UspIcon;
  title: string;
  subtitle: string;
}

/**
 * Icon + label strip ("Free shipping · Secure checkout · Easy returns").
 * theme controls TEXT colour like promo_banner: "dark" ink text for light
 * backgrounds, "light" for dark ones (pair with style.background).
 */
export interface UspBarConfig {
  items: UspItem[];
  theme: BannerTheme;
}

/**
 * Grid of linked colour/image tiles — covers grocery offer tiles, curated
 * collection grids, gift-pack grids and 2-up mini-banner pairs. Tile
 * `background` is a strict colour (inline style attr rule).
 */
export interface TileItem {
  title: string;
  subtitle: string;
  href: string;
  image_url: string;
  background: string;
  /** Text colour on the tile: "dark" ink or "light". */
  theme: BannerTheme;
}

export interface TileGridConfig {
  heading: string;
  subheading: string;
  tiles: TileItem[];
  /** Desktop column count (wraps responsively below). */
  columns: 2 | 3 | 4;
  /** Tile height scale — sm chip-like offers, lg banner-like. */
  height: "sm" | "md" | "lg";
}

/**
 * FAQ accordion — question/answer pairs with optional category filter pills.
 * Answers are plain text (rendered as text, never HTML) so there's no sanitize
 * concern. `category` groups items under the filter pills; empty = no filter.
 */
export interface FaqItem {
  question: string;
  answer: string;
  /** Optional filter-pill group; "" = shown under "All" only. */
  category: string;
}

export interface FaqAccordionConfig {
  heading: string;
  subheading: string;
  items: FaqItem[];
  /** Show the category filter pill row (derived from item categories). */
  show_filters: boolean;
}

export type BlogSource = "latest" | "manual" | "featured";

export interface LatestBlogsConfig {
  heading: string;
  subheading: string;
  /** Newest published blogs, or hand-picked ids (in admin order). */
  source: BlogSource;
  /** Ordered blog ids — used when source = "manual". */
  blog_ids: string[];
  /** Max blogs to show (latest mode). 1–12. Manual mode shows all picked. */
  limit: number;
  /** Wrapped grid vs horizontal scroll row. */
  layout: "grid" | "scroll";
}

/**
 * Free-form rich text (TipTap-style HTML). SEO-friendly: rendered INLINE in
 * the page, so the HTML must be sanitized server-side at save time (see
 * lib/sanitize.ts — same trust model as blog content) and again at render.
 * The registry only validates shape/size; it stays pure (no sanitizer import,
 * which would bloat client bundles).
 */
export interface RichTextConfig {
  html: string;
  /** Constrain content width like the rest of the storefront, or full-bleed. */
  width: "contained" | "full";
}

/**
 * Merchant-authored HTML/CSS/JS. SECURITY: rendered ONLY inside a sandboxed
 * iframe (sandbox="allow-scripts allow-popups", srcDoc, never
 * allow-same-origin) — Supabase auth cookies are httpOnly:false and scoped to
 * .storemink.com, so inline merchant JS could hijack sessions valid on every
 * store and the platform. See custom-code-frame.tsx.
 */
export interface CustomCodeConfig {
  html: string;
  css: string;
  js: string;
  /** "auto" = iframe reports its height via postMessage; "fixed" = fixed_height px. */
  height_mode: "auto" | "fixed";
  fixed_height: number;
}

export type AnySectionConfig =
  | HeroConfig
  | FeaturedProductsConfig
  | ShopByCategoryConfig
  | PromoBannerConfig
  | TileGridConfig
  | UspBarConfig
  | FaqAccordionConfig
  | LatestBlogsConfig
  | RichTextConfig
  | CustomCodeConfig;

// Discriminated union pairing a type with its config (handy for renderers).
export type HomepageSectionConfig =
  | { type: "hero"; config: HeroConfig }
  | { type: "featured_products"; config: FeaturedProductsConfig }
  | { type: "shop_by_category"; config: ShopByCategoryConfig }
  | { type: "promo_banner"; config: PromoBannerConfig }
  | { type: "tile_grid"; config: TileGridConfig }
  | { type: "usp_bar"; config: UspBarConfig }
  | { type: "faq_accordion"; config: FaqAccordionConfig }
  | { type: "latest_blogs"; config: LatestBlogsConfig }
  | { type: "rich_text"; config: RichTextConfig }
  | { type: "custom_code"; config: CustomCodeConfig };

// The DB row shape (table: homepage_sections).
export interface HomepageSection {
  id: string;
  type: HomepageSectionType;
  sort_order: number;
  enabled: boolean;
  config: AnySectionConfig;
  created_at: string;
  updated_at: string;
}

// --- Defaults for the editor's create mode ---------------------------------

export const EMPTY_CONFIG: {
  hero: HeroConfig;
  featured_products: FeaturedProductsConfig;
  shop_by_category: ShopByCategoryConfig;
  promo_banner: PromoBannerConfig;
  tile_grid: TileGridConfig;
  usp_bar: UspBarConfig;
  faq_accordion: FaqAccordionConfig;
  latest_blogs: LatestBlogsConfig;
  rich_text: RichTextConfig;
  custom_code: CustomCodeConfig;
} = {
  hero: {
    variant: "banner",
    heading: "Welcome to our store",
    subheading: "",
    cta_label: "Shop now",
    cta_href: "/shop",
    image_url: "",
    badge_text: "",
    background: "",
    theme: "dark",
    alignment: "left",
  },
  featured_products: {
    heading: "Bestsellers",
    subheading: "",
    source: "featured",
    product_ids: [],
    category_id: null,
    limit: 8,
  },
  shop_by_category: {
    heading: "Shop by Category",
    subheading: "",
    source: "all",
    category_ids: [],
    layout: "grid",
    display: "circles",
  },
  promo_banner: {
    image_url: "",
    heading: "",
    subtext: "",
    cta_label: "",
    cta_href: "",
    alignment: "left",
    theme: "light",
  },
  tile_grid: {
    heading: "",
    subheading: "",
    tiles: [],
    columns: 4,
    height: "sm",
  },
  usp_bar: {
    items: [
      { icon: "truck", title: "Fast delivery", subtitle: "" },
      { icon: "shield", title: "Secure checkout", subtitle: "" },
      { icon: "refresh", title: "Easy returns", subtitle: "" },
    ],
    theme: "dark",
  },
  faq_accordion: {
    heading: "Frequently asked questions",
    subheading: "",
    items: [],
    show_filters: false,
  },
  latest_blogs: {
    heading: "From the Journal",
    subheading: "",
    source: "latest",
    blog_ids: [],
    limit: 3,
    layout: "grid",
  },
  rich_text: {
    html: "",
    width: "contained",
  },
  custom_code: {
    html: "",
    css: "",
    js: "",
    height_mode: "auto",
    fixed_height: 320,
  },
};

// --- Display metadata (type chooser + row summaries) -----------------------

export interface SectionTypeMeta {
  label: string;
  description: string;
  /** lucide icon name, resolved by the dashboard view. */
  icon: string;
}

export const SECTION_TYPE_META: Record<HomepageSectionType, SectionTypeMeta> = {
  hero: {
    label: "Hero",
    description:
      "The big opening block — headline, button and image on a colour field.",
    icon: "hero",
  },
  featured_products: {
    label: "Featured Products",
    description:
      "A row of product cards (featured, hand-picked, or a category).",
    icon: "products",
  },
  shop_by_category: {
    label: "Shop by Category",
    description: "Tiles linking to your categories.",
    icon: "categories",
  },
  promo_banner: {
    label: "Promo Banner",
    description: "A full-width image banner with heading, text and a button.",
    icon: "marketing",
  },
  tile_grid: {
    label: "Tile Grid",
    description:
      "Linked colour or image tiles — offers, collections, mini banners.",
    icon: "tiles",
  },
  usp_bar: {
    label: "USP Bar",
    description:
      "A row of icon + label promises (delivery, returns, quality…).",
    icon: "usp",
  },
  faq_accordion: {
    label: "FAQ Accordion",
    description: "Expandable question/answer list with optional filters.",
    icon: "faq",
  },
  latest_blogs: {
    label: "Blog Posts",
    description: "Latest or hand-picked blog posts.",
    icon: "blogs",
  },
  rich_text: {
    label: "Rich Text",
    description: "Free-form formatted text — headings, paragraphs, images.",
    icon: "rich_text",
  },
  custom_code: {
    label: "Custom Code",
    description:
      "Your own HTML, CSS and JavaScript, rendered in a safe sandbox.",
    icon: "custom_code",
  },
};

export const LIMIT_MIN = 1;
export const LIMIT_MAX = 12;

// Item caps for list-shaped sections.
export const MAX_USP_ITEMS = 6;
export const MAX_TILES = 8;
export const MAX_FAQ_ITEMS = 30;
export const FAQ_ANSWER_MAX_CHARS = 2000;

// Size caps for merchant-authored content (per field, in characters).
export const CODE_MAX_CHARS = 64 * 1024; // custom_code html/css/js each
export const RICH_TEXT_MAX_CHARS = 128 * 1024;

// custom_code fixed-height bounds (px) — also the clamp for auto-height
// postMessage values in custom-code-frame.tsx.
export const CODE_HEIGHT_MIN = 40;
export const CODE_HEIGHT_MAX = 4000;

/** Clamp a custom_code fixed height into the allowed range. */
export function clampCodeHeight(n: number): number {
  if (!Number.isFinite(n)) return EMPTY_CONFIG.custom_code.fixed_height;
  return Math.min(CODE_HEIGHT_MAX, Math.max(CODE_HEIGHT_MIN, Math.trunc(n)));
}

/** Clamp a featured-products limit into the allowed range. */
export function clampLimit(n: number): number {
  if (!Number.isFinite(n)) return EMPTY_CONFIG.featured_products.limit;
  return Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, Math.trunc(n)));
}

// --- Shared per-section style (applied by SectionShell) ---------------------
// Lives BESIDE `config` on a page section item ({id, type, enabled, config,
// style?}) so validateConfig's per-type branches never have to know about it.
// Absent style = exactly today's DOM (backward compatible with stored rows).

export type SectionPaddingY = "none" | "sm" | "md" | "lg";

export interface SectionStyle {
  /** Strict color only (hex/rgb/hsl) — rendered into an inline style attr, so
   *  url(...) and any other CSS syntax must be impossible. */
  background?: string;
  /** Extra vertical padding inside the section, on top of the page gap. */
  padding_y?: SectionPaddingY;
  /** "full" = edge-to-edge (cancels the .home-section side gutter). */
  width?: "contained" | "full";
  /** Slug-shaped element id for in-page anchor links (#story). */
  anchor?: string;
}

const COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\(\s*[\d.,%\s/-]+\s*\))$/i;
const ANCHOR_RE = /^[a-z][a-z0-9-]{0,50}$/;
const PADDING_VALUES: SectionPaddingY[] = ["none", "sm", "md", "lg"];

/**
 * Validate + normalise a section's shared style. Returns undefined when
 * nothing valid remains, so the stored JSON omits the key entirely.
 */
export function validateSectionStyle(raw: unknown): SectionStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Record<string, unknown>;
  const out: SectionStyle = {};

  const background =
    typeof input.background === "string" ? input.background.trim() : "";
  if (background && COLOR_RE.test(background)) out.background = background;

  if (PADDING_VALUES.includes(input.padding_y as SectionPaddingY)) {
    out.padding_y = input.padding_y as SectionPaddingY;
  }

  if (input.width === "full" || input.width === "contained") {
    out.width = input.width;
  }

  const anchor =
    typeof input.anchor === "string" ? input.anchor.trim().toLowerCase() : "";
  if (anchor && ANCHOR_RE.test(anchor)) out.anchor = anchor;

  return Object.keys(out).length > 0 ? out : undefined;
}

// --- Config validation / normalisation -------------------------------------
// Pure (no server imports) so it lives here rather than in the "use server"
// actions file — a "use server" module may only export async functions.

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

// Block obviously-unsafe CTA links; allow relative paths and http(s).
function safeHref(v: unknown): string {
  const s = str(v);
  if (!s) return "";
  if (/^\s*(javascript|data|vbscript):/i.test(s)) return "";
  return s;
}

// Strict colour or "" — these values are rendered into inline style attrs
// (same rule as SectionStyle.background), so url(...) etc. must be impossible.
function safeColor(v: unknown): string {
  const s = str(v);
  return s && COLOR_RE.test(s) ? s : "";
}

const textTheme = (v: unknown, fallback: BannerTheme): BannerTheme =>
  v === "light" || v === "dark" ? v : fallback;

/**
 * "publish" (default) enforces COMPLETENESS ("Pick at least one product") on
 * top of safety normalisation — used for publishing and theme seeding.
 * "draft" skips completeness so the builder's autosave never fails mid-edit
 * (renderers already render nothing for incomplete sections); all SAFETY
 * rules (safeHref, size caps, clamps, key dropping) apply in both modes.
 */
export type ValidateMode = "draft" | "publish";

/**
 * Validate + normalise a section config for its type. Returns a CLEAN config
 * object (irrelevant keys dropped) on success, or an { error } string. The
 * storefront and editor trust whatever this stores.
 */
export function validateConfig(
  type: HomepageSectionType,
  raw: unknown,
  mode: ValidateMode = "publish",
): { config: AnySectionConfig } | { error: string } {
  const strict = mode === "publish";
  if (!HOMEPAGE_SECTION_TYPES.includes(type)) {
    return { error: "Unknown section type." };
  }
  const input = (raw ?? {}) as Record<string, unknown>;

  if (type === "hero") {
    const heading = str(input.heading);
    const image_url = str(input.image_url);
    if (strict && !heading && !image_url) {
      return { error: "Add a headline or an image for the hero." };
    }
    const config: HeroConfig = {
      variant:
        input.variant === "split" || input.variant === "minimal"
          ? input.variant
          : "banner",
      heading,
      subheading: str(input.subheading),
      cta_label: str(input.cta_label),
      cta_href: safeHref(input.cta_href),
      image_url,
      badge_text: str(input.badge_text),
      background: safeColor(input.background),
      theme: textTheme(input.theme, "dark"),
      alignment: input.alignment === "center" ? "center" : "left",
    };
    return { config };
  }

  if (type === "usp_bar") {
    const rawItems = Array.isArray(input.items) ? input.items : [];
    if (rawItems.length > MAX_USP_ITEMS) {
      return { error: `At most ${MAX_USP_ITEMS} items.` };
    }
    const items: UspItem[] = [];
    for (const rawItem of rawItems) {
      const it = (rawItem ?? {}) as Record<string, unknown>;
      const title = str(it.title).slice(0, 80);
      const subtitle = str(it.subtitle).slice(0, 120);
      if (!title && !subtitle) continue; // drop empty rows silently
      items.push({
        icon: USP_ICONS.includes(it.icon as UspIcon)
          ? (it.icon as UspIcon)
          : "star",
        title,
        subtitle,
      });
    }
    if (strict && items.length === 0) {
      return { error: "Add at least one item." };
    }
    const config: UspBarConfig = {
      items,
      theme: textTheme(input.theme, "dark"),
    };
    return { config };
  }

  if (type === "tile_grid") {
    const rawTiles = Array.isArray(input.tiles) ? input.tiles : [];
    if (rawTiles.length > MAX_TILES) {
      return { error: `At most ${MAX_TILES} tiles.` };
    }
    const tiles: TileItem[] = [];
    for (const rawTile of rawTiles) {
      const t = (rawTile ?? {}) as Record<string, unknown>;
      const tile: TileItem = {
        title: str(t.title).slice(0, 80),
        subtitle: str(t.subtitle).slice(0, 160),
        href: safeHref(t.href),
        image_url: str(t.image_url),
        background: safeColor(t.background),
        theme: textTheme(t.theme, "dark"),
      };
      if (!tile.title && !tile.image_url && !tile.subtitle) continue;
      tiles.push(tile);
    }
    if (strict && tiles.length === 0) {
      return { error: "Add at least one tile." };
    }
    const columns = Number(input.columns);
    const config: TileGridConfig = {
      heading: str(input.heading),
      subheading: str(input.subheading),
      tiles,
      columns: columns === 2 || columns === 3 ? columns : 4,
      height:
        input.height === "md" || input.height === "lg" ? input.height : "sm",
    };
    return { config };
  }

  if (type === "faq_accordion") {
    const rawItems = Array.isArray(input.items) ? input.items : [];
    if (rawItems.length > MAX_FAQ_ITEMS) {
      return { error: `At most ${MAX_FAQ_ITEMS} questions.` };
    }
    const items: FaqItem[] = [];
    for (const rawItem of rawItems) {
      const it = (rawItem ?? {}) as Record<string, unknown>;
      const question = str(it.question).slice(0, 200);
      const answer = str(it.answer).slice(0, FAQ_ANSWER_MAX_CHARS);
      if (!question && !answer) continue; // drop empty rows
      items.push({
        question,
        answer,
        category: str(it.category).slice(0, 40),
      });
    }
    if (strict && items.length === 0) {
      return { error: "Add at least one question." };
    }
    const config: FaqAccordionConfig = {
      heading: str(input.heading),
      subheading: str(input.subheading),
      items,
      show_filters: input.show_filters === true,
    };
    return { config };
  }

  if (type === "featured_products") {
    const source =
      input.source === "manual" || input.source === "category"
        ? input.source
        : "featured";
    if (
      strict &&
      source === "manual" &&
      strArray(input.product_ids).length === 0
    ) {
      return { error: "Pick at least one product." };
    }
    if (strict && source === "category" && !str(input.category_id)) {
      return { error: "Choose a category." };
    }
    const config: FeaturedProductsConfig = {
      heading: str(input.heading),
      subheading: str(input.subheading),
      source,
      product_ids: source === "manual" ? strArray(input.product_ids) : [],
      category_id:
        source === "category" ? str(input.category_id) || null : null,
      limit: clampLimit(Number(input.limit)),
    };
    return { config };
  }

  if (type === "shop_by_category") {
    const source = input.source === "selected" ? "selected" : "all";
    if (
      strict &&
      source === "selected" &&
      strArray(input.category_ids).length === 0
    ) {
      return { error: "Pick at least one category." };
    }
    const config: ShopByCategoryConfig = {
      heading: str(input.heading),
      subheading: str(input.subheading),
      source,
      category_ids: source === "selected" ? strArray(input.category_ids) : [],
      layout: input.layout === "scroll" ? "scroll" : "grid",
      display: input.display === "cards" ? "cards" : "circles",
    };
    return { config };
  }

  if (type === "latest_blogs") {
    const source =
      input.source === "manual" || input.source === "featured"
        ? input.source
        : "latest";
    if (
      strict &&
      source === "manual" &&
      strArray(input.blog_ids).length === 0
    ) {
      return { error: "Pick at least one blog post." };
    }
    const config: LatestBlogsConfig = {
      heading: str(input.heading),
      subheading: str(input.subheading),
      source,
      blog_ids: source === "manual" ? strArray(input.blog_ids) : [],
      limit: clampLimit(Number(input.limit)),
      layout: input.layout === "scroll" ? "scroll" : "grid",
    };
    return { config };
  }

  if (type === "rich_text") {
    // Raw string only — sanitized server-side at save (actions) and at render.
    const html = typeof input.html === "string" ? input.html : "";
    if (strict && !html.trim()) {
      return { error: "Add some content first." };
    }
    if (html.length > RICH_TEXT_MAX_CHARS) {
      return { error: "Content is too large (128 KB max)." };
    }
    const config: RichTextConfig = {
      html,
      width: input.width === "full" ? "full" : "contained",
    };
    return { config };
  }

  if (type === "custom_code") {
    const code = (v: unknown): string => (typeof v === "string" ? v : "");
    const html = code(input.html);
    const css = code(input.css);
    const js = code(input.js);
    if (strict && !html.trim() && !css.trim() && !js.trim()) {
      return { error: "Add some HTML, CSS or JavaScript first." };
    }
    for (const [field, value] of [
      ["HTML", html],
      ["CSS", css],
      ["JavaScript", js],
    ] as const) {
      if (value.length > CODE_MAX_CHARS) {
        return { error: `${field} is too large (64 KB max).` };
      }
    }
    const config: CustomCodeConfig = {
      html,
      css,
      js,
      height_mode: input.height_mode === "fixed" ? "fixed" : "auto",
      fixed_height: clampCodeHeight(Number(input.fixed_height)),
    };
    return { config };
  }

  // promo_banner
  if (strict && !str(input.image_url) && !str(input.heading)) {
    return { error: "Add an image or a heading for the banner." };
  }
  const config: PromoBannerConfig = {
    image_url: str(input.image_url),
    heading: str(input.heading),
    subtext: str(input.subtext),
    cta_label: str(input.cta_label),
    cta_href: safeHref(input.cta_href),
    alignment:
      input.alignment === "center" || input.alignment === "right"
        ? input.alignment
        : "left",
    theme: input.theme === "dark" ? "dark" : "light",
  };
  return { config };
}

/**
 * A short, human summary of a section for the dashboard list rows, e.g.
 * "Bestsellers · 8 products" or "Promo · Summer Sale".
 */
export function summarizeSection(section: {
  type: HomepageSectionType;
  config: AnySectionConfig;
}): string {
  const c = section.config;
  switch (section.type) {
    case "hero": {
      const h = c as HeroConfig;
      return `Hero · ${h.heading?.trim() || "(no headline)"} · ${h.variant}`;
    }
    case "usp_bar": {
      const u = c as UspBarConfig;
      const first = u.items[0]?.title?.trim();
      return `USP bar · ${u.items.length} item${u.items.length === 1 ? "" : "s"}${first ? ` · ${first}…` : ""}`;
    }
    case "tile_grid": {
      const t = c as TileGridConfig;
      const head = t.heading?.trim();
      return `Tiles · ${t.tiles.length} tile${t.tiles.length === 1 ? "" : "s"}${head ? ` · ${head}` : ""}`;
    }
    case "faq_accordion": {
      const f = c as FaqAccordionConfig;
      return `FAQ · ${f.items.length} question${f.items.length === 1 ? "" : "s"}`;
    }
    case "featured_products": {
      const f = c as FeaturedProductsConfig;
      const head = f.heading?.trim() || "Featured products";
      if (f.source === "manual")
        return `${head} · ${f.product_ids.length} hand-picked`;
      if (f.source === "category") return `${head} · by category`;
      return `${head} · featured · up to ${f.limit}`;
    }
    case "shop_by_category": {
      const s = c as ShopByCategoryConfig;
      const head = s.heading?.trim() || "Shop by category";
      return s.source === "all"
        ? `${head} · all categories`
        : `${head} · ${s.category_ids.length} selected`;
    }
    case "promo_banner": {
      const b = c as PromoBannerConfig;
      return `Promo · ${b.heading?.trim() || "(no heading)"}`;
    }
    case "latest_blogs": {
      const b = c as LatestBlogsConfig;
      const head = b.heading?.trim() || "Blog posts";
      if (b.source === "manual")
        return `${head} · ${b.blog_ids.length} hand-picked`;
      if (b.source === "featured")
        return `${head} · featured · up to ${b.limit}`;
      return `${head} · latest · up to ${b.limit}`;
    }
    case "rich_text": {
      const r = c as RichTextConfig;
      // First few words of the text content, tags stripped.
      const text = r.html
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return `Rich text · ${text ? text.slice(0, 40) + (text.length > 40 ? "…" : "") : "(empty)"}`;
    }
    case "custom_code": {
      const cc = c as CustomCodeConfig;
      const parts = [
        cc.html.trim() && "HTML",
        cc.css.trim() && "CSS",
        cc.js.trim() && "JS",
      ].filter(Boolean);
      return `Custom code · ${parts.join(" + ") || "(empty)"}`;
    }
    default:
      return section.type;
  }
}
