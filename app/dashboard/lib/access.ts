import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { admins, platformAdmins, roles } from "@/drizzle/schema";
import { getServerUser } from "@/lib/auth/server-user";
import { getCurrentStoreId } from "@/lib/store/resolve";
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
  store_id: string;
}

export interface ViewerContext {
  userId: string;
  userEmail: string | null;
  profile: ViewerProfile | null;
  isSuperadmin: boolean;
  permissions: RolePermissions;
  /** The store this dashboard is operating on (resolved from the host). */
  storeId: string;
  /** True when the viewer is a Storemink platform operator (god access). */
  isPlatformAdmin: boolean;
}

// Platform-operator role for the signed-in user (by JWT email), or null.
// Request-cached so multiple gates don't re-query.
const getPlatformRole = cache(
  async (): Promise<"superadmin" | "member" | null> => {
    const user = await getServerUser();
    if (!user?.email) return null;
    // Exact (case-normalised) match — NEVER ILIKE on the user's own email:
    // that treats `_`/`%` in a registered address as SQL wildcards, so an email
    // like `admin0_@x.com` could match a real operator and escalate to platform
    // god access. Operator emails are always stored lowercased (invitePlatformAdmin
    // + seed), mirroring the DB's `lower(email)` RLS helpers. platform_admins IS
    // the allowlist, so a service-scope read filtered by the verified email is
    // the gate.
    const rows = await withService((db) =>
      db
        .select({ role: platformAdmins.role })
        .from(platformAdmins)
        .where(eq(platformAdmins.email, user.email!.toLowerCase()))
        .limit(1),
    ).catch(() => []);
    return (rows[0]?.role as "superadmin" | "member" | undefined) ?? null;
  },
);

/**
 * Resolve the signed-in admin for the CURRENT (host) store + their permissions.
 * Request-cached (React cache) so the layout and page share one resolution.
 *
 * Access model:
 *  • A store admin has an `admins` row for the host store → their role applies.
 *  • A platform operator (platform_admins) is an implicit superadmin of EVERY
 *    store, so they get full access even without a store-admin row.
 *  • Anyone else → profile: null (the layout shows a setup screen).
 * Returns null only when there is no session.
 */
export const getViewerContext = cache(
  async (): Promise<ViewerContext | null> => {
    const user = await getServerUser();
    if (!user) return null;

    const storeId = await getCurrentStoreId();
    const isPlatformAdmin = (await getPlatformRole()) !== null;

    // The user's admin row for THIS store (if they're store staff here).
    // Service scope + the verified user id + store id are the scoping.
    const profileRows = await withService((db) =>
      db
        .select({
          email: admins.email,
          role: admins.role,
          first_name: admins.firstName,
          last_name: admins.lastName,
          store_id: admins.storeId,
        })
        .from(admins)
        .where(and(eq(admins.id, user.id), eq(admins.storeId, storeId)))
        .limit(1),
    ).catch(() => []);
    const profile = profileRows[0];

    const base = {
      userId: user.id,
      userEmail: user.email ?? null,
      storeId,
      isPlatformAdmin,
    };

    if (!profile) {
      // Platform operator dropping into a store they have no row for → treat as
      // its superadmin. Everyone else → no profile (setup screen).
      if (isPlatformAdmin) {
        return {
          ...base,
          profile: {
            email: user.email ?? "",
            role: SUPERADMIN_SLUG,
            first_name: null,
            last_name: null,
            store_id: storeId,
          },
          isSuperadmin: true,
          permissions: {},
        };
      }
      return { ...base, profile: null, isSuperadmin: false, permissions: {} };
    }

    const roleSlug: string = profile.role ?? "";
    const isSuperadmin = roleSlug === SUPERADMIN_SLUG || isPlatformAdmin;

    let permissions: RolePermissions = {};
    if (!isSuperadmin && roleSlug) {
      const roleRows = await withService((db) =>
        db
          .select({ permissions: roles.permissions })
          .from(roles)
          .where(and(eq(roles.storeId, storeId), eq(roles.slug, roleSlug)))
          .limit(1),
      ).catch(() => []);
      permissions = normalizePermissions(roleRows[0]?.permissions);
    }

    return { ...base, profile, isSuperadmin, permissions };
  },
);

/**
 * The store the dashboard is operating on — resolved from the request host.
 * For a store admin this is their store; for a platform operator it's whichever
 * store's dashboard they're currently on. Used as `store_id` on dashboard writes.
 */
export async function getActingStoreId(): Promise<string> {
  return getCurrentStoreId();
}

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
 * Resolve the signed-in admin and the permission set they have on the current
 * store. Redirects to login when there is no session. Returns null when the
 * user is authenticated but has no access here (the layout renders a setup
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
 * Server-action gate (non-redirecting). Returns the caller's id only if they
 * may `manage` `section` on the current store, else null. Platform operators
 * and store superadmins always pass.
 */
export async function getManagerUserId(
  section: string,
): Promise<string | null> {
  const user = await getServerUser();
  if (!user) return null;

  // Platform operators manage everything.
  if ((await getPlatformRole()) !== null) return user.id;

  const storeId = await getCurrentStoreId();
  const profileRows = await withService((db) =>
    db
      .select({ role: admins.role })
      .from(admins)
      .where(and(eq(admins.id, user.id), eq(admins.storeId, storeId)))
      .limit(1),
  ).catch(() => []);

  const slug = profileRows[0]?.role;
  if (!slug) return null;
  if (slug === SUPERADMIN_SLUG) return user.id;

  const roleRows = await withService((db) =>
    db
      .select({ permissions: roles.permissions })
      .from(roles)
      .where(and(eq(roles.storeId, storeId), eq(roles.slug, slug)))
      .limit(1),
  ).catch(() => []);

  // Role found: enforce the permission map.
  if (roleRows[0]) {
    const perms = normalizePermissions(roleRows[0].permissions);
    return can(perms, section, "manage") ? user.id : null;
  }

  // Legacy fallback before the roles table is populated: "member" keeps rights.
  if (slug === "member") return user.id;
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
