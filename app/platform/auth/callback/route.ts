import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Platform-host OAuth/OTP callback.
//
// On the platform host (storemink.com / localhost), proxy.ts rewrites EVERY
// non-/platform path into /platform/*, so the store-host callback at
// app/auth/callback is NOT reachable here — a Google sign-in started from
// /signup lands on this route (the browser hits /auth/callback, which the proxy
// rewrites to /platform/auth/callback). It exchanges the PKCE code for a
// session, then bounces back into the signup wizard, which resumes at the phone
// step once it sees the authenticated session.

/**
 * Returns a safe same-origin redirect path. Rejects absolute + protocol-
 * relative values that would resolve off-site via new URL(next, origin),
 * preventing open-redirect phishing. Defaults into the signup wizard.
 */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/signup";
  }
  return next;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNext(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  // Fall back to the signup page with an error hint if the exchange failed.
  return NextResponse.redirect(
    new URL("/signup?error=Google+sign-in+failed", requestUrl.origin),
  );
}
