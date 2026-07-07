import { createClient } from "@/lib/supabase/server";
import { requireSectionAccess, getActingStoreId } from "../../lib/access";
import {
  DASHBOARD_PAGE_SIZE,
  ilikeOr,
  pickPage,
  pickParam,
  sanitizeSearch,
} from "../../lib/list-params";
import { CouponsManagementView } from "./coupons-management-view";
import { getStoreSettingsForEditor } from "@/app/actions/store-settings";

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
  show_on_storefront: boolean;
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

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireSectionAccess("marketing", "view");
  const canManage = access.can("marketing", "manage");

  const sp = await searchParams;
  const page = pickPage(sp.page);
  const q = pickParam(sp.q);
  const pageSize = DASHBOARD_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  const supabase = await createClient();
  const storeId = await getActingStoreId();

  let query = supabase
    .from("coupons")
    .select("*", { count: "exact" })
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  const term = sanitizeSearch(q);
  if (term) query = query.or(ilikeOr(["code", "description"], term));

  const {
    data: coupons,
    error,
    count,
  } = await query.range(from, from + pageSize - 1);

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

  // User groups (for the restriction picker) and the coupon→group links for the
  // coupons ON THIS PAGE only. Both are best-effort: if those tables aren't
  // migrated yet, coupons still load and simply behave as public.
  const pageCouponIds = (coupons ?? []).map((c) => c.id as string);
  const [groupsRes, linksRes] = await Promise.all([
    supabase
      .from("user_groups")
      .select("id, name, color")
      .order("name", { ascending: true }),
    pageCouponIds.length
      ? supabase
          .from("coupon_user_groups")
          .select("coupon_id, group_id")
          .eq("store_id", storeId)
          .in("coupon_id", pageCouponIds)
      : Promise.resolve({
          data: [] as { coupon_id: string; group_id: string }[],
        }),
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

  // Fetch store settings for the master toggle
  const { settings } = await getStoreSettingsForEditor("Marketing");
  const showAllCoupons =
    settings.find((s) => s.key === "marketing.showAllCoupons")?.value ?? false;

  return (
    <CouponsManagementView
      coupons={enriched}
      groups={(groupsRes.data ?? []) as CouponGroup[]}
      canManage={canManage}
      total={count ?? 0}
      page={page}
      pageSize={pageSize}
      query={q}
      showAllCoupons={showAllCoupons}
    />
  );
}
