import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieDomainForHost } from "@/lib/store/host";

/**
 * Custom claims injected by the `custom_access_token_hook` Postgres function
 * (see supabase/custom_access_token_hook.sql). Absent until that hook is
 * enabled in the Supabase dashboard.
 */
export type SessionClaims = {
  role: string | null;
  forcePasswordReset: boolean;
  // false when the JWT carries no custom claims (hook not enabled / legacy
  // token) — callers should fall back to a DB lookup in that case.
  hasClaims: boolean;
};

// Decode a JWT payload without verifying the signature. Safe here because the
// token was already validated by `auth.getUser()`; we only read its claims.
function decodeClaims(token: string | undefined): SessionClaims {
  const empty: SessionClaims = {
    role: null,
    forcePasswordReset: false,
    hasClaims: false,
  };
  if (!token) return empty;

  const payload = token.split(".")[1];
  if (!payload) return empty;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const json = JSON.parse(atob(padded)) as Record<string, unknown>;

    const hasClaims = "user_role" in json || "force_password_reset" in json;
    if (!hasClaims) return empty;

    return {
      role: typeof json.user_role === "string" ? json.user_role : null,
      forcePasswordReset: json.force_password_reset === true,
      hasClaims: true,
    };
  } catch {
    return empty;
  }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const domain = cookieDomainForHost(request.headers.get("host"));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(domain ? { cookieOptions: { domain } } : {}),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Authoritative auth check (validates the token with the auth server).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Read role/force_password_reset from the (already-validated) JWT claims
  // instead of querying the DB on every request. getSession() is a local
  // cookie read — no network call.
  let claims: SessionClaims = {
    role: null,
    forcePasswordReset: false,
    hasClaims: false,
  };
  if (user) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    claims = decodeClaims(session?.access_token);
  }

  return { supabase, user, supabaseResponse, claims };
}
