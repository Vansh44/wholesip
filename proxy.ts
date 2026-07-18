import { type NextRequest, NextResponse } from "next/server";
import { parseHost, isHelpHost } from "@/lib/store/host";
import { logError } from "@/lib/observability/logger";
import { SESSION_COOKIE, verifySessionCookie } from "@/lib/auth/session-cookie";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");

  // --- Static public assets (e.g. /themes/arcade/preview.webp, svgs) ---
  // Serve them as-is on EVERY host. Without this, the platform/help rewrites
  // below would map /themes/... to /platform/themes/... and 404 the file.
  // Anything with a file extension is a public asset (app routes never have
  // dots except robots.txt/sitemap.xml, which should also skip the rewrite —
  // they're host-aware app routes at the root).
  if (/\.[a-z0-9]+$/i.test(pathname)) {
    return NextResponse.next();
  }

  // --- Help centre: help.storemink.com -> /help/* ---
  if (isHelpHost(host) && !pathname.startsWith("/help")) {
    const url = request.nextUrl.clone();
    url.pathname = `/help${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // --- Platform (storemink.com / app.* / localhost / preview): landing, login,
  //     signup. Rewrite all paths into the /platform/* route group so the
  //     storefront `/`, `/shop`, ... routes only ever serve store hosts. ---
  if (parseHost(host).type === "platform") {
    if (pathname.startsWith("/platform")) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `/platform${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // --- Store hosts ({slug}.storemink.com / custom domains) ---
  // Only the dashboard + auth routes need the session gate; the storefront stays
  // anonymous + cache-friendly (no per-request auth check).
  if (!pathname.startsWith("/dashboard") && !pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  try {
    // Verify the Firebase session cookie (Node runtime — see the file-level note
    // in lib/auth/session-cookie.ts). role / force_password_reset ride in the
    // cookie's custom claims, so gating needs NO DB query.
    const session = request.cookies.get(SESSION_COOKIE)?.value;
    const user = await verifySessionCookie(session);

    const redirectTo = (path: string) => {
      const url = request.nextUrl.clone();
      url.pathname = path;
      return NextResponse.redirect(url);
    };

    // --- Gate 1: Auth check for /dashboard routes ---
    if (pathname.startsWith("/dashboard")) {
      if (!user) return redirectTo("/auth/login");

      // --- Gate 2: Force password reset ---
      if (user.claims.forcePasswordReset) return redirectTo("/auth/set-password");

      // --- Gate 3: Role-based access for restricted dashboard routes ---
      if (
        (pathname.startsWith("/dashboard/users") ||
          pathname.startsWith("/dashboard/media")) &&
        user.claims.role !== "superadmin"
      ) {
        return redirectTo("/dashboard");
      }
    }

    // --- Gate for /auth/set-password: must be authenticated ---
    if (pathname === "/auth/set-password" && !user) {
      return redirectTo("/auth/login");
    }

    // --- Redirect authenticated users away from login page ---
    if (pathname === "/auth/login" && user) {
      return redirectTo(
        user.claims.forcePasswordReset ? "/auth/set-password" : "/dashboard",
      );
    }

    return NextResponse.next();
  } catch (error: unknown) {
    logError("proxy: middleware exception", error, { path: pathname, host });
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
