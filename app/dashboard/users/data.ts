import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Customer,
  CustomerBlog,
  CustomerDetail,
  CustomerReview,
} from "./shared";

// The `users` table is own-row-only under RLS, so every cross-customer read
// here goes through the service-role admin client. Listing is paginated and
// filtered/sorted in SQL via the `customer_admin` view (see
// supabase/customer_admin_view.sql) so we never pull every user — or every
// review and blog — into memory.

export const CUSTOMERS_PAGE_SIZE = 50;

const VIEW_COLUMNS =
  "id, phone, email, first_name, last_name, created_at, updated_at, review_count, blog_count, activity_count";

const DETAIL_COLUMNS =
  "id, phone, email, first_name, last_name, created_at, updated_at";

export type CustomerSort = "newest" | "oldest" | "name" | "active";
export type CustomerFilter = "all" | "recent" | "reviewers" | "with_email";

export interface CustomerQuery {
  page?: number;
  q?: string;
  filter?: CustomerFilter;
  sort?: CustomerSort;
}

// Computed in this plain server module (never in a component render) so the
// "new in last 30 days" cut-off stays out of the impure-call lint surface.
function recentCutoffIso(): string {
  return new Date(Date.now() - 30 * 86400000).toISOString();
}

export interface CustomersResult {
  data: Customer[];
  error: boolean;
  /** Total rows in the *filtered* set (for pagination), not just this page. */
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerStats {
  total: number;
  recent: number;
  withEmail: number;
  reviewers: number;
}

/** Strip PostgREST filter-control characters so a search term can't break the
 *  `.or()` expression (it's interpolated into the filter string). */
function sanitizeSearch(q: string): string {
  return q
    .replace(/[(),:*%\\]/g, " ")
    .trim()
    .slice(0, 100);
}

/**
 * One page of customers (newest first by default), filtered/sorted in SQL.
 * `error` is true if the view/table hasn't been migrated yet.
 */
export async function getCustomers(
  query: CustomerQuery = {},
): Promise<CustomersResult> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = CUSTOMERS_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const filter = query.filter ?? "all";
  const sort = query.sort ?? "newest";

  const admin = createAdminClient();
  let q = admin.from("customer_admin").select(VIEW_COLUMNS, { count: "exact" });

  const term = sanitizeSearch(query.q ?? "");
  if (term) {
    const like = `*${term}*`;
    q = q.or(
      `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`,
    );
  }

  if (filter === "recent") {
    q = q.gte("created_at", recentCutoffIso());
  } else if (filter === "reviewers") {
    q = q.gt("review_count", 0);
  } else if (filter === "with_email") {
    q = q.not("email", "is", null);
  }

  if (sort === "oldest") {
    q = q.order("created_at", { ascending: true });
  } else if (sort === "name") {
    q = q
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true, nullsFirst: false });
  } else if (sort === "active") {
    q = q.order("activity_count", { ascending: false });
  } else {
    q = q.order("created_at", { ascending: false });
  }

  const { data, error, count } = await q.range(from, to);

  if (error) {
    console.error(
      "Failed to load customers (apply supabase/customer_admin_view.sql + users_table.sql):",
      error,
    );
    return { data: [], error: true, total: 0, page, pageSize };
  }

  return {
    data: (data ?? []) as Customer[],
    error: false,
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Aggregate counts for the metric cards. These are count-only queries
 * (`head: true` transfers no rows) so they stay cheap as the table grows.
 */
export async function getCustomerStats(): Promise<CustomerStats> {
  const admin = createAdminClient();
  const cutoff = recentCutoffIso();

  const [totalRes, recentRes, emailRes, reviewersRes] = await Promise.all([
    admin.from("users").select("id", { count: "exact", head: true }),
    admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .gte("created_at", cutoff),
    admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .not("email", "is", null),
    admin
      .from("customer_admin")
      .select("id", { count: "exact", head: true })
      .gt("review_count", 0),
  ]);

  return {
    total: totalRes.count ?? 0,
    recent: recentRes.count ?? 0,
    withEmail: emailRes.count ?? 0,
    reviewers: reviewersRes.count ?? 0,
  };
}

/** A single customer with their reviews and blog submissions, or null. */
export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("users")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .single();

  if (error || !data) return null;

  const [reviewsRes, blogsRes] = await Promise.all([
    admin
      .from("product_reviews")
      .select("id, rating, comment, created_at, product_id, products(name)")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("blogs")
      .select("id, title, slug, status, created_at")
      .eq("submitted_by", id)
      .order("created_at", { ascending: false }),
  ]);

  const reviews: CustomerReview[] = (reviewsRes.data ?? []).map((r) => {
    // `products(name)` arrives as an object (or array, depending on the join
    // cardinality) — normalise to a plain string | null.
    const product = r.products as
      | { name?: string }
      | { name?: string }[]
      | null;
    const productName = Array.isArray(product)
      ? (product[0]?.name ?? null)
      : (product?.name ?? null);
    return {
      id: r.id as string,
      rating: r.rating as number,
      comment: (r.comment as string | null) ?? null,
      created_at: r.created_at as string,
      product_id: r.product_id as string,
      product_name: productName,
    };
  });

  const blogs: CustomerBlog[] = (blogsRes.data ?? []) as CustomerBlog[];

  return {
    ...(data as Omit<Customer, "review_count" | "blog_count">),
    review_count: reviews.length,
    blog_count: blogs.length,
    reviews,
    blogs,
  };
}
