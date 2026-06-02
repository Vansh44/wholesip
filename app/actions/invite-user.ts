"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { siteConfig } from "@/config/site";

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
        from: "Soakd Dashboard <admin@getsoakd.in>",
        to: email,
        subject: "Welcome to Soakd Dashboard",
        html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      
      <div style="background: #ffffff; padding: 24px; text-align: center;">
        <img
          src="${siteConfig.assets.logoUrl}"
          alt="Soakd"
          style="
            max-height: 80px;
            width: auto;
            display: block;
            margin: 0 auto;
          "
        />
      </div>

      <div style="padding: 32px 24px;">
        <h2 style="margin-top: 0;">You've Been Invited 🎉</h2>

        <p>Hello,</p>

        <p>
          You have been invited to join the <strong>Soakd Admin Dashboard</strong>
          as a <strong>${role}</strong>.
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
            <strong>Email:</strong> ${email}
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
            href="https://getsoakd.in/dashboard"
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
          <strong>Team Soakd</strong>
        </p>
      </div>
    </div>
  `,
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
