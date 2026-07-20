import { asc, eq, sql } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { cardColors } from "@/drizzle/schema";
import { requireSectionAccess, getActingStoreId } from "../lib/access";
import { ColorsManagementView } from "./colors-management-view";

export interface CardColor {
  id: string;
  name: string;
  hex: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Derived
  product_count?: number;
}

export default async function ColorsPage() {
  const access = await requireSectionAccess("colors", "view");
  const canManage = access.can("colors", "manage");

  const storeId = await getActingStoreId();

  // Colours + grouped product counts in parallel. Counts come from a Postgres
  // GROUP BY (product_counts_by_color function) rather than scanning every
  // product. Service scope + explicit store filter (card_colors SELECT is
  // public, so app-layer scoping is what confines the read to this store).
  let list: CardColor[];
  let countRows: { card_color: string; cnt: number }[];
  try {
    ({ list, countRows } = await withService(async (db) => {
      const [colors, counts] = await Promise.all([
        // Aliased select preserves the snake_case shape the view expects.
        db
          .select({
            id: cardColors.id,
            name: cardColors.name,
            hex: cardColors.hex,
            sort_order: cardColors.sortOrder,
            created_at: cardColors.createdAt,
            updated_at: cardColors.updatedAt,
          })
          .from(cardColors)
          .where(eq(cardColors.storeId, storeId))
          .orderBy(asc(cardColors.sortOrder), asc(cardColors.name)),
        db.execute(
          sql`select card_color, cnt from product_counts_by_color(${storeId})`,
        ),
      ]);
      return {
        list: colors as CardColor[],
        countRows: counts.rows as { card_color: string; cnt: number }[],
      };
    }));
  } catch (err) {
    console.error("ColorsPage load error:", err);
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load colours
        </div>
        <p className="leading-relaxed text-destructive/80">
          Could not load the colour palette. Please try again.
        </p>
      </div>
    );
  }

  // Count products using each colour (matched by lower-cased hex).
  const counts = new Map<string, number>();
  for (const row of (countRows ?? []) as {
    card_color: string;
    cnt: number;
  }[]) {
    if (row.card_color) counts.set(row.card_color, Number(row.cnt));
  }
  for (const c of list) {
    c.product_count = counts.get(c.hex.toLowerCase()) ?? 0;
  }

  return <ColorsManagementView colors={list} canManage={canManage} />;
}
