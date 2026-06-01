import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  try {
    const { supabase, user, supabaseResponse } = await updateSession(request);
    const pathname = request.nextUrl.pathname;

    // --- Gate 1: Auth check for /dashboard routes ---
    if (pathname.startsWith("/dashboard")) {
      if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = "/auth/login";
        return NextResponse.redirect(url);
      }

      // Fetch profile for role and force_password_reset checks
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, force_password_reset")
        .eq("id", user.id)
        .single();

      // If profile doesn't exist (table missing or no row), let the page handle it
      // Don't redirect — this prevents loops when profiles table isn't set up yet
      if (profile && !profileError) {
        // --- Gate 2: Force password reset ---
        if (profile.force_password_reset) {
          const url = request.nextUrl.clone();
          url.pathname = "/auth/set-password";
          return NextResponse.redirect(url);
        }

        // --- Gate 3: Role-based access for /dashboard/users ---
        if (
          pathname.startsWith("/dashboard/users") &&
          profile.role !== "superadmin"
        ) {
          const url = request.nextUrl.clone();
          url.pathname = "/dashboard";
          return NextResponse.redirect(url);
        }
      }
    }

    // --- Gate for /auth/set-password: must be authenticated ---
    if (pathname === "/auth/set-password") {
      if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = "/auth/login";
        return NextResponse.redirect(url);
      }
    }

    // --- Redirect authenticated users away from login page ---
    if (pathname === "/auth/login" && user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("force_password_reset")
        .eq("id", user.id)
        .single();

      // Only redirect away from login if we have a profile
      // If no profile exists, let them stay on login (avoids loop)
      if (profile) {
        const url = request.nextUrl.clone();
        if (profile.force_password_reset) {
          url.pathname = "/auth/set-password";
        } else {
          url.pathname = "/dashboard";
        }
        return NextResponse.redirect(url);
      }
    }

    return supabaseResponse;
  } catch (error: any) {
    return new NextResponse(
      JSON.stringify({
        error: "Middleware Exception",
        message: error?.message || error,
        stack: error?.stack,
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*"],
};

