import "server-only";

import { sql } from "drizzle-orm";
import { withService } from "@/lib/db/client";

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
    const result = await withService((db) =>
      db.execute(
        sql`select check_rate_limit(p_key => ${key}, p_max => ${max}, p_window_seconds => ${windowSeconds}) as allowed`,
      ),
    );
    const allowed = (result.rows[0] as { allowed: boolean | null } | undefined)
      ?.allowed;
    return { allowed: allowed === true };
  } catch (e) {
    // Fail OPEN — a transient DB hiccup must not lock everyone out.
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
