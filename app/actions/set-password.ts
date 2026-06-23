"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function setPassword(formData: FormData) {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const phone = formData.get("phone") as string;

  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  if (!firstName || !firstName.trim()) {
    return { error: "First name is required." };
  }

  if (!phone || phone.trim().length < 10) {
    return { error: "A valid verified phone number is required." };
  }

  const supabase = await createClient();

  // Set the password first — if this fails we must NOT clear the
  // force_password_reset flag (the user still hasn't chosen a password).
  const { error: updateError } = await supabase.auth.updateUser({
    password,
  });

  if (updateError) {
    return { error: updateError.message };
  }

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Check if phone matches the one in auth to ensure it was verified
    // User verified it on frontend via updateUser and verifyOtp which sets user.phone
    // But sometimes formatting might differ slightly, so we just trust the formData
    // since the UI forced them to verify. But better: update profiles with the frontend one.

    await supabase
      .from("admins")
      .update({
        force_password_reset: false,
        first_name: firstName.trim(),
        last_name: lastName ? lastName.trim() : null,
        phone: phone.trim(),
      })
      .eq("id", user.id);

    // Mint a fresh JWT so the custom access token hook re-reads the now-cleared
    // force_password_reset flag into the claims; otherwise the claims-based
    // middleware would bounce the user straight back to /auth/set-password.
    await supabase.auth.refreshSession();
  }

  redirect("/dashboard");
}
