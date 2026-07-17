import { and, asc, count as countFn, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { couponUserGroups, coupons, userGroups } from "@/drizzle/schema";
import { requireSectionAccess, getActingStoreId } from "../../lib/access";
import {
  DASHBOARD_PAGE_SIZE,
  pickPage,
  pickParam,
  sanitizeSearch,
} from "../../lib/list-params";
import { CouponsManagementView } from "./coupons-management-view";
import { getStoreSettingsForEditor } from "@/app/actions/store-settings";

// Aliased select preserving the snake_case Coupon shape the view expects.
export const COUPON_COLUMNS = {
  id: coupons.id,
  code: coupons.code,
  description: coupons.description,
  discount_type: coupons.discountType,
  discount_value: coupons.discountValue,
  min_order_amount: coupons.minOrderAmount,
  max_uses: coupons.maxUses,
  used_count: coupons.usedCount,
  status: coupons.status,
  valid_from: coupons.validFrom,
  valid_until: coupons.validUntil,
  show_on_storefront: coupons.showOnStorefront,
  created_at: coupons.createdAt,
  updated_at: coupons.updatedAt,
};

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

  const storeId = await getActingStoreId();

  const conds = [eq(coupons.storeId, storeId)];
  const term = sanitizeSearch(q);
  if (term) {
    const pat = `%${term}%`;
    conds.push(
      or(ilike(coupons.code, pat), ilike(coupons.description, pat))!,
    );
  }
  const whereExpr = and(...conds);

  let couponRows: Record<string, unknown>[];
  let total: number;
  let groups: CouponGroup[];
  let links: { coupon_id: string; group_id: string }[];
  try {
    ({ couponRows, total, groups, links } = await withService(async (db) => {
      const [couponRows, countRows, groupRows] = await Promise.all([
        db
          .select(COUPON_COLUMNS)
          .from(coupons)
          .where(whereExpr)
          .orderBy(desc(coupons.createdAt))
          .limit(pageSize)
          .offset(from),
        db.select({ n: countFn() }).from(coupons).where(whereExpr),
        db
          .select({
            id: userGroups.id,
            name: userGroups.name,
            color: userGroups.color,
          })
          .from(userGroups)
          .orderBy(asc(userGroups.name)),
      ]);

      // The coupon→group links for the coupons ON THIS PAGE only.
      const pageCouponIds = couponRows.map((c) => c.id as string);
      const links = pageCouponIds.length
        ? await db
            .select({
              coupon_id: couponUserGroups.couponId,
              group_id: couponUserGroups.groupId,
            })
            .from(couponUserGroups)
            .where(
              and(
                eq(couponUserGroups.storeId, storeId),
                inArray(couponUserGroups.couponId, pageCouponIds),
              ),
            )
        : [];

      return {
        couponRows: couponRows as Record<string, unknown>[],
        total: countRows[0]?.n ?? 0,
        groups: groupRows as CouponGroup[],
        links,
      };
    }));
  } catch (err) {
    console.error("CouponsPage load error:", err);
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load coupons
        </div>
        <p className="leading-relaxed text-destructive/80">
          Could not load the coupons. Please try again.
        </p>
      </div>
    );
  }

  const linksByCoupon = new Map<string, string[]>();
  for (const link of links) {
    const list = linksByCoupon.get(link.coupon_id) ?? [];
    list.push(link.group_id);
    linksByCoupon.set(link.coupon_id, list);
  }

  const enriched: Coupon[] = couponRows.map((c) => ({
    ...(c as unknown as Omit<Coupon, "restricted_group_ids">),
    restricted_group_ids: linksByCoupon.get(c.id as string) ?? [],
  }));

  // Fetch store settings for the master toggle
  const { settings } = await getStoreSettingsForEditor("Marketing");
  const showAllCoupons =
    settings.find((s) => s.key === "marketing.showAllCoupons")?.value ?? false;

  return (
    <CouponsManagementView
      coupons={enriched}
      groups={groups}
      canManage={canManage}
      total={total}
      page={page}
      pageSize={pageSize}
      query={q}
      showAllCoupons={Boolean(showAllCoupons)}
    />
  );
}
