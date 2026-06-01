"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

function generateTempPassword(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export async function inviteUser(formData: FormData) {
  const email = formData.get("email") as string;
  const role = formData.get("role") as string;

  if (!email || !email.includes("@")) {
    return { error: "Please provide a valid email address." };
  }

  if (!role || !["superadmin", "member"].includes(role)) {
    return { error: "Invalid role." };
  }

  // Verify the caller is a superadmin
  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return { error: "Not authenticated." };
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .single();

  if (callerProfile?.role !== "superadmin") {
    return { error: "Unauthorized. Superadmin access required." };
  }

  const tempPassword = generateTempPassword();
  const adminClient = createAdminClient();

  // Create user in Supabase Auth
  const { data: newUser, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

  if (createError) {
    return { error: createError.message };
  }

  // Insert profile
  const { error: profileError } = await adminClient.from("profiles").upsert({
    id: newUser.user.id,
    email,
    role,
    force_password_reset: true,
    invited_by: caller.id,
  });

  if (profileError) {
    // Cleanup: delete the auth user
    await adminClient.auth.admin.deleteUser(newUser.user.id);
    return { error: "Failed to create user profile." };
  }

  // Send email via Resend
  const resendApiKey = process.env.RESEND_API_KEY;
  const isResendAvailable =
    resendApiKey && !resendApiKey.includes("placeholder");

  if (isResendAvailable) {
    try {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: "Soakd Dashboard <onboarding@resend.dev>",
        to: email,
        subject: "You've been invited to the Soakd Dashboard",
        text: [
          "Hello,",
          "",
          `You've been invited to join the Soakd admin dashboard as a ${role}.`,
          "",
          "Your temporary login credentials:",
          `Email: ${email}`,
          `Temporary Password: ${tempPassword}`,
          "",
          "Please sign in and set a new password:",
          "https://getsoakd.in/auth/login",
          "",
          "You will be prompted to set a new password on your first login.",
        ].join("\n"),
      });
    } catch (e) {
      console.error("Failed to send invite email via Resend:", e);
    }
  }

  // Always log to console for dev
  console.log("\n" + "=".repeat(60));
  console.log("📨 USER INVITED");
  console.log(`Email: ${email}`);
  console.log(`Role: ${role}`);
  console.log(`Temporary Password: ${tempPassword}`);
  console.log("=".repeat(60) + "\n");

  return { success: true };
}
