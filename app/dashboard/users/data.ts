import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Customer,
  CustomerBlog,
  CustomerDetail,
  CustomerReview,
} from "./shared";

// The `customers` table is own-row-only under RLS (see customers_table.sql), so
// every cross-customer read here goes through the service-role admin client.
const COLUMNS =
  "id, phone, email, first_name, last_name, created_at, updated_at";

/**
 * Every customer, newest first, enriched with activity counts (reviews +
 * customer-submitted blogs). Counts are tallied in-app from two lightweight
 * id-only sweeps rather than per-row queries. `error` is true if the customers
 * table hasn't been migrated yet.
 */
export async function getCustomers(): Promise<{
  data: Customer[];
  error: boolean;
  recentCount: number;
  /** Epoch ms; sign-ups on/after this are "new in the last 30 days". */
  recentCutoff: number;
}> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("customers")
    .select(COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "Failed to load customers (has supabase/customers_table.sql been applied?):",
      error,
    );
    return { data: [], error: true, recentCount: 0, recentCutoff: 0 };
  }

  // Tally activity. Both queries are best-effort — a missing table or column
  // just leaves the counts at zero rather than failing the whole page.
  const [reviewsRes, blogsRes] = await Promise.all([
    admin.from("product_reviews").select("customer_id"),
    admin
      .from("blogs")
      .select("submitted_by")
      .eq("is_customer_submission", true),
  ]);

  const reviewCounts = tally(
    (reviewsRes.data ?? []).map((r) => r.customer_id as string | null),
  );
  const blogCounts = tally(
    (blogsRes.data ?? []).map((b) => b.submitted_by as string | null),
  );

  const customers: Customer[] = (data ?? []).map((row) => ({
    ...(row as Omit<Customer, "review_count" | "blog_count">),
    review_count: reviewCounts.get(row.id) ?? 0,
    blog_count: blogCounts.get(row.id) ?? 0,
  }));

  // Sign-ups in the last 30 days. Computed here (a plain server module) rather
  // than in render so the client view stays free of impure time calls.
  const recentCutoff = Date.now() - 30 * 86400000;
  const recentCount = customers.filter(
    (c) => new Date(c.created_at).getTime() >= recentCutoff,
  ).length;

  return { data: customers, error: false, recentCount, recentCutoff };
}

function tally(ids: (string | null)[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) {
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** A single customer with their reviews and blog submissions, or null. */
export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("customers")
    .select(COLUMNS)
    .eq("id", id)
    .single();

  if (error || !data) return null;

  const [reviewsRes, blogsRes] = await Promise.all([
    admin
      .from("product_reviews")
      .select("id, rating, comment, created_at, product_id, products(name)")
      .eq("customer_id", id)
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
