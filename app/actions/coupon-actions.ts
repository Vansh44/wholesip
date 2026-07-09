"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  getManagerUserId,
  getActingStoreId,
  getViewerContext,
} from "@/app/dashboard/lib/access";
import { can } from "@/app/dashboard/lib/permissions";
import { TAGS } from "@/lib/storefront/tags";

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
  show_on_storefront: boolean;
  // User group ids this coupon is restricted to. Empty / omitted = public.
  restricted_group_ids?: string[];
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
    show_on_storefront: form.show_on_storefront,
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
  // Bust the cached storefront coupon-discovery list so the cart reflects
  // create/edit/delete/visibility changes immediately.
  revalidateTag(TAGS.coupons, "max");
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Replace a coupon's group restrictions with `groupIds` (clear + insert).
// Empty list leaves the coupon public. Best-effort: a missing
// coupon_user_groups table (not yet migrated) is logged, not fatal — the
// coupon itself still saves.
async function syncCouponGroups(
  supabase: SupabaseServerClient,
  couponId: string,
  groupIds: string[] | undefined,
  storeId: string,
): Promise<void> {
  const ids = Array.from(new Set((groupIds ?? []).filter(Boolean)));

  const { error: delError } = await supabase
    .from("coupon_user_groups")
    .delete()
    .eq("coupon_id", couponId);
  if (delError) {
    console.error("syncCouponGroups (clear) error:", delError);
    return;
  }

  if (ids.length === 0) return;

  const rows = ids.map((group_id) => ({
    coupon_id: couponId,
    group_id,
    store_id: storeId,
  }));
  const { error: insError } = await supabase
    .from("coupon_user_groups")
    .insert(rows);
  if (insError) console.error("syncCouponGroups (insert) error:", insError);
}

// Returns an error message if a group-restricted coupon can't be used by the
// current caller, or null when it's allowed (incl. public coupons). Runs on
// the shopper's session client: coupon_user_groups is publicly readable, and
// user_group_members is RLS-scoped to the signed-in customer's own rows.
async function checkGroupRestriction(
  supabase: SupabaseServerClient,
  couponId: string,
): Promise<string | null> {
  const { data: links, error: linksError } = await supabase
    .from("coupon_user_groups")
    .select("group_id")
    .eq("coupon_id", couponId);

  if (linksError) {
    // Table not migrated / unreadable: treat the coupon as public rather than
    // blocking a legitimate code.
    console.error("checkGroupRestriction (links) error:", linksError);
    return null;
  }

  const groupIds = (links ?? []).map((l) => l.group_id as string);
  if (groupIds.length === 0) return null; // public coupon

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Sign in to use this coupon.";

  const { data: memberships, error: memError } = await supabase
    .from("user_group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .in("group_id", groupIds);

  if (memError) {
    console.error("checkGroupRestriction (membership) error:", memError);
    return "Could not verify this coupon for your account. Please try again.";
  }

  if (!memberships || memberships.length === 0)
    return "This coupon isn’t available for your account.";

  return null;
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
  const storeId = await getActingStoreId();

  const invalid = validateForm(form);
  if (invalid) return { error: invalid };

  const { data, error } = await supabase
    .from("coupons")
    .insert({ ...buildRow(form, userId, true), store_id: storeId })
    .select()
    .single();

  if (error) {
    if (isUniqueViolation(error))
      return { error: "A coupon with that code already exists." };
    console.error("createCoupon error:", error);
    return { error: error.message };
  }

  await syncCouponGroups(
    supabase,
    (data as { id: string }).id,
    form.restricted_group_ids,
    storeId,
  );

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
  const storeId = await getActingStoreId();

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

  await syncCouponGroups(supabase, id, form.restricted_group_ids, storeId);

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

  const storeId = await getActingStoreId();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coupons")
    .select(
      "id, code, discount_type, discount_value, min_order_amount, max_uses, used_count, valid_from, valid_until",
    )
    .eq("code", code)
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) {
    console.error("validateCoupon error:", error);
    return { error: "Could not check that code. Please try again." };
  }
  if (!data) return { error: "Invalid or expired coupon code." };

  // Group restriction: a coupon linked to one or more user groups can only be
  // applied by a signed-in customer who belongs to one of them. Public coupons
  // (no links) skip this entirely.
  const restriction = await checkGroupRestriction(supabase, data.id as string);
  if (restriction) return { error: restriction };

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

// ---------------------------------------------------------------------------
// Storefront Discovery
// ---------------------------------------------------------------------------
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentStore } from "@/lib/store/resolve";
import { resolveStoreSettings } from "@/lib/settings/registry";

