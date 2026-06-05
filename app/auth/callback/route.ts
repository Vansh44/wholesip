import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns a safe same-origin redirect path. Rejects absolute URLs and
 * protocol-relative (`//host`) values that would otherwise resolve off-site
 * via `new URL(next, origin)`, preventing open-redirect phishing.
 */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard";
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

  // return the user to an error page with instructions
  return NextResponse.redirect(
    new URL("/auth/login?error=Invalid+or+expired+link", requestUrl.origin),
  );
}
