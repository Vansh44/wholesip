"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function deleteUser(userId: string) {
  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) return { error: "Not authenticated" };

  const { data: callerProfile } = await supabase
    .from("admins")
    .select("role")
    .eq("id", caller.id)
    .single();

  if (callerProfile?.role !== "superadmin") {
    return { error: "Unauthorized" };
  }

  if (userId === caller.id) {
    return { error: "You cannot delete your own account." };
  }

  const adminClient = createAdminClient();

  // Don't allow deleting the last remaining superadmin (would lock everyone out).
  const { data: target } = await adminClient
    .from("admins")
    .select("role")
    .eq("id", userId)
    .single();

  if (target?.role === "superadmin") {
    const { count } = await adminClient
      .from("admins")
      .select("id", { count: "exact", head: true })
      .eq("role", "superadmin");
    if ((count ?? 0) <= 1) {
      return { error: "Cannot delete the last superadmin." };
    }
  }

  // Delete user from auth (this cascades to profiles if set up, otherwise we delete profile too)
  const { error: deleteAuthError } =
    await adminClient.auth.admin.deleteUser(userId);
  if (deleteAuthError) return { error: deleteAuthError.message };

  return { success: true };
}

export async function changeUserRole(userId: string, role: string) {
  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) return { error: "Not authenticated" };

  const { data: callerProfile } = await supabase
    .from("admins")
    .select("role")
    .eq("id", caller.id)
    .single();

  if (callerProfile?.role !== "superadmin") {
    return { error: "Unauthorized" };
  }

  const adminClient = createAdminClient();

  // The target role must be a real, defined role. Fall back to the two
  // built-in roles when the roles table hasn't been seeded yet.
  const { data: roleRow } = await adminClient
    .from("roles")
    .select("slug")
    .eq("slug", role)
    .maybeSingle();
  if (!roleRow && !["superadmin", "member"].includes(role)) {
    return { error: "Invalid role" };
  }

  // Prevent demoting the last superadmin (e.g. yourself), which would leave
  // the dashboard with no one able to manage users.
  if (role !== "superadmin") {
    const { data: target } = await adminClient
      .from("admins")
      .select("role")
      .eq("id", userId)
      .single();

    if (target?.role === "superadmin") {
      const { count } = await adminClient
        .from("admins")
        .select("id", { count: "exact", head: true })
        .eq("role", "superadmin");
      if ((count ?? 0) <= 1) {
        return { error: "Cannot demote the last superadmin." };
      }
    }
  }

  const { error } = await adminClient
    .from("admins")
    .update({ role })
    .eq("id", userId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function toggleUserSuspension(
  userId: string,
  isSuspended: boolean,
) {
  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) return { error: "Not authenticated" };

  const { data: callerProfile } = await supabase
    .from("admins")
    .select("role")
    .eq("id", caller.id)
    .single();

  if (callerProfile?.role !== "superadmin") {
    return { error: "Unauthorized" };
  }

  if (userId === caller.id && isSuspended) {
    return { error: "You cannot suspend your own account." };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("admins")
    .update({ is_suspended: isSuspended })
    .eq("id", userId);

  if (error) return { error: error.message };

  // In a real app we might also ban the user via Supabase Auth `updateUserById`
  // await adminClient.auth.admin.updateUserById(userId, { ban_duration: isSuspended ? '1000h' : 'none' });

  return { success: true };
}

export async function changeOwnPassword(newPassword: string) {
  if (!newPassword || newPassword.length < 8)
    return { error: "Password must be at least 8 characters" };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) return { error: error.message };
  return { success: true };
}

export async function triggerPasswordReset(email: string) {
  const supabase = await createClient();

  // When users click the link in the email, they will be redirected to the site
  // The default behavior is to redirect to the site URL, but you can specify a redirectTo
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/callback?next=/auth/update-password`,
  });

  if (error) return { error: error.message };
  return { success: true };
}
