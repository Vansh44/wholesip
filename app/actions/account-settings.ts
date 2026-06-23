"use server";

import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; success?: boolean };

/** Update the signed-in admin's display name on their own profile row. */
export async function updateProfileName(formData: FormData): Promise<Result> {
  const firstName = ((formData.get("firstName") as string) || "").trim();
  const lastName = ((formData.get("lastName") as string) || "").trim();

  if (!firstName) {
    return { error: "First name is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("admins")
    .update({
      first_name: firstName,
      last_name: lastName || null,
    })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update profile name:", error);
    return { error: "Couldn't save your name. Please try again." };
  }

  return { success: true };
}

/**
 * Change the signed-in admin's password. The current password is re-verified
 * with signInWithPassword first (Supabase lets a recent session update the
 * password without it, but we require it like Notion/Linear do for safety).
 */
export async function changePassword(formData: FormData): Promise<Result> {
  const currentPassword = (formData.get("currentPassword") as string) || "";
  const newPassword = (formData.get("newPassword") as string) || "";
  const confirmPassword = (formData.get("confirmPassword") as string) || "";

  if (!currentPassword) {
    return { error: "Enter your current password." };
  }
  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match." };
  }
  if (newPassword === currentPassword) {
    return { error: "New password must be different from the current one." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not authenticated." };

  // Re-verify the current password.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) {
    return { error: "Your current password is incorrect." };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) {
    return { error: updateError.message || "Couldn't update your password." };
  }

  return { success: true };
}

/**
 * Persist a phone number to the profile after it has been OTP-verified on the
 * client (Supabase `verifyOtp` with type "phone_change" updates auth.users.phone).
 * We only accept the number that auth has actually recorded as verified.
 */
export async function setVerifiedPhone(phone: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const normalized = phone.trim();
  if (!user.phone || `+${user.phone}` !== normalized) {
    // Supabase stores phone without the leading "+"; accept either form.
    if (user.phone !== normalized.replace(/^\+/, "")) {
      return { error: "Phone number hasn't been verified yet." };
    }
  }

  const { error } = await supabase
    .from("admins")
    .update({ phone: normalized })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to save verified phone:", error);
    return { error: "Couldn't save your phone number. Please try again." };
  }

  return { success: true };
}
