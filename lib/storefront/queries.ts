import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { TAGS } from "@/lib/storefront/tags";
import type { PageSectionItem } from "@/lib/sections/registry";
import { normalizeMenus, type StoreMenus } from "@/lib/menus";

// ---------------------------------------------------------------------------
// Cached PUBLIC storefront reads.
//
// These wrap the cookie-free anon client (lib/supabase/public.ts) in
// `unstable_cache` so the storefront's hot (pages) (home, shop, blog index,
// product detail) no longer hit Postgres on every request — the previous model
// re-ran every query per visit because the (pages) were `force-dynamic`.
//
// Freshness: each entry carries a coarse tag and a `revalidate` fallback. The
// dashboard write actions call `revalidateTag(...)` (see app/actions/*) so edits
// show up near-instantly; the time-based `revalidate` is just a safety net.
//
// Reads tolerate a missing table / transient error by returning empty (matching
// the storefront's existing `?? []` behavior) so a cold deploy never crashes.
//
// Multi-tenant: every function takes a required `storeId` and filters on it.
// `unstable_cache` folds the function arguments into the cache key, so each
// store gets its own cache entry automatically — one store can never serve
// another's cached rows. Callers resolve the id via getCurrentStore() (host).
// ---------------------------------------------------------------------------

// 5 minutes. Edits propagate immediately via revalidateTag; this only bounds
// how stale things can get if a tag invalidation is ever missed.
const REVALIDATE = 300;

export interface ProductCardRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  base_price: number;
  selling_price: number;
  image_url: string | null;
  status: string;
  featured: boolean;
  sort_order: number;
  card_color: string | null;
  track_inventory: boolean;
  stock: number;
  low_stock_threshold: number | null;
  allow_backorder: boolean;
  /** Resolved category name (flattened from the joined categories row). */
  category: string | null;
  variants: {
    base_price: number;
    selling_price: number;
    special_price: number | null;
    sort_order: number;
    track_inventory: boolean;
    stock: number;
    low_stock_threshold: number | null;
    allow_backorder: boolean;
  }[];
}

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  sort_order: number;
}

export interface BlogCardRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  author: string | null;
  published_at: string | null;
  reading_time: number | null;
  tags: string[];
  categories: string[] | null;
  featured: boolean;
}

// Columns the shop + homepage product cards actually render. Deliberately NOT
// `*` / `variants(*)` — we only need pricing-relevant variant fields.
const PRODUCT_CARD_COLUMNS =
  "id, name, slug, description, category_id, base_price, selling_price, image_url, status, featured, sort_order, card_color, track_inventory, stock, low_stock_threshold, allow_backorder, category:categories(name), variants:product_variants(base_price, selling_price, special_price, sort_order, track_inventory, stock, low_stock_threshold, allow_backorder)";

// Blog card columns — crucially excludes `content` (full article HTML), which
// the listing/cards never render but `select('*')` used to ship for every post.
const BLOG_CARD_COLUMNS =
  "id, title, slug, excerpt, cover_image_url, author, published_at, reading_time, tags, categories, featured";

export const getPublishedProducts = unstable_cache(
  async (storeId: string): Promise<ProductCardRow[]> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_CARD_COLUMNS)
      .eq("store_id", storeId)
      .eq("status", "published")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) {
      console.error("getPublishedProducts:", error.message);
      return [];
    }
    // PostgREST returns the embedded category as a nested object; flatten it to
    // a plain name string so cards can read `product.category` directly.
    const rows = (data ?? []) as unknown as (Omit<
      ProductCardRow,
      "category"
    > & {
      category: { name: string } | null;
    })[];
    return rows.map((r) => ({ ...r, category: r.category?.name ?? null }));
  },
  ["storefront-published-products"],
  { tags: [TAGS.products], revalidate: REVALIDATE },
);

export const getActiveCategories = unstable_cache(
  async (storeId: string): Promise<CategoryRow[]> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, image_url, sort_order")
      .eq("store_id", storeId)
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      console.error("getActiveCategories:", error.message);
      return [];
    }
    return (data ?? []) as CategoryRow[];
  },
  ["storefront-active-categories"],
  { tags: [TAGS.categories], revalidate: REVALIDATE },
);

