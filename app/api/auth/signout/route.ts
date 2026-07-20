// Phase 6 — clear the Firebase session cookie. The client also calls the
// Firebase client SDK's signOut(); this route removes the httpOnly server
// cookie. The delete must carry the SAME domain/path attributes the cookie was
// set with, or the cross-subdomain (.storemink.com) cookie won't be removed.

import { type NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session-cookie";

export async function POST(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(host),
    maxAge: 0,
  });
  return res;
}
