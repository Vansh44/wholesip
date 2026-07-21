import { asc, eq, sql } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { categories } from "@/drizzle/schema";
import { requireSectionAccess, getActingStoreId } from "../lib/access";
import { CategoriesManagementView } from "./categories-management-view";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  status: "active" | "hidden";
  created_at: string;
  updated_at: string;
  // Joined / derived
  product_count?: number;
}

export default async function CategoriesPage() {
  const access = await requireSectionAccess("categories", "view");
  const canManage = access.can("categories", "manage");

  const storeId = await getActingStoreId();

  // Categories + grouped product counts in parallel. Counts are tallied in
  // Postgres (product_counts_by_category function) instead of pulling every
  // product row into Node to count by hand. Service scope + explicit store
  // filter (the admin needs hidden categories too, and the app-layer scoping
  // is what confines the read to this store).
  let list: Category[];
  let countRows: { category_id: string; cnt: number }[];
  try {
    ({ list, countRows } = await withService(async (db) => {
      // Aliased select preserves the snake_case shape the view expects.
      const cats = await db
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          description: categories.description,
          image_url: categories.imageUrl,
          sort_order: categories.sortOrder,
          status: categories.status,
          created_at: categories.createdAt,
          updated_at: categories.updatedAt,
        })
        .from(categories)
        .where(eq(categories.storeId, storeId))
        .orderBy(asc(categories.sortOrder), asc(categories.name));
      const counts = await db.execute(
        sql`select category_id, cnt from product_counts_by_category(${storeId})`,
      );
      return {
        list: cats as Category[],
        countRows: counts.rows as { category_id: string; cnt: number }[],
      };
    }));
  } catch (err) {
    console.error("CategoriesPage load error:", err);
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load categories
        </div>
        <p className="leading-relaxed text-destructive/80">
          Could not load the categories. Please try again.
        </p>
      </div>
    );
  }

  const counts = new Map<string, number>();
  for (const row of (countRows ?? []) as {
    category_id: string;
    cnt: number;
  }[]) {
    if (row.category_id) counts.set(row.category_id, Number(row.cnt));
  }
  for (const c of list) {
    c.product_count = counts.get(c.id) ?? 0;
  }

  return <CategoriesManagementView categories={list} canManage={canManage} />;
}
