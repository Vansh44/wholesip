import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  isNotNull,
  or,
} from "drizzle-orm";
import { withService } from "@/lib/db/client";
import {
  blogs,
  customerAdmin,
  productReviews,
  products,
  users,
} from "@/drizzle/schema";
import { getActingStoreId } from "@/app/dashboard/lib/access";
import type {
  Customer,
  CustomerBlog,
  CustomerDetail,
  CustomerReview,
} from "./shared";

// The `users` table is own-row-only under RLS, so every cross-customer read
// here goes through the service scope. Listing is paginated and filtered/sorted
// in SQL via the `customer_admin` view (see supabase/customer_admin_view.sql)
// so we never pull every user — or every review and blog — into memory.

export const CUSTOMERS_PAGE_SIZE = 50;

// Aliased view projection preserving the snake_case Customer shape.
const VIEW_COLUMNS = {
  id: customerAdmin.id,
  phone: customerAdmin.phone,
  email: customerAdmin.email,
  first_name: customerAdmin.firstName,
  last_name: customerAdmin.lastName,
  created_at: customerAdmin.createdAt,
  updated_at: customerAdmin.updatedAt,
  review_count: customerAdmin.reviewCount,
  blog_count: customerAdmin.blogCount,
  activity_count: customerAdmin.activityCount,
};

const DETAIL_COLUMNS = {
  id: users.id,
  phone: users.phone,
  email: users.email,
  first_name: users.firstName,
  last_name: users.lastName,
  created_at: users.createdAt,
  updated_at: users.updatedAt,
};

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

/** Trim the search term to a sane length (parameterised, so no escaping). */
function sanitizeSearch(q: string): string {
  return q.trim().slice(0, 100);
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
  const filter = query.filter ?? "all";
  const sort = query.sort ?? "newest";

  const conds = [eq(customerAdmin.storeId, await getActingStoreId())];

  const term = sanitizeSearch(query.q ?? "");
  if (term) {
    const like = `%${term}%`;
    conds.push(
      or(
        ilike(customerAdmin.firstName, like),
        ilike(customerAdmin.lastName, like),
        ilike(customerAdmin.email, like),
        ilike(customerAdmin.phone, like),
      )!,
    );
  }

  if (filter === "recent") {
    conds.push(gte(customerAdmin.createdAt, recentCutoffIso()));
  } else if (filter === "reviewers") {
    conds.push(gt(customerAdmin.reviewCount, 0));
  } else if (filter === "with_email") {
    conds.push(isNotNull(customerAdmin.email));
  }
  const whereExpr = and(...conds);

  const order =
    sort === "oldest"
      ? [asc(customerAdmin.createdAt)]
      : sort === "name"
        ? [asc(customerAdmin.firstName), asc(customerAdmin.lastName)]
        : sort === "active"
          ? [desc(customerAdmin.activityCount)]
          : [desc(customerAdmin.createdAt)];

  try {
    const { rows, total } = await withService(async (db) => {
      const [rows, countRows] = await Promise.all([
        db
          .select(VIEW_COLUMNS)
          .from(customerAdmin)
          .where(whereExpr)
          .orderBy(...order)
          .limit(pageSize)
          .offset(from),
        db.select({ n: count() }).from(customerAdmin).where(whereExpr),
      ]);
      return { rows, total: countRows[0]?.n ?? 0 };
    });
    return {
      data: rows as Customer[],
      error: false,
      total,
      page,
      pageSize,
    };
  } catch (err) {
    console.error("Failed to load customers:", err);
    return { data: [], error: true, total: 0, page, pageSize };
  }
}

/**
 * Aggregate counts for the metric cards. Count-only queries so they stay cheap
 * as the table grows.
 */
export async function getCustomerStats(): Promise<CustomerStats> {
  const cutoff = recentCutoffIso();
  const storeId = await getActingStoreId();

  try {
    return await withService(async (db) => {
      const [totalRows, recentRows, emailRows, reviewerRows] =
        await Promise.all([
          db
            .select({ n: count() })
            .from(users)
            .where(eq(users.storeId, storeId)),
          db
            .select({ n: count() })
            .from(users)
            .where(
              and(eq(users.storeId, storeId), gte(users.createdAt, cutoff)),
            ),
          db
            .select({ n: count() })
            .from(users)
            .where(and(eq(users.storeId, storeId), isNotNull(users.email))),
          db
            .select({ n: count() })
            .from(customerAdmin)
            .where(
              and(
                eq(customerAdmin.storeId, storeId),
                gt(customerAdmin.reviewCount, 0),
              ),
            ),
        ]);
      return {
        total: totalRows[0]?.n ?? 0,
        recent: recentRows[0]?.n ?? 0,
        withEmail: emailRows[0]?.n ?? 0,
        reviewers: reviewerRows[0]?.n ?? 0,
      };
    });
  } catch (err) {
    console.error("Failed to load customer stats:", err);
    return { total: 0, recent: 0, withEmail: 0, reviewers: 0 };
  }
}

/** A single customer with their reviews and blog submissions, or null. */
export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const storeId = await getActingStoreId();

  try {
    return await withService(async (db) => {
      const detailRows = await db
        .select(DETAIL_COLUMNS)
        .from(users)
        .where(and(eq(users.id, id), eq(users.storeId, storeId)))
        .limit(1);
      const data = detailRows[0];
      if (!data) return null;

      const [reviewRows, blogRows] = await Promise.all([
        db
          .select({
            id: productReviews.id,
            rating: productReviews.rating,
            comment: productReviews.comment,
            created_at: productReviews.createdAt,
            product_id: productReviews.productId,
            product_name: products.name,
          })
          .from(productReviews)
          .leftJoin(products, eq(productReviews.productId, products.id))
          .where(eq(productReviews.userId, id))
          .orderBy(desc(productReviews.createdAt)),
        db
          .select({
            id: blogs.id,
            title: blogs.title,
            slug: blogs.slug,
            status: blogs.status,
            created_at: blogs.createdAt,
          })
          .from(blogs)
          .where(eq(blogs.submittedBy, id))
          .orderBy(desc(blogs.createdAt)),
      ]);

      const reviews = reviewRows as CustomerReview[];
      const customerBlogs = blogRows as CustomerBlog[];

      return {
        ...(data as Omit<Customer, "review_count" | "blog_count">),
        review_count: reviews.length,
        blog_count: customerBlogs.length,
        reviews,
        blogs: customerBlogs,
      };
    });
  } catch (err) {
    console.error("Failed to load customer:", err);
    return null;
  }
}
