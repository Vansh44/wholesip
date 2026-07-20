import { asc } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { userGroups } from "@/drizzle/schema";
import { requireSectionAccess } from "../../../lib/access";
import { CouponForm } from "../coupon-form";
import type { CouponGroup } from "../page";

export default async function NewCouponPage() {
  await requireSectionAccess("marketing", "manage");

  const groups = await withService((db) =>
    db
      .select({
        id: userGroups.id,
        name: userGroups.name,
        color: userGroups.color,
      })
      .from(userGroups)
      .orderBy(asc(userGroups.name)),
  ).catch(() => [] as CouponGroup[]);

  return <CouponForm coupon={null} groups={groups as CouponGroup[]} />;
}
