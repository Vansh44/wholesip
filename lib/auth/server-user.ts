// The single server-side identity seam (GCP migration — see
// docs/gcp-migration-phase5-6.md §5.3).
//
// WHY THIS EXISTS: Phase 5 moves the database to Cloud SQL, where tenant
// isolation is enforced by a per-request `SET LOCAL app.current_user_id = <uid>`
// (the 2A model). That wrapper needs ONE thing: a *verified* user id. It does
// not care whether the id came from Supabase or, later, Google Identity
// Platform. So every server caller that needs "who is signed in" goes through
// THIS function instead of calling Supabase auth directly:
//   * Phase 5 — internals verify the Supabase session (below).
//   * Phase 6 — swap ONLY these internals to Identity Platform; callers unchanged.
//
// Keep this the ONLY place server code reads the authenticated identity, so the
// provider swap in Phase 6 is a one-file change.

import { createClient } from "@/lib/supabase/server";

export interface ServerUser {
  /** Stable user id — the value fed to `SET LOCAL app.current_user_id`. */
  id: string;
  /** Used by platform-admin checks (`auth.email()` → GUC in the RLS shim). */
  email: string | null;
  phone: string | null;
  /** True once the phone is OTP-verified (the signup wizard gates on this). */
  phoneConfirmed: boolean;
  /** OAuth/profile metadata (e.g. Google name prefill during signup). */
  metadata: Record<string, unknown>;
}

/**
 * The authenticated server-side user, or null when there is no valid session.
 * Validates the session with the auth server (not just a cookie read).
 */
export async function getServerUser(): Promise<ServerUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    phoneConfirmed: Boolean(user.phone_confirmed_at),
    metadata: (user.user_metadata ?? {}) as Record<string, unknown>,
  };
}

/** Convenience: just the verified id (the common case for DB scoping). */
export async function getServerUserId(): Promise<string | null> {
  return (await getServerUser())?.id ?? null;
}
