import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitOptions {
  /** Max requests allowed inside the window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
}

/**
 * Shared, cross-instance rate limiter backed by Postgres (see
 * supabase/rate_limits.sql). Use this for abuse-prone endpoints — public
 * forms, uploads, image processing — where an in-memory limiter would be
 * useless because each serverless instance has its own memory.
 *
 * Fails OPEN: if the DB call errors we allow the request rather than locking
 * everyone out on a transient hiccup. The limiter is a guard rail, not the
 * primary correctness boundary (auth + validation still apply).
 */
export async function rateLimit(
  key: string,
  { max, windowSeconds }: RateLimitOptions,
): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("rateLimit RPC error (failing open):", error.message);
      return { allowed: true };
    }
    return { allowed: data === true };
  } catch (e) {
    console.error("rateLimit threw (failing open):", e);
    return { allowed: true };
  }
}

/**
 * Best-effort client IP from proxy headers. Vercel/most hosts set
 * `x-forwarded-for`; the first entry is the originating client.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "unknown";
}