export interface AvailableCoupon {
  code: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  min_order_amount: number;
}

// Cached, cookieless read of a store's shopper-visible coupons. Runs on the
// anonymous public client (only ACTIVE coupons are anon-readable via RLS, and
// we return no admin-only columns), so it is safe to serve from a shared cache.
// Keyed by (storeId, showAll) — each store + toggle state gets its own entry —
// and tagged TAGS.coupons so any coupon create/edit/delete/visibility change
// (revalidateCoupons) busts it. Called from CouponField on mount; caching keeps
// that from hitting the DB on every page load.
const getStorefrontCouponsCached = unstable_cache(
  async (storeId: string, showAll: boolean): Promise<AvailableCoupon[]> => {
    const supabase = createPublicClient();
    let query = supabase
      .from("coupons")
      .select(
        "code, description, discount_type, discount_value, min_order_amount, valid_from, valid_until, max_uses, used_count",
      )
      .eq("store_id", storeId)
      .eq("status", "active");

    if (!showAll) {
      query = query.eq("show_on_storefront", true);
    }

    const { data, error } = await query;
    if (error) {
      console.error("getStorefrontCoupons:", error.message);
      return [];
    }
    if (!data) return [];

    const now = Date.now();
    type DBRow = {
      code: string;
      description: string | null;
      discount_type: DiscountType;
      discount_value: number;
      min_order_amount: number;
      valid_from: string | null;
      valid_until: string | null;
      max_uses: number;
      used_count: number;
    };
    return (data as unknown as DBRow[])
      .filter((c) => {
        if (c.valid_from && new Date(c.valid_from).getTime() > now)
          return false;
        if (c.valid_until && new Date(c.valid_until).getTime() < now)
          return false;
        if (c.max_uses > 0 && c.used_count >= c.max_uses) return false;
        return true;
      })
      .map((c) => ({
        code: c.code,
        description: c.description,
        discount_type: c.discount_type,
        discount_value: Number(c.discount_value) || 0,
        min_order_amount: Number(c.min_order_amount) || 0,
      }));
  },
  ["storefront-available-coupons"],
  { tags: [TAGS.coupons], revalidate: 300 },
);

export async function getAvailableStorefrontCoupons(): Promise<
  AvailableCoupon[]
> {
  const store = await getCurrentStore();
  const settings = resolveStoreSettings(store.settings, store.plan);
  const showAll = Boolean(settings["marketing.showAllCoupons"]);
  return getStorefrontCouponsCached(store.id, showAll);
}

export async function toggleCouponVisibility(
  id: string,
  show: boolean,
): Promise<{ success?: boolean; error?: string }> {
  const ctx = await getViewerContext();
  if (!ctx?.profile) return { error: "Not authenticated" };

  if (!can(ctx.permissions, "marketing", "manage", ctx.isSuperadmin)) {
    return { error: "You don't have permission to manage coupons." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("coupons")
    .update({ show_on_storefront: show })
    .eq("id", id)
    .eq("store_id", ctx.storeId);

  if (error) {
    console.error("toggleCouponVisibility:", error.message);
    return { error: "Failed to update coupon visibility." };
  }

  revalidateCoupons();
  return { success: true };
}
