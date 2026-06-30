import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { parseHost, isHelpHost } from "@/lib/store/host";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host");

  // --- Help centre: help.storiq.in -> /help/* ---
  if (isHelpHost(host) && !pathname.startsWith("/help")) {
    const url = request.nextUrl.clone();
    url.pathname = `/help${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // --- Platform (storiq.in / app.* / localhost / preview): landing, login,
  //     signup. Rewrite all paths into the /platform/* route group so the
  //     storefront `/`, `/shop`, ... routes only ever serve store hosts. ---
  if (parseHost(host).type === "platform") {
    if (pathname.startsWith("/platform")) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `/platform${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // --- Store hosts ({slug}.storiq.in / custom domains) ---
  // Only the dashboard + auth routes need the Supabase session gate; the
  // storefront stays anonymous + cache-friendly (no per-request auth check).
  if (!pathname.startsWith("/dashboard") && !pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  try {
    const { supabase, user, supabaseResponse, claims } =
      await updateSession(request);

    // Resolve role / force_password_reset from JWT claims when available
    // (no DB query), falling back to a profiles lookup otherwise.
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
      if (state && state.exists) {
        const url = request.nextUrl.clone();
        url.pathname = state.forcePasswordReset
          ? "/auth/set-password"
          : "/dashboard";
        return NextResponse.redirect(url);
      }
    }

    return supabaseResponse;
  } catch (error: unknown) {
    console.error("Middleware exception:", error);
    return new NextResponse(
      JSON.stringify({ error: "Internal Server Error" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
}

export const config = {
  // Run on everything except Next internals, static files, and API routes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
