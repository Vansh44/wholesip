"use server";

import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  // Update auth email if it changed
  if (email && email.trim() !== user.email) {
    const { error: authError } = await supabase.auth.updateUser({
      email: email.trim(),
    });
    if (authError) {
      console.error("Failed to update auth email:", authError);
      return { error: authError.message || "Failed to update email address." };
    }
  }

  // `customers.phone` is NOT NULL UNIQUE — never write an empty string (it
  // would collide across every phone-less customer). Only set it when the
  // authenticated user actually has a verified phone; otherwise leave the
  // existing value untouched.
  const profilePayload: Record<string, unknown> = {
    id: user.id,
    first_name: firstName.trim(),
    last_name: lastName?.trim() || null,
    email: email?.trim() || null,
  };
  if (user.phone) {
    profilePayload.phone = user.phone;
  }

  const { error: upsertError } = await supabase
    .from("customers")
    .upsert(profilePayload, { onConflict: "id" });

  if (upsertError) {
    console.error("Failed to update customer profile:", upsertError);
    return { error: "Failed to save profile. Please try again." };
  }

  return { success: true };
}
