import { createClient } from "@/lib/supabase/server";
import { requireSectionAccess, getActingStoreId } from "../lib/access";
import {
  DASHBOARD_PAGE_SIZE,
  ilikeOr,
  pickPage,
  pickParam,
  sanitizeSearch,
} from "../lib/list-params";
import { ProductsManagementView } from "./products-management-view";
import { resolveStoreSettings } from "@/lib/settings/registry";

export type ProductFilter = "all" | "published" | "drafts" | "featured";
const PRODUCT_FILTERS: ProductFilter[] = [
  "all",
  "published",
  "drafts",
  "featured",
];

export interface ProductCounts {
  all: number;
  published: number;
  drafts: number;
  featured: number;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  base_price: number;
  selling_price: number;
  special_price: number | null;
  stock: number;
  sku: string | null;
  image_url: string | null;
  images: string[] | null;
  sort_order: number;
  created_at: string;
}

export interface ProductCategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  base_price: number;
  selling_price: number;
  image_url: string | null;
  images: string[];
  status: "draft" | "published";
  featured: boolean;
  sort_order: number;
  card_color: string | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  track_inventory: boolean;
  stock: number;
  low_stock_threshold: number | null;
  allow_backorder: boolean;
  sku: string | null;
  tax_class_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  category: ProductCategoryRef | null;
  variants: ProductVariant[];
}

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  status: "active" | "hidden";
}

export interface TaxClassOption {
  id: string;
  name: string;
  rate: number;
}

export interface CardColorOption {
  id: string;
  name: string;
  hex: string;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireSectionAccess("products", "view");
  const canManage = access.can("products", "manage");

  const sp = await searchParams;
  const page = pickPage(sp.page);
  const q = pickParam(sp.q);
  const categoryFilter = pickParam(sp.category) || "all";
  const filterParam = pickParam(sp.filter) as ProductFilter;
  const filter = PRODUCT_FILTERS.includes(filterParam) ? filterParam : "all";
  const pageSize = DASHBOARD_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  const supabase = await createClient();
  const storeId = await getActingStoreId();

  // The list view only shows a variant COUNT (editing re-fetches the full
  // product + variants via /dashboard/products/[id]), so pull just variant ids
  // instead of every variant row with its images[] arrays.
  let listQuery = supabase
    .from("products")
    .select(
      "*, category:categories(id, name, slug), variants:product_variants(id)",
      { count: "exact" },
    )
    .eq("store_id", storeId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (filter === "published") listQuery = listQuery.eq("status", "published");
  else if (filter === "drafts") listQuery = listQuery.eq("status", "draft");
  else if (filter === "featured") listQuery = listQuery.eq("featured", true);

  if (categoryFilter === "uncategorized")
    listQuery = listQuery.is("category_id", null);
  else if (categoryFilter !== "all")
    listQuery = listQuery.eq("category_id", categoryFilter);

  const term = sanitizeSearch(q);
  if (term) listQuery = listQuery.or(ilikeOr(["name", "slug"], term));

  const countQuery = () =>
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId);

  const [
    { data: products, error, count },
    { data: categories },
    { data: colors },
    { data: taxClasses },
    { data: storeRow },
    allRes,
    publishedRes,
    draftsRes,
    featuredRes,
  ] = await Promise.all([
    listQuery.range(from, from + pageSize - 1),
    supabase
      .from("categories")
      .select("id, name, slug, status")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("card_colors")
      .select("id, name, hex")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("tax_classes")
      .select("id, name, rate")
      .eq("store_id", storeId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("stores").select("settings, plan").eq("id", storeId).single(),
    countQuery(),
    countQuery().eq("status", "published"),
    countQuery().eq("status", "draft"),
    countQuery().eq("featured", true),
  ]);

  // Store default for the "track inventory" checkbox on NEW simple products.
  const settings = resolveStoreSettings(
    storeRow?.settings as Record<string, unknown>,
    storeRow?.plan,
  );
  const defaultTrackInventory = Boolean(
    settings["inventory.simpleTrackDefault"],
  );

  const counts: ProductCounts = {
    all: allRes.count ?? 0,
    published: publishedRes.count ?? 0,
    drafts: draftsRes.count ?? 0,
    featured: featuredRes.count ?? 0,
  };

  if (error) {
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load products
        </div>
        <p className="leading-relaxed text-destructive/80">
          Make sure the <code>products</code>, <code>categories</code> and{" "}
          <code>product_variants</code> tables exist and you have the correct
          permissions.
        </p>
      </div>
    );
  }

  const list = (products ?? []) as Product[];

  return (
    <ProductsManagementView
      products={list}
      categories={(categories ?? []) as CategoryOption[]}
      colors={(colors ?? []) as CardColorOption[]}
      taxClasses={(taxClasses ?? []) as TaxClassOption[]}
      canManage={canManage}
      counts={counts}
      total={count ?? 0}
      page={page}
      pageSize={pageSize}
      query={q}
      filter={filter}
      categoryFilter={categoryFilter}
      defaultTrackInventory={defaultTrackInventory}
    />
  );
}
