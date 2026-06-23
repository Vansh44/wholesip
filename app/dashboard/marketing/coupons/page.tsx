import { createClient } from "@/lib/supabase/server";
import { requireSectionAccess } from "../../lib/access";
import { CouponsManagementView } from "./coupons-management-view";

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_order_amount: number;
  max_uses: number;
  used_count: number;
  status: "active" | "disabled";
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
  /** Groups this coupon is restricted to. Empty = public (anyone can apply). */
  restricted_group_ids: string[];
}

/** A user group, for the coupon editor's restriction picker. */
export interface CouponGroup {
  id: string;
  name: string;
  color: string;
}

export default async function CouponsPage() {
  const access = await requireSectionAccess("marketing", "view");
  const canManage = access.can("marketing", "manage");

  const supabase = await createClient();

  const { data: coupons, error } = await supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load coupons
        </div>
        <p className="leading-relaxed text-destructive/80">
          Make sure the <code>coupons</code> table exists (run{" "}
          <code>supabase/coupons_table.sql</code> in the SQL Editor) and that
          you have the correct permissions.
        </p>
      </div>
    );
  }

  // User groups (for the restriction picker) and the coupon→group links.
  // Both are best-effort: if those tables aren't migrated yet, coupons still
  // load and simply behave as public (no restrictions).
  const [groupsRes, linksRes] = await Promise.all([
    supabase
      .from("user_groups")
      .select("id, name, color")
      .order("name", { ascending: true }),
    supabase.from("coupon_user_groups").select("coupon_id, group_id"),
  ]);

  const linksByCoupon = new Map<string, string[]>();
  for (const link of linksRes.data ?? []) {
    const cid = link.coupon_id as string;
    const list = linksByCoupon.get(cid) ?? [];
    list.push(link.group_id as string);
    linksByCoupon.set(cid, list);
  }

  const enriched: Coupon[] = (coupons ?? []).map((c) => ({
    ...(c as Omit<Coupon, "restricted_group_ids">),
    restricted_group_ids: linksByCoupon.get(c.id as string) ?? [],
  }));

  return (
    <CouponsManagementView
      coupons={enriched}
      groups={(groupsRes.data ?? []) as CouponGroup[]}
      canManage={canManage}
    />
  );
}
