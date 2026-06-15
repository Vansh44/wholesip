import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  can,
  normalizePermissions,
  SUPERADMIN_SLUG,
  type PermissionAction,
  type RolePermissions,
} from "./permissions";

export interface ViewerProfile {
  email: string;
  role: string | null;
  first_name: string | null;
  last_name: string | null;
}

export interface ViewerContext {
  userId: string;
  userEmail: string | null;
  profile: ViewerProfile | null;
  isSuperadmin: boolean;
  permissions: RolePermissions;
}

/**
 * Resolve the signed-in admin, their profile, and their role's permission map
 * in a single place. Wrapped in React's `cache()` so the dashboard layout and
 * the page rendering in the same request share ONE resolution instead of each
 * re-running getUser → profiles → roles (previously ~6 round-trips per nav).
 *
 * Returns null only when there is no session. A signed-in user with no profile
 * row returns a context with `profile: null` so callers can branch (the layout
 * shows a setup screen; page guards bounce to /dashboard).
 */
export const getViewerContext = cache(
  async (): Promise<ViewerContext | null> => {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, role, first_name, last_name")
      .eq("id", user.id)
      .single();

    if (!profile || profileError) {
      if (profileError) {
        console.error("Viewer profile fetch error:", profileError);
      }
      return {
        userId: user.id,
        userEmail: user.email ?? null,
        profile: null,
        isSuperadmin: false,
        permissions: {},
      };
    }

    const roleSlug: string = profile.role ?? "";
    const isSuperadmin = roleSlug === SUPERADMIN_SLUG;

    let permissions: RolePermissions = {};
    if (!isSuperadmin && roleSlug) {
      const { data: role } = await supabase
        .from("roles")
        .select("permissions")
        .eq("slug", roleSlug)
        .single();
      permissions = normalizePermissions(role?.permissions);
    }

    return {
      userId: user.id,
      userEmail: user.email ?? null,
      profile,
      isSuperadmin,
      permissions,
    };
  },
);

export interface Role {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  permissions: RolePermissions;
  color: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface ViewerAccess {
  userId: string;
  email: string;
  roleSlug: string;
  isSuperadmin: boolean;
  permissions: RolePermissions;
  can: (section: string, action: PermissionAction) => boolean;
}

/**
 * Resolve the signed-in admin and the permission set their role grants.
 * Redirects to login when there is no session. Returns null when the user
 * is authenticated but has no profile row (the layout renders a setup
 * screen for that case).
 */
export async function getViewerAccess(): Promise<ViewerAccess | null> {
  const ctx = await getViewerContext();

  if (!ctx) {
    redirect("/auth/login");
  }

  if (!ctx.profile) return null;

  const roleSlug: string = ctx.profile.role ?? "";

  return {
    userId: ctx.userId,
    email: ctx.profile.email,
    roleSlug,
    isSuperadmin: ctx.isSuperadmin,
    permissions: ctx.permissions,
    can: (section, action) =>
      can(ctx.permissions, section, action, ctx.isSuperadmin),
  };
}

/**
 * Server-action gate (non-redirecting). Returns the caller's id only if their
 * role grants `manage` on `section`, else null. Superadmins always pass.
 *
 * Backward compatible: if the `roles` table hasn't been created yet, the
 * built-in "member" role keeps full operational management rights.
 */
export async function getManagerUserId(
  section: string,
): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const slug = profile?.role;
  if (!slug) return null;
  if (slug === SUPERADMIN_SLUG) return user.id;

  const { data: role, error } = await supabase
    .from("roles")
    .select("permissions")
    .eq("slug", slug)
    .single();

  // Roles table present & role found: enforce the permission map.
  if (role) {
    const perms = normalizePermissions(role.permissions);
    return can(perms, section, "manage") ? user.id : null;
  }

  // Legacy fallback before the migration is applied: "member" keeps full rights.
  if (error && slug === "member") return user.id;
  return null;
}

/**
 * Page guard: ensure the viewer can `view` (or `manage`) a section, else send
 * them back to the dashboard home. Returns the resolved access for reuse.
 */
export async function requireSectionAccess(
  section: string,
  action: PermissionAction = "view",
): Promise<ViewerAccess> {
  const access = await getViewerAccess();
  // No profile -> let the layout's setup screen handle it; bounce to /dashboard.
  if (!access) redirect("/dashboard");
  if (!access.can(section, action)) {
    redirect("/dashboard?denied=" + encodeURIComponent(section));
  }
  return access;
}
