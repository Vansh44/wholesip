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
  | "featured_products"
  | "shop_by_category"
  | "promo_banner"
  | "latest_blogs"
  | "rich_text"
  | "custom_code";

export const HOMEPAGE_SECTION_TYPES: HomepageSectionType[] = [
  "featured_products",
  "shop_by_category",
  "promo_banner",
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
  | FeaturedProductsConfig
  | ShopByCategoryConfig
  | PromoBannerConfig
  | LatestBlogsConfig
  | RichTextConfig
  | CustomCodeConfig;

// Discriminated union pairing a type with its config (handy for renderers).
export type HomepageSectionConfig =
  | { type: "featured_products"; config: FeaturedProductsConfig }
  | { type: "shop_by_category"; config: ShopByCategoryConfig }
  | { type: "promo_banner"; config: PromoBannerConfig }
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
  featured_products: FeaturedProductsConfig;
  shop_by_category: ShopByCategoryConfig;
  promo_banner: PromoBannerConfig;
  latest_blogs: LatestBlogsConfig;
  rich_text: RichTextConfig;
  custom_code: CustomCodeConfig;
} = {
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

/**
 * Validate + normalise a section config for its type. Returns a CLEAN config
 * object (irrelevant keys dropped) on success, or an { error } string. The
 * storefront and editor trust whatever this stores.
 */
export function validateConfig(
  type: HomepageSectionType,
  raw: unknown,
): { config: AnySectionConfig } | { error: string } {
  if (!HOMEPAGE_SECTION_TYPES.includes(type)) {
    return { error: "Unknown section type." };
  }
  const input = (raw ?? {}) as Record<string, unknown>;

  if (type === "featured_products") {
    const source =
      input.source === "manual" || input.source === "category"
        ? input.source
        : "featured";
    if (source === "manual" && strArray(input.product_ids).length === 0) {
      return { error: "Pick at least one product." };
    }
    if (source === "category" && !str(input.category_id)) {
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
    if (source === "selected" && strArray(input.category_ids).length === 0) {
      return { error: "Pick at least one category." };
    }
    const config: ShopByCategoryConfig = {
      heading: str(input.heading),
      subheading: str(input.subheading),
      source,
      category_ids: source === "selected" ? strArray(input.category_ids) : [],
      layout: input.layout === "scroll" ? "scroll" : "grid",
    };
    return { config };
  }

  if (type === "latest_blogs") {
    const source =
      input.source === "manual" || input.source === "featured"
        ? input.source
        : "latest";
    if (source === "manual" && strArray(input.blog_ids).length === 0) {
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
    if (!html.trim()) {
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
    if (!html.trim() && !css.trim() && !js.trim()) {
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
  if (!str(input.image_url) && !str(input.heading)) {
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
