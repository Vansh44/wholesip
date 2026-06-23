import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSectionAccess } from "../../../../lib/access";
import { CouponForm } from "../../coupon-form";
import type { Coupon, CouponGroup } from "../../page";

export default async function EditCouponPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSectionAccess("marketing", "manage");
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: coupon, error }, { data: groups }, { data: links }] =
    await Promise.all([
      supabase.from("coupons").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("user_groups")
        .select("id, name, color")
        .order("name", { ascending: true }),
      supabase
        .from("coupon_user_groups")
        .select("group_id")
        .eq("coupon_id", id),
    ]);

  if (error || !coupon) notFound();

  const enriched: Coupon = {
    ...(coupon as Omit<Coupon, "restricted_group_ids">),
    restricted_group_ids: (links ?? []).map((l) => l.group_id as string),
  };

  return (
    <CouponForm coupon={enriched} groups={(groups ?? []) as CouponGroup[]} />
  );
}
