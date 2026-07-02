"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActingStoreId,
  getManagerUserId,
  getViewerContext,
} from "@/app/dashboard/lib/access";
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
  value: boolean;
  /** True when the store's plan is below the setting's minimum — shown but
   *  not editable. */
  locked: boolean;
  minPlan?: string;
  dependsOn?: string;
}

// Feature settings for the acting store, shaped for /dashboard/settings/features.
export async function getStoreSettingsForEditor(): Promise<{
  plan: string;
  settings: EditorSetting[];
}> {
  const ctx = await getViewerContext();
  if (
    !ctx?.profile ||
    !can(ctx.permissions, "settings", "view", ctx.isSuperadmin)
  ) {
    return { plan: "free", settings: [] };
  }

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
    settings: SETTINGS.map((def) => ({
      key: def.key,
      label: def.label,
      description: def.description,
      group: def.group,
      value: values[def.key],
      locked: !planAllows(plan, def.minPlan),
      minPlan: def.minPlan,
      dependsOn: def.dependsOn,
    })),
  };
}

/**
 * Persist feature settings from the dashboard editor. Only keys in the
 * registry are accepted, non-boolean values are dropped, and plan-locked
 * settings can't be changed. Merges into stores.settings.features (preserving
 * brand and everything else in settings), then busts the store-lookup cache so
 * the storefront and all setting reads update at once.
 */
export async function saveStoreSettings(
  values: Record<string, boolean>,
): Promise<ActionResult> {
  const userId = await getManagerUserId("settings");
  if (!userId) return { error: "Not authenticated" };

  const storeId = await getActingStoreId();
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

  for (const def of SETTINGS) {
    const v = values[def.key];
    if (typeof v !== "boolean") continue; // key not submitted / junk
    if (!planAllows(plan, def.minPlan)) continue; // locked on this plan
    features[def.key] = v;
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
