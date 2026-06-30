"use server";

import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORE_TAG } from "@/lib/store/resolve";

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
