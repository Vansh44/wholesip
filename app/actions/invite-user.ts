"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { wrapBrandedEmail } from "@/lib/email/layout";
import { randomInt } from "crypto";

function generateTempPassword(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
  let password = "";
  for (let i = 0; i < 16; i++) {
    // randomInt is cryptographically secure (unlike Math.random).
    password += chars.charAt(randomInt(chars.length));
  }
  return password;
}

/** Escape user-supplied values before interpolating into email HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function inviteUser(formData: FormData) {
  const firstName = formData.get("firstName") as string;
  const lastName = (formData.get("lastName") as string) || null;
  const email = formData.get("email") as string;
  const role = formData.get("role") as string;

  if (!firstName || !firstName.trim()) {
    return { error: "First name is required." };
  }

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
    .from("admins")
    .select("role, store_id")
    .eq("id", caller.id)
    .single();

  if (callerProfile?.role !== "superadmin") {
    return { error: "Unauthorized. Superadmin access required." };
  }

  // The invited admin joins the inviter's store.
  const storeId = callerProfile.store_id as string;

  const tempPassword = generateTempPassword();
  const adminClient = createAdminClient();

  // Reject emails already attached to a dashboard profile. Supabase Auth
  // blocks duplicate auth emails, but an auth account created without an email
  // (e.g. phone sign-up) can still collide at the profile layer.
  const normalizedEmail = email.trim().toLowerCase();
  const { data: existingProfile } = await adminClient
    .from("admins")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  if (existingProfile) {
    return { error: "A user with this email already exists." };
  }

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
  const { error: profileError } = await adminClient.from("admins").upsert({
    id: newUser.user.id,
    email: normalizedEmail,
    first_name: firstName.trim(),
    last_name: lastName?.trim() || null,
    role,
    force_password_reset: true,
    invited_by: caller.id,
    store_id: storeId,
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
        from: "WholeSip Dashboard <admin@wholesip.com>",
        to: email,
        subject: "Welcome to WholeSip Dashboard",
        html: wrapBrandedEmail(`
        <h2 style="margin-top: 0;">You've Been Invited 🎉</h2>

        <p>Hello ${escapeHtml(firstName)}${lastName ? " " + escapeHtml(lastName) : ""},</p>

        <p>
          You have been invited to join the <strong>WholeSip Admin Dashboard</strong>
          as a <strong>${escapeHtml(role)}</strong>.
        </p>

        <div
          style="
            background: #f8f8f8;
            border: 1px solid #e5e5e5;
            border-radius: 8px;
            padding: 20px;
            margin: 24px 0;
          "
        >
          <h3 style="margin-top: 0;">Temporary Login Credentials</h3>

          <p style="margin: 8px 0;">
            <strong>Email:</strong> ${escapeHtml(email)}
          </p>

          <p style="margin: 8px 0;">
            <strong>Password:</strong>
            <span
              style="
                font-family: monospace;
                background: #fff;
                padding: 4px 8px;
                border-radius: 4px;
                border: 1px solid #ddd;
              "
            >
              ${tempPassword}
            </span>
          </p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a
            href="https://wholesip.com/dashboard"
            style="
              display: inline-block;
              background: #000;
              color: #fff;
              text-decoration: none;
              padding: 14px 28px;
              border-radius: 6px;
              font-weight: 600;
            "
          >
            Sign In to Dashboard
          </a>
        </div>

        <p>
          You'll be prompted to set a new password when you sign in for the first time.
        </p>

        <p>
          Regards,<br />
          <strong>Team WholeSip</strong>
        </p>
      `),
      });
    } catch (e) {
      console.error("Failed to send invite email via Resend:", e);
    }
  }

  // Dev fallback only: if no email provider is configured there is no other
  // way to deliver the credential, so print it. Never log the password when an
  // email was actually sent (avoids plaintext credentials in production logs).
  if (!isResendAvailable) {
    console.log("\n" + "=".repeat(60));
    console.log("📨 USER INVITED (email not configured — dev fallback)");
    console.log(`Email: ${email}`);
    console.log(`Role: ${role}`);
    console.log(`Temporary Password: ${tempPassword}`);
    console.log("=".repeat(60) + "\n");
  }

  return { success: true };
}
