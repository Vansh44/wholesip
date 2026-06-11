"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getManagerUserId } from "@/app/dashboard/lib/access";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiscountType = "percentage" | "fixed";

export interface CouponFormData {
  code: string;
  description: string;
  discount_type: DiscountType;
  discount_value: number;
  min_order_amount: number; // 0 = no minimum
  max_uses: number; // 0 = unlimited
  valid_from: string; // "" or yyyy-mm-dd
  valid_until: string; // "" or yyyy-mm-dd
  status: "active" | "disabled";
}

export interface ActionResult {
  success?: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

// What the storefront receives when a code validates: enough to recompute the
// discount locally as the cart changes, without trusting the client on price.
export interface AppliedCoupon {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number;
}

export interface ValidateResult {
  coupon?: AppliedCoupon;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Coupon codes are case-insensitive: stored and matched uppercased, no spaces.
function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

// Allowed when the caller's role grants `manage` on the Marketing section.
async function getAdminUserId(): Promise<string | null> {
  return getManagerUserId("marketing");
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === UNIQUE_VIOLATION;
}

// Turn a date input ("" | "yyyy-mm-dd") into an ISO timestamp or null.
function toTimestamp(value: string): string | null {
  const v = value?.trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function buildRow(form: CouponFormData, userId: string, creating: boolean) {
  const num = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  return {
    code: normalizeCode(form.code),
    description: form.description.trim() || null,
    discount_type: form.discount_type,
    discount_value: num(form.discount_value),
    min_order_amount: num(form.min_order_amount),
    max_uses: Number.isFinite(form.max_uses)
      ? Math.trunc(Math.max(0, form.max_uses))
      : 0,
    status: form.status,
    valid_from: toTimestamp(form.valid_from),
    valid_until: toTimestamp(form.valid_until),
    updated_by: userId,
    ...(creating ? { created_by: userId } : {}),
  };
}

function validateForm(form: CouponFormData): string | null {
  if (!normalizeCode(form.code)) return "Coupon code is required.";
  if (!(form.discount_value > 0))
    return "Discount value must be greater than 0.";
  if (form.discount_type === "percentage" && form.discount_value > 100)
    return "A percentage discount can't exceed 100%.";
  const from = toTimestamp(form.valid_from);
  const until = toTimestamp(form.valid_until);
  if (from && until && new Date(from) > new Date(until))
    return "“Valid from” must be before “Valid until”.";
  return null;
}

function revalidateCoupons() {
  revalidatePath("/dashboard/marketing/coupons");
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createCoupon(
  form: CouponFormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const invalid = validateForm(form);
  if (invalid) return { error: invalid };

  const { data, error } = await supabase
    .from("coupons")
    .insert(buildRow(form, userId, true))
    .select()
    .single();

  if (error) {
    if (isUniqueViolation(error))
      return { error: "A coupon with that code already exists." };
    console.error("createCoupon error:", error);
    return { error: error.message };
  }

  revalidateCoupons();
  return { success: true, data: data as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateCoupon(
  id: string,
  form: CouponFormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const invalid = validateForm(form);
  if (invalid) return { error: invalid };

  const { error } = await supabase
    .from("coupons")
    .update(buildRow(form, userId, false))
    .eq("id", id);

  if (error) {
    if (isUniqueViolation(error))
      return { error: "A coupon with that code already exists." };
    console.error("updateCoupon error:", error);
    return { error: error.message };
  }

  revalidateCoupons();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteCoupon(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const { error } = await supabase.from("coupons").delete().eq("id", id);

  if (error) {
    console.error("deleteCoupon error:", error);
    return { error: error.message };
  }

  revalidateCoupons();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Validate (storefront — callable by anonymous shoppers)
//
// RLS only exposes ACTIVE coupons, so an unknown OR disabled code reads as
// "invalid". Date / usage / minimum checks run here so the cart can show a
// specific reason. Returns the rule (type/value/min) so the cart recomputes
// the discount locally as quantities change.
// ---------------------------------------------------------------------------

export async function validateCoupon(
  rawCode: string,
  subtotal: number,
): Promise<ValidateResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { error: "Enter a coupon code." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coupons")
    .select(
      "code, discount_type, discount_value, min_order_amount, max_uses, used_count, valid_from, valid_until",
    )
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("validateCoupon error:", error);
    return { error: "Could not check that code. Please try again." };
  }
  if (!data) return { error: "Invalid or expired coupon code." };

  const now = Date.now();
  if (data.valid_from && new Date(data.valid_from).getTime() > now)
    return { error: "This coupon isn’t active yet." };
  if (data.valid_until && new Date(data.valid_until).getTime() < now)
    return { error: "This coupon has expired." };

  if (data.max_uses > 0 && data.used_count >= data.max_uses)
    return { error: "This coupon has reached its usage limit." };

  const minOrder = Number(data.min_order_amount) || 0;
  if (minOrder > 0 && subtotal < minOrder)
    return {
      error: `Add ₹${(minOrder - subtotal).toLocaleString(
        "en-IN",
      )} more to use this coupon (min ₹${minOrder.toLocaleString("en-IN")}).`,
    };

  return {
    coupon: {
      code: data.code,
      discountType: data.discount_type as DiscountType,
      discountValue: Number(data.discount_value) || 0,
      minOrderAmount: minOrder,
    },
  };
}