export const getPublishedBlogCards = unstable_cache(
  async (storeId: string): Promise<BlogCardRow[]> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("blogs")
      .select(BLOG_CARD_COLUMNS)
      .eq("store_id", storeId)
      .eq("status", "published")
      .order("published_at", { ascending: false });
    if (error) {
      console.error("getPublishedBlogCards:", error.message);
      return [];
    }
    return (data ?? []) as BlogCardRow[];
  },
  ["storefront-published-blog-cards"],
  { tags: [TAGS.blogs], revalidate: REVALIDATE },
);

// Category/tag OPTIONS offered by the customer write editor (names only — the
// storefront never needs row ids). Managed per store in /dashboard/blogs/settings.
export const getBlogTaxonomyNames = unstable_cache(
  async (
    storeId: string,
  ): Promise<{ categories: string[]; tags: string[] }> => {
    const supabase = createPublicClient();
    const [cats, tags] = await Promise.all([
      supabase
        .from("blog_categories")
        .select("name")
        .eq("store_id", storeId)
        .order("name", { ascending: true }),
      supabase
        .from("blog_tags")
        .select("name")
        .eq("store_id", storeId)
        .order("name", { ascending: true }),
    ]);
    if (cats.error) console.error("getBlogTaxonomyNames:", cats.error.message);
    if (tags.error) console.error("getBlogTaxonomyNames:", tags.error.message);
    return {
      categories: ((cats.data ?? []) as { name: string }[]).map((r) => r.name),
      tags: ((tags.data ?? []) as { name: string }[]).map((r) => r.name),
    };
  },
  ["storefront-blog-taxonomy"],
  { tags: [TAGS.blogTaxonomy], revalidate: REVALIDATE },
);

// A published store_pages row for the storefront. Selects NAMED columns only
// (the anon role can't read the draft `sections` column — see store_pages.sql)
// and returns the live `published_sections`. `null` (incl. cached nulls, so a
// 404 storm on junk URLs stays cheap) means "no such published page".
export interface PublishedPage {
  id: string;
  slug: string;
  title: string;
  seo_title: string;
  seo_description: string;
  seo_noindex: boolean;
  published_sections: PageSectionItem[];
}

export const getPublishedPage = unstable_cache(
  async (storeId: string, slug: string): Promise<PublishedPage | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("store_pages")
      .select(
        "id, slug, title, seo_title, seo_description, seo_noindex, published_sections",
      )
      .eq("store_id", storeId)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error || !data) return null;
    return data as unknown as PublishedPage;
  },
  ["storefront-store-page"],
  { tags: [TAGS.pages], revalidate: REVALIDATE },
);

// Per-store navigation (header + footer). Returns normalized menus, falling
// back to DEFAULT_MENUS for any store without a row (or empty fields). Consumed
// by the storefront layout → MenuProvider → Header/Footer.
export const getStoreMenus = unstable_cache(
  async (storeId: string): Promise<StoreMenus> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("store_menus")
      .select("header, footer_groups, footer_legal")
      .eq("store_id", storeId)
      .maybeSingle();
    if (error || !data) return normalizeMenus(null);
    return normalizeMenus(data);
  },
  ["storefront-store-menus"],
  { tags: [TAGS.menus], revalidate: REVALIDATE },
);

// Published page slugs for the current store — used by the sitemap.
export const getPublishedPageSlugs = unstable_cache(
  async (storeId: string): Promise<{ slug: string; updated_at: string }[]> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("store_pages")
      .select("slug, updated_at, seo_noindex")
      .eq("store_id", storeId)
      .eq("status", "published");
    if (error) return [];
    // The homepage sentinel (slug '') is served by `/`, not as a custom page.
    // Pages the merchant flagged noindex must not appear in the sitemap either —
    // a sitemap that advertises URLs it also asks crawlers to skip is a bad
    // signal.
    const rows = (data ?? []) as {
      slug: string;
      updated_at: string;
      seo_noindex: boolean;
    }[];
    return rows.filter((r) => !!r.slug && !r.seo_noindex);
  },
  ["storefront-store-page-slugs"],
  { tags: [TAGS.pages], revalidate: REVALIDATE },
);
