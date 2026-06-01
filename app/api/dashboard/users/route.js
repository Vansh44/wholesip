import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// Initialize Admin Supabase Client using Service Role Key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith("http")
  ? process.env.NEXT_PUBLIC_SUPABASE_URL
  : "https://placeholder-project.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-key";
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Initialize Resend Client
const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder_key");

// Helper: Verify if the request is from an authorized Superadmin
async function checkSuperadmin(req) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }
    const token = authHeader.split(" ")[1];

    // Get user from token
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return null;

    // Check role in profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.role !== "superadmin") {
      return null;
    }

    return user;
  } catch (err) {
    console.error("Auth check failed:", err);
    return null;
  }
}

// Generate randomized temporary password
function generateTempPassword() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
  let password = "";
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// POST: Add new User (Superadmin and Member)
export async function POST(req) {
  try {
    // 1. Authenticate initiating user
    const initiator = await checkSuperadmin(req);
    if (!initiator) {
      return NextResponse.json({ error: "Unauthorized. Superadmin privilege required." }, { status: 403 });
    }

    // 2. Parse request parameters
    const { email, role } = await req.json();
    if (!email || !role || !["superadmin", "member"].includes(role)) {
      return NextResponse.json({ error: "Invalid payload. Provide a valid email and role." }, { status: 400 });
    }

    // 3. Generate credentials
    const tempPassword = generateTempPassword();

    // 4. Create User in Supabase Auth
    const { data: newAuthUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const userId = newAuthUser.user.id;

    // 5. Create Profile (with must_change_password set to true)
    // Note: Due to the trigger we wrote, a profile row might already be automatically created.
    // Let's do an UPSERT to update the defaults or handle the row gracefully.
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        email: email,
        role: role,
        must_change_password: true,
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      // Cleanup auth user if profile insertion failed to keep integrity
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: "Failed to create user profile database entry." }, { status: 500 });
    }

    // 6. Deliver Invitation Credentials
    const loginLink = `${req.nextUrl.origin}/dashboard/login`;
    const emailSubject = "Invitation to Join the soakd Admin Dashboard";
    const emailText = `Hello,\n\nYou have been invited to join the soakd admin dashboard as a ${role}.\n\nYour temporary login credentials are:\nEmail: ${email}\nTemporary Password: ${tempPassword}\n\nLogin here to set up your account: ${loginLink}\n\nFor security reasons, you will be prompted to set a new password on your first sign-in.`;

    const isResendAvailable =
      process.env.RESEND_API_KEY &&
      process.env.RESEND_API_KEY !== "your_resend_api_key_here";

    if (isResendAvailable) {
      try {
        await resend.emails.send({
          from: "soakd Catalog <onboarding@resend.dev>",
          to: email,
          subject: emailSubject,
          text: emailText
        });
        console.log(`Invitation email dispatched via Resend successfully to ${email}.`);
      } catch (mailErr) {
        console.error("Resend failed to deliver invitation email:", mailErr);
      }
    }

    // ALWAYS log details to console for development verification
    console.log("\n========================================================");
    console.log("📨 USER INVITED SUCCESSFULLY");
    console.log(`Email: ${email}`);
    console.log(`Role: ${role}`);
    console.log(`Temporary Password: ${tempPassword}`);
    console.log(`Access Link: ${loginLink}`);
    console.log("========================================================\n");

    return NextResponse.json({
      success: true,
      message: `User created. Credentials printed to server logs. ${isResendAvailable ? "Invitation email sent via Resend." : ""}`
    });

  } catch (err) {
    console.error("API handler error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE: Remove User
export async function DELETE(req) {
  try {
    // 1. Authenticate initiating user
    const initiator = await checkSuperadmin(req);
    if (!initiator) {
      return NextResponse.json({ error: "Unauthorized. Superadmin privilege required." }, { status: 403 });
    }

    // 2. Parse query parameters
    const { searchParams } = new URL(req.url);
    const userIdToDelete = searchParams.get("id");

    if (!userIdToDelete) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    // 3. Avoid self-deletion
    if (initiator.id === userIdToDelete) {
      return NextResponse.json({ error: "Self-deletion is forbidden." }, { status: 400 });
    }

    // 4. Delete user from Supabase Auth (cascades to profiles)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userIdToDelete);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "User deleted successfully." });

  } catch (err) {
    console.error("API delete error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
