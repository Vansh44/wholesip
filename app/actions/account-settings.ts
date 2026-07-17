"use server";

import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";
import { withUser } from "@/lib/db/client";
import { admins } from "@/drizzle/schema";

type Result = { error?: string; success?: boolean };

/** Update the signed-in admin's display name on their own profile row. */
export async function updateProfileName(formData: FormData): Promise<Result> {
  const firstName = ((formData.get("firstName") as string) || "").trim();
  const lastName = ((formData.get("lastName") as string) || "").trim();

  if (!firstName) {
    return { error: "First name is required." };
  }

  const user = await getServerUser();
  if (!user) return { error: "Not authenticated." };

  try {
    // Own-row update (admins RLS lets a user edit their own row).
    await withUser({ uid: user.id }, (db) =>
      db
        .update(admins)
        .set({ firstName, lastName: lastName || null })
        .where(eq(admins.id, user.id)),
    );
  } catch (err) {
    console.error("Failed to update profile name:", err);
    return { error: "Couldn't save your name. Please try again." };
  }

  return { success: true };
}

/**
 * Change the signed-in admin's password. The current password is re-verified
 * with signInWithPassword first (Supabase lets a recent session update the
 * password without it, but we require it like Notion/Linear do for safety).
 * This is a pure auth flow — it stays on Supabase auth until Phase 6.
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

  const user = await getServerUser();
  if (!user?.email) return { error: "Not authenticated." };

  const supabase = await createClient();
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
  const user = await getServerUser();
  if (!user) return { error: "Not authenticated." };

  const normalized = phone.trim();
  if (!user.phone || `+${user.phone}` !== normalized) {
    // Supabase stores phone without the leading "+"; accept either form.
    if (user.phone !== normalized.replace(/^\+/, "")) {
      return { error: "Phone number hasn't been verified yet." };
    }
  }

  try {
    await withUser({ uid: user.id }, (db) =>
      db.update(admins).set({ phone: normalized }).where(eq(admins.id, user.id)),
    );
  } catch (err) {
    console.error("Failed to save verified phone:", err);
    return { error: "Couldn't save your phone number. Please try again." };
  }

  return { success: true };
}
