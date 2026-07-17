"use server";

import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";
import { withUser } from "@/lib/db/client";
import { admins } from "@/drizzle/schema";
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

  // The password + session flow stays on Supabase auth until Phase 6.
  const supabase = await createClient();

  // Set the password first — if this fails we must NOT clear the
  // force_password_reset flag (the user still hasn't chosen a password).
  const { error: updateError } = await supabase.auth.updateUser({
    password,
  });

  if (updateError) {
    return { error: updateError.message };
  }

  const user = await getServerUser();

  if (user) {
    // Update the admin's own profile row (RLS own-row) — clears the reset flag
    // and stores the verified name/phone.
    await withUser({ uid: user.id }, (db) =>
      db
        .update(admins)
        .set({
          forcePasswordReset: false,
          firstName: firstName.trim(),
          lastName: lastName ? lastName.trim() : null,
          phone: phone.trim(),
        })
        .where(eq(admins.id, user.id)),
    );

    // Mint a fresh JWT so the custom access token hook re-reads the now-cleared
    // force_password_reset flag into the claims; otherwise the claims-based
    // middleware would bounce the user straight back to /auth/set-password.
    await supabase.auth.refreshSession();
  }

  redirect("/dashboard");
}
