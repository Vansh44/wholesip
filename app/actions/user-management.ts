"use server";

import { count, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerUser } from "@/lib/auth/server-user";
import { withService, withUser } from "@/lib/db/client";
import { admins, roles } from "@/drizzle/schema";

type Result = { error?: string; success?: boolean };

// Superadmin-only staff management. NOTE: these guards are intentionally NOT
// store-scoped — they mirror the original service-role queries, which operate
// on the admins table globally (last-superadmin protection, etc.). The caller's
// own role is read under their identity (RLS own-row); the target reads/writes
// run in the service scope.

async function requireSuperadminCaller(): Promise<
  { id: string } | { error: string }
> {
  const user = await getServerUser();
  if (!user) return { error: "Not authenticated" };
  try {
    const rows = await withUser({ uid: user.id, email: user.email }, (db) =>
      db
        .select({ role: admins.role })
        .from(admins)
        .where(eq(admins.id, user.id))
        .limit(1),
    );
    if (rows[0]?.role !== "superadmin") return { error: "Unauthorized" };
    return { id: user.id };
  } catch {
    return { error: "Unauthorized" };
  }
}

// Count of superadmins across the admins table (matches the original global
// guard — not store-scoped).
async function superadminCount(): Promise<number> {
  const rows = await withService((db) =>
    db.select({ n: count() }).from(admins).where(eq(admins.role, "superadmin")),
  );
  return rows[0]?.n ?? 0;
}

export async function deleteUser(userId: string): Promise<Result> {
  const gate = await requireSuperadminCaller();
  if ("error" in gate) return gate;

  if (userId === gate.id) {
    return { error: "You cannot delete your own account." };
  }

  // Don't allow deleting the last remaining superadmin (would lock everyone out).
  const targetRows = await withService((db) =>
    db
      .select({ role: admins.role })
      .from(admins)
      .where(eq(admins.id, userId))
      .limit(1),
  ).catch(() => []);

  if (targetRows[0]?.role === "superadmin") {
    if ((await superadminCount()) <= 1) {
      return { error: "Cannot delete the last superadmin." };
    }
  }

  // Delete the auth user (cascades to the admins row). Auth stays on Supabase
  // until Phase 6.
  const adminClient = createAdminClient();
  const { error: deleteAuthError } =
    await adminClient.auth.admin.deleteUser(userId);
  if (deleteAuthError) return { error: deleteAuthError.message };

  return { success: true };
}

export async function changeUserRole(userId: string, role: string): Promise<Result> {
  const gate = await requireSuperadminCaller();
  if ("error" in gate) return gate;

  // The target role must be a real, defined role. Fall back to the two
  // built-in roles when the roles table hasn't been seeded yet.
  const roleRows = await withService((db) =>
    db.select({ slug: roles.slug }).from(roles).where(eq(roles.slug, role)).limit(1),
  ).catch(() => []);
  if (!roleRows[0] && !["superadmin", "member"].includes(role)) {
    return { error: "Invalid role" };
  }

  // Prevent demoting the last superadmin (e.g. yourself), which would leave
  // the dashboard with no one able to manage users.
  if (role !== "superadmin") {
    const targetRows = await withService((db) =>
      db
        .select({ role: admins.role })
        .from(admins)
        .where(eq(admins.id, userId))
        .limit(1),
    ).catch(() => []);

    if (targetRows[0]?.role === "superadmin") {
      if ((await superadminCount()) <= 1) {
        return { error: "Cannot demote the last superadmin." };
      }
    }
  }

  try {
    await withService((db) =>
      db.update(admins).set({ role }).where(eq(admins.id, userId)),
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update." };
  }
  return { success: true };
}

export async function toggleUserSuspension(
  userId: string,
  isSuspended: boolean,
): Promise<Result> {
  const gate = await requireSuperadminCaller();
  if ("error" in gate) return gate;

  if (userId === gate.id && isSuspended) {
    return { error: "You cannot suspend your own account." };
  }

  try {
    await withService((db) =>
      db.update(admins).set({ isSuspended }).where(eq(admins.id, userId)),
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update." };
  }

  return { success: true };
}

export async function changeOwnPassword(newPassword: string): Promise<Result> {
  if (!newPassword || newPassword.length < 8)
    return { error: "Password must be at least 8 characters" };

  // Pure auth flow — stays on Supabase until Phase 6.
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) return { error: error.message };
  return { success: true };
}

export async function triggerPasswordReset(email: string): Promise<Result> {
  // Pure auth flow — stays on Supabase until Phase 6.
  const supabase = await createClient();

  // When users click the link in the email, they will be redirected to the site
  // The default behavior is to redirect to the site URL, but you can specify a redirectTo
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/callback?next=/auth/update-password`,
  });

  if (error) return { error: error.message };
  return { success: true };
}
