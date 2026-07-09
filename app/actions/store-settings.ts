"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewerContext } from "@/app/dashboard/lib/access";
import { can } from "@/app/dashboard/lib/permissions";
import { STORE_TAG } from "@/lib/store/resolve";
import {
  FEATURES_KEY,
  SETTINGS,
  normalizePlan,
  planAllows,
  resolveStoreSettings,
} from "@/lib/settings/registry";

export interface ActionResult {
  success?: boolean;
  error?: string;
}

/** One catalog entry shaped for the dashboard editor. */
export interface EditorSetting {
  key: string;
  label: string;
  description: string;
  group: string;
  type: "boolean" | "number";
  value: boolean | number;
  /** True when the store's plan is below the setting's minimum — shown but
   *  not editable. */
  locked: boolean;
  minPlan?: string;
  dependsOn?: string;
  min?: number;
  max?: number;
}

// Feature settings for the acting store, shaped for the dashboard editors.
// Each setting is gated by ITS OWN dashboard section (def.section) — e.g. the
// Blogs group needs blogs.view — so feature settings live with their feature
// (blogs → /dashboard/blogs/settings). Pass `group` to fetch one group only.
export async function getStoreSettingsForEditor(group?: string): Promise<{
  plan: string;
  settings: EditorSetting[];
}> {
  const ctx = await getViewerContext();
  if (!ctx?.profile) return { plan: "free", settings: [] };

  const visible = SETTINGS.filter(
    (def) =>
      (!group || def.group === group) &&
      can(ctx.permissions, def.section, "view", ctx.isSuperadmin),
  );
  if (visible.length === 0) return { plan: "free", settings: [] };

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("settings, plan")
    .eq("id", ctx.storeId)
    .single();

  const plan = normalizePlan(store?.plan);
  const values = resolveStoreSettings(
    (store?.settings as Record<string, unknown>) ?? {},
    plan,
  );

  return {
    plan,
    settings: visible.map((def) => ({
      key: def.key,
      label: def.label,
      description: def.description,
      group: def.group,
      type: def.type,
      value: values[def.key],
      locked: !planAllows(plan, def.minPlan),
      minPlan: def.minPlan,
      dependsOn: def.dependsOn,
      min: def.min,
      max: def.max,
    })),
  };
}

/**
 * Persist feature settings from the dashboard editors. Only keys in the
 * registry are accepted, non-boolean values are dropped, plan-locked settings
 * can't be changed, and each key requires `manage` on ITS owning dashboard
 * section (def.section). Merges into stores.settings.features (preserving
 * brand and everything else in settings), then busts the store-lookup cache so
 * the storefront and all setting reads update at once.
 */
export async function saveStoreSettings(
  values: Record<string, boolean | number>,
): Promise<ActionResult> {
  const ctx = await getViewerContext();
  if (!ctx?.profile) return { error: "Not authenticated" };

  // Registry keys actually submitted vs. the subset this caller may change.
  const requested = SETTINGS.filter(
    (def) => typeof values[def.key] === def.type,
  );
  const permitted = requested.filter((def) =>
    can(ctx.permissions, def.section, "manage", ctx.isSuperadmin),
  );
  if (requested.length > 0 && permitted.length === 0) {
    return { error: "You don't have permission to change these settings." };
  }

  const storeId = ctx.storeId;
  const admin = createAdminClient();

  const { data: store, error: readError } = await admin
    .from("stores")
    .select("settings, plan")
    .eq("id", storeId)
    .single();
  if (readError) {
    console.error("saveStoreSettings read:", readError.message);
    return { error: "Could not load store settings. Please try again." };
  }

  const settings = ((store?.settings as Record<string, unknown>) ??
    {}) as Record<string, unknown>;
  const plan = normalizePlan(store?.plan);
  const features = {
    ...((settings[FEATURES_KEY] as Record<string, unknown>) ?? {}),
  };

  for (const def of permitted) {
    if (!planAllows(plan, def.minPlan)) continue; // locked on this plan
    let val = values[def.key];
    if (def.type === "number" && typeof val === "number") {
      val = Math.max(def.min ?? -Infinity, Math.min(def.max ?? Infinity, val));
    }
    features[def.key] = val;
  }

  const { error } = await admin
    .from("stores")
    .update({ settings: { ...settings, [FEATURES_KEY]: features } })
    .eq("id", storeId);

  if (error) {
    console.error("saveStoreSettings:", error.message);
    return { error: "Could not save settings. Please try again." };
  }

  revalidateTag(STORE_TAG, "max");
  revalidatePath("/blogs");
  return { success: true };
}
