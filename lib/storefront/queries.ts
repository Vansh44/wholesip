import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { TAGS } from "@/lib/storefront/tags";
import type { HomepageSection } from "@/lib/homepage/section-types";

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
  /** Resolved category name (flattened from the joined categories row). */
  category: string | null;
  variants: {
    base_price: number;
    selling_price: number;
    special_price: number | null;
    sort_order: number;
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
  "id, name, slug, description, category_id, base_price, selling_price, image_url, status, featured, sort_order, card_color, category:categories(name), variants:product_variants(base_price, selling_price, special_price, sort_order)";

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

export const getEnabledHomepageSections = unstable_cache(
  async (storeId: string): Promise<HomepageSection[]> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("homepage_sections")
      .select("*")
      .eq("store_id", storeId)
      .eq("enabled", true)
      .order("sort_order", { ascending: true });
    if (error) {
      // Table may not exist yet (migration not applied) — render just the hero.
      return [];
    }
    return (data ?? []) as unknown as HomepageSection[];
  },
  ["storefront-homepage-sections"],
  { tags: [TAGS.homepage], revalidate: REVALIDATE },
);
