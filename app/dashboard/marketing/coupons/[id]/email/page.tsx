import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { coupons, userGroups } from "@/drizzle/schema";
import { requireSectionAccess, getActingStoreId } from "../../../../lib/access";
import { CouponEmailForm } from "../../coupon-email-form";
import { COUPON_COLUMNS } from "../../page";
import type { Coupon, CouponGroup } from "../../page";

export default async function CouponEmailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSectionAccess("marketing", "manage");
  const { id } = await params;

  const storeId = await getActingStoreId();
  const result = await withService(async (db) => {
    const couponRows = await db
      .select(COUPON_COLUMNS)
      .from(coupons)
      .where(and(eq(coupons.id, id), eq(coupons.storeId, storeId)))
      .limit(1);
    const groupRows = await db
      .select({
        id: userGroups.id,
        name: userGroups.name,
        color: userGroups.color,
      })
      .from(userGroups)
      .orderBy(asc(userGroups.name));
    return { coupon: couponRows[0], groups: groupRows as CouponGroup[] };
  }).catch(() => null);

  if (!result?.coupon) notFound();

  const enriched: Coupon = {
    ...(result.coupon as unknown as Omit<Coupon, "restricted_group_ids">),
    restricted_group_ids: [],
  };

  return <CouponEmailForm coupon={enriched} groups={result.groups} />;
}
