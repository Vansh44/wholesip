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
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .single();

  if (callerProfile?.role !== "superadmin") {
    return { error: "Unauthorized" };
  }

  const adminClient = createAdminClient();

  // Delete user from auth (this cascades to profiles if set up, otherwise we delete profile too)
  const { error: deleteAuthError } =
    await adminClient.auth.admin.deleteUser(userId);
  if (deleteAuthError) return { error: deleteAuthError.message };

  return { success: true };
}

export async function changeUserRole(userId: string, role: string) {
  if (!["superadmin", "member"].includes(role)) {
    return { error: "Invalid role" };
  }

  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) return { error: "Not authenticated" };

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .single();

  if (callerProfile?.role !== "superadmin") {
    return { error: "Unauthorized" };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("profiles")
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
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .single();

  if (callerProfile?.role !== "superadmin") {
    return { error: "Unauthorized" };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("profiles")
    .update({ is_suspended: isSuspended })
    .eq("id", userId);

  if (error) return { error: error.message };

  // In a real app we might also ban the user via Supabase Auth `updateUserById`
  // await adminClient.auth.admin.updateUserById(userId, { ban_duration: isSuspended ? '1000h' : 'none' });

  return { success: true };
}

export async function changeOwnPassword(newPassword: string) {
  if (newPassword.length < 6)
    return { error: "Password must be at least 6 characters" };

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
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/auth/callback?next=/auth/update-password`,
  });

  if (error) return { error: error.message };
  return { success: true };
}
