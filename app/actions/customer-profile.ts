"use server";

import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";
import { withUser } from "@/lib/db/client";
import { users } from "@/drizzle/schema";
import { getCurrentStoreId } from "@/lib/store/resolve";

export async function updateCustomerProfile(formData: FormData) {
  const firstName = formData.get("firstName") as string;
  const lastName = (formData.get("lastName") as string) || null;
  const email = (formData.get("email") as string) || null;

  if (!firstName || !firstName.trim()) {
    return { error: "First name is required." };
  }

  if (email && !email.includes("@")) {
    return { error: "Please provide a valid email address." };
  }

  const user = await getServerUser();
  if (!user) {
    return { error: "Not authenticated." };
  }

  // Update auth email if it changed. Auth stays on Supabase until Phase 6, so
  // this one call keeps using the cookie-bound server client.
  if (email && email.trim() !== user.email) {
    const supabase = await createClient();
    const { error: authError } = await supabase.auth.updateUser({
      email: email.trim(),
    });
    if (authError) {
      console.error("Failed to update auth email:", authError);
      return { error: authError.message || "Failed to update email address." };
    }
  }

  // `users.phone` is NOT NULL UNIQUE — never write an empty string (it would
  // collide across every phone-less customer). Only set it when the
  // authenticated user actually has a verified phone; otherwise leave the
  // existing value untouched (the conflict-update path preserves it).
  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName?.trim() || null;
  const trimmedEmail = email?.trim() || null;

  const insertRow = {
    id: user.id,
    firstName: trimmedFirst,
    lastName: trimmedLast,
    email: trimmedEmail,
    storeId: await getCurrentStoreId(),
    ...(user.phone ? { phone: user.phone } : {}),
  };
  // Columns overwritten on conflict — never `id`, and only touch `phone` when
  // we actually have a verified one to write.
  const conflictSet = {
    firstName: trimmedFirst,
    lastName: trimmedLast,
    email: trimmedEmail,
    ...(user.phone ? { phone: user.phone } : {}),
  };

  try {
    // Own-row upsert under the customer's identity (RLS-scoped to user_id).
    // phone is filled from the verified auth identity, not the form.
    await withUser({ uid: user.id }, (db) =>
      db
        .insert(users)
        .values(insertRow as typeof users.$inferInsert)
        .onConflictDoUpdate({ target: users.id, set: conflictSet }),
    );
  } catch (err) {
    console.error("Failed to update customer profile:", err);
    return { error: "Failed to save profile. Please try again." };
  }

  return { success: true };
}
