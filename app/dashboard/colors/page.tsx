import { createClient } from "@/lib/supabase/server";
import { requireSectionAccess } from "../lib/access";
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

  const supabase = await createClient();

  // Colours + grouped product counts in parallel. Counts come from a Postgres
  // GROUP BY (product_counts_by_color RPC) rather than scanning every product.
  const [{ data: colors, error }, { data: countRows }] = await Promise.all([
    supabase
      .from("card_colors")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase.rpc("product_counts_by_color"),
  ]);

  if (error) {
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load colours
        </div>
        <p className="leading-relaxed text-destructive/80">
          Make sure the <code>card_colors</code> table exists (run{" "}
          <code>supabase/card_colors.sql</code>) and you have the correct
          permissions.
        </p>
      </div>
    );
  }

  // Count products using each colour (matched by lower-cased hex).
  const list = (colors ?? []) as CardColor[];
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
