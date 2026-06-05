import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  try {
    const { supabase, user, supabaseResponse, claims } =
      await updateSession(request);
    const pathname = request.nextUrl.pathname;

    // Resolve role / force_password_reset from JWT claims when available
    // (no DB query). Falls back to a profiles lookup when the custom access
    // token hook isn't enabled or the token is legacy — keeps behaviour
    // identical during/without migration.
    async function getProfileState(): Promise<{
      role: string | null;
      forcePasswordReset: boolean;
      exists: boolean;
    } | null> {
      if (claims.hasClaims) {
        return {
          role: claims.role,
          forcePasswordReset: claims.forcePasswordReset,
          exists: claims.role !== null,
        };
      }
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, force_password_reset")
        .eq("id", user!.id)
        .single();
      if (!profile || error) return null;
      return {
        role: profile.role,
        forcePasswordReset: profile.force_password_reset,
        exists: true,
      };
    }

    // --- Gate 1: Auth check for /dashboard routes ---
    if (pathname.startsWith("/dashboard")) {
      if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = "/auth/login";
        return NextResponse.redirect(url);
      }

      const state = await getProfileState();

      // If profile doesn't exist (table missing or no row), let the page handle it
      // Don't redirect — this prevents loops when profiles table isn't set up yet
      if (state && state.exists) {
        // --- Gate 2: Force password reset ---
        if (state.forcePasswordReset) {
          const url = request.nextUrl.clone();
          url.pathname = "/auth/set-password";
          return NextResponse.redirect(url);
        }

        // --- Gate 3: Role-based access for restricted dashboard routes ---
        if (
          (pathname.startsWith("/dashboard/users") ||
            pathname.startsWith("/dashboard/media")) &&
          state.role !== "superadmin"
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
      const state = await getProfileState();

      // Only redirect away from login if we have a profile
      // If no profile exists, let them stay on login (avoids loop)
      if (state && state.exists) {
        const url = request.nextUrl.clone();
        if (state.forcePasswordReset) {
          url.pathname = "/auth/set-password";
        } else {
          url.pathname = "/dashboard";
        }
        return NextResponse.redirect(url);
      }
    }

    return supabaseResponse;
  } catch (error: unknown) {
    // Log details server-side only; never leak messages/stack traces to clients.
    console.error("Middleware exception:", error);
    return new NextResponse(
      JSON.stringify({ error: "Internal Server Error" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*"],
};
