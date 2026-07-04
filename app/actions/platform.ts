"use server";

import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORE_TAG } from "@/lib/store/resolve";
import { getThemeDefinition } from "@/lib/themes";
import { applyTheme } from "@/lib/themes/apply";

// A Storemink platform operator (from platform_admins, by JWT email).
export interface PlatformViewer {
  email: string;
  role: "superadmin" | "member";
}

export async function getPlatformViewer(): Promise<PlatformViewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabase
    .from("platform_admins")
    .select("email, role")
    .ilike("email", user.email)
    .maybeSingle();
  if (!data) return null;
  return {
    email: data.email as string,
    role: data.role as "superadmin" | "member",
  };
}

export interface PlatformStoreRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan: string;
  custom_domain: string | null;
  created_at: string;
}

// Strip PostgREST filter-control chars so a search term can't break .or().
function sanitize(q: string): string {
  return q
    .replace(/[(),:*%\\]/g, " ")
    .trim()
    .slice(0, 80);
}

// Every store on the platform (operator-only; service role bypasses per-store RLS).
export async function listAllStores(q?: string): Promise<PlatformStoreRow[]> {
  if (!(await getPlatformViewer())) return [];
  const admin = createAdminClient();
  let query = admin
    .from("stores")
    .select("id, slug, name, status, plan, custom_domain, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  const term = sanitize(q ?? "");
  if (term) query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) {
    console.error("listAllStores:", error.message);
    return [];
  }
  return (data ?? []) as PlatformStoreRow[];
}

export interface ActionResult {
  success?: boolean;
  error?: string;
}

// Suspend / reactivate a store (platform superadmin only). A suspended store
// stops resolving on the storefront (Read stores policy requires status=active).
export async function setStoreStatus(
  storeId: string,
  status: "active" | "suspended",
): Promise<ActionResult> {
  const viewer = await getPlatformViewer();
  if (viewer?.role !== "superadmin") {
    return { error: "Only a platform superadmin can change store status." };
  }
  if (!["active", "suspended"].includes(status)) {
    return { error: "Invalid status." };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("stores")
    .update({ status })
    .eq("id", storeId);
  if (error) {
    console.error("setStoreStatus:", error.message);
    return { error: "Could not update the store. Please try again." };
  }
  revalidateTag(STORE_TAG, "max");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Platform operators (RBAC) — manage who can operate Storemink.
// ---------------------------------------------------------------------------

export interface PlatformAdminRow {
  id: string;
  email: string;
  role: "superadmin" | "member";
  created_at: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The operator roster (any operator can view).
export async function listPlatformAdmins(): Promise<PlatformAdminRow[]> {
  if (!(await getPlatformViewer())) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_admins")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: true });
  return (data ?? []) as PlatformAdminRow[];
}

async function requireSuperadmin(): Promise<PlatformViewer | null> {
  const viewer = await getPlatformViewer();
  return viewer?.role === "superadmin" ? viewer : null;
}

// Add (or re-role) a platform operator by email. They're recognised on their
// next login — no account needs to exist yet.
export async function invitePlatformAdmin(
  email: string,
  role: "superadmin" | "member",
): Promise<ActionResult> {
  const me = await requireSuperadmin();
  if (!me) return { error: "Only a platform superadmin can add operators." };
  const clean = email.trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) return { error: "Enter a valid email." };
  if (!["superadmin", "member"].includes(role))
    return { error: "Invalid role." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_admins")
    .upsert({ email: clean, role }, { onConflict: "email" });
  if (error) {
    console.error("invitePlatformAdmin:", error.message);
    return { error: "Could not add the operator. Please try again." };
  }
  return { success: true };
}

export async function updatePlatformAdminRole(
  id: string,
  role: "superadmin" | "member",
): Promise<ActionResult> {
  if (!(await requireSuperadmin()))
    return { error: "Only a platform superadmin can change roles." };
  const admin = createAdminClient();

  // Don't allow demoting the last remaining superadmin.
  if (role === "member") {
    const { data: target } = await admin
      .from("platform_admins")
      .select("role")
      .eq("id", id)
      .maybeSingle();
    if (target?.role === "superadmin") {
      const { count } = await admin
        .from("platform_admins")
        .select("id", { count: "exact", head: true })
        .eq("role", "superadmin");
      if ((count ?? 0) <= 1)
        return { error: "Can't demote the last superadmin." };
    }
  }

  const { error } = await admin
    .from("platform_admins")
    .update({ role })
    .eq("id", id);
  if (error) return { error: "Could not update the operator." };
  return { success: true };
}

export async function removePlatformAdmin(id: string): Promise<ActionResult> {
  if (!(await requireSuperadmin()))
    return { error: "Only a platform superadmin can remove operators." };
  const admin = createAdminClient();

  const { data: target } = await admin
    .from("platform_admins")
    .select("role")
    .eq("id", id)
    .maybeSingle();
  if (target?.role === "superadmin") {
    const { count } = await admin
      .from("platform_admins")
      .select("id", { count: "exact", head: true })
      .eq("role", "superadmin");
    if ((count ?? 0) <= 1)
      return { error: "Can't remove the last superadmin." };
  }

  const { error } = await admin.from("platform_admins").delete().eq("id", id);
  if (error) return { error: "Could not remove the operator." };
  return { success: true };
}

// ---------------------------------------------------------------------------
// Theme demo stores — one real store per theme (slug demo-{themeId}, marked
// settings.demo) that the signup picker's Preview button opens. Re-seedable:
// applyTheme with reset:true wipes the demo's catalog/pages/menus and applies
// the theme fresh, so demos always show the theme's pristine state. No admins
// row is created — nobody logs into a demo store.
// ---------------------------------------------------------------------------

export interface SeedDemoResult {
  success?: boolean;
  error?: string;
  slug?: string;
  warnings?: string[];
}

export async function seedDemoStore(themeId: string): Promise<SeedDemoResult> {
  if (!(await requireSuperadmin())) {
    return { error: "Only a platform superadmin can seed demo stores." };
  }
  const theme = getThemeDefinition(themeId);
  if (theme.id !== themeId) {
    return { error: `Unknown theme "${themeId}".` };
  }

  const admin = createAdminClient();
  const slug = theme.demoSlug;

  // Create the store row if missing.
  const { data: existing } = await admin
    .from("stores")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  let storeId = existing?.id as string | undefined;
  if (!storeId) {
    const { data: created, error } = await admin
      .from("stores")
      .insert({
        slug,
        name: `${theme.name} Demo`,
        status: "active",
        plan: "free",
        settings: {
          demo: true,
          template: theme.id,
          brand: { name: `${theme.name} Demo` },
        },
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("seedDemoStore (insert):", error?.message);
      return { error: "Could not create the demo store." };
    }
    storeId = created.id as string;
  }

  const result = await applyTheme(storeId, theme.id, {
    publish: true,
    reset: true,
  });

  revalidateTag(STORE_TAG, "max");
  if (!result.success) {
    return {
      success: true,
      slug,
      warnings: result.errors,
    };
  }
  return { success: true, slug };
}
