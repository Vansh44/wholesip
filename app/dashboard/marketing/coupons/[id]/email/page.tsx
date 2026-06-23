import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSectionAccess } from "../../../../lib/access";
import { CouponEmailForm } from "../../coupon-email-form";
import type { Coupon, CouponGroup } from "../../page";

export default async function CouponEmailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSectionAccess("marketing", "manage");
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: coupon, error }, { data: groups }] = await Promise.all([
    supabase.from("coupons").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("user_groups")
      .select("id, name, color")
      .order("name", { ascending: true }),
  ]);

  if (error || !coupon) notFound();

  const enriched: Coupon = {
    ...(coupon as Omit<Coupon, "restricted_group_ids">),
    restricted_group_ids: [],
  };

  return (
    <CouponEmailForm
      coupon={enriched}
      groups={(groups ?? []) as CouponGroup[]}
    />
  );
}
