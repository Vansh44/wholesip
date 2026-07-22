"use server";

import { eq } from "drizzle-orm";
import { getServerUser } from "@/lib/auth/server-user";
import { updateAuthUser } from "@/lib/auth/firebase-users";
import { setUserClaims } from "@/lib/auth/firebase-claims";
import { withService, withUser } from "@/lib/db/client";
import { admins } from "@/drizzle/schema";

/**
 * The signed-in admin's name + verified phone, for the set-password screen's
 * prefill. Replaces a browser-side `admins` read (a "use client" page cannot
 * use the server-only Drizzle layer). Returns the auth phone — non-null only
 * once the phone was OTP-verified during signup, which the UI treats as
 * "already verified".
 */
export async function getSetPasswordProfile(): Promise<{
  firstName: string;
  lastName: string;
  phone: string | null;
} | null> {
  const user = await getServerUser();
  if (!user) return null;

  const rows = await withService((db) =>
    db
      .select({ firstName: admins.firstName, lastName: admins.lastName })
      .from(admins)
      .where(eq(admins.id, user.id))
      .limit(1),
  ).catch(() => []);
  const profile = rows[0];

  return {
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    phone: user.phone,
  };
}

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

  const user = await getServerUser();
  if (!user) return { error: "Not authenticated." };

  // Set the password first — if this fails we must NOT clear the
  // force_password_reset flag (the user still hasn't chosen a password).
  try {
    await updateAuthUser(user.id, { password });
  } catch (err) {
    console.error("setPassword updateAuthUser error:", err);
    return { error: "Couldn't set your password. Please try again." };
  }

  // Update the admin's own profile row (RLS own-row) — clears the reset flag
  // and stores the verified name/phone.
  await withUser({ uid: user.id, email: user.email }, (db) =>
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

  // Clear the force_password_reset custom claim so the proxy stops bouncing the
  // user back here. The claim only reaches the session cookie once the token is
  // refreshed, so the CLIENT calls establishSession(forceRefresh) after this
  // returns — hence we return success rather than redirect server-side.
  await setUserClaims(user.id, { forcePasswordReset: false }).catch((err) =>
    console.error("setPassword setUserClaims error:", err),
  );

  return { success: true };
}
