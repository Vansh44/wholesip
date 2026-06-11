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

  return (
    <CouponsManagementView
      coupons={(coupons ?? []) as Coupon[]}
      canManage={canManage}
    />
  );
}
