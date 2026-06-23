import { createClient } from "@/lib/supabase/server";
import { requireSectionAccess } from "../../../lib/access";
import { CouponForm } from "../coupon-form";
import type { CouponGroup } from "../page";

export default async function NewCouponPage() {
  await requireSectionAccess("marketing", "manage");

  const supabase = await createClient();
  const { data: groups } = await supabase
    .from("user_groups")
    .select("id, name, color")
    .order("name", { ascending: true });

  return <CouponForm coupon={null} groups={(groups ?? []) as CouponGroup[]} />;
}
