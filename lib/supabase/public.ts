import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// A cookie-free, anonymous Supabase client for cached PUBLIC storefront reads.
//
// Why a separate client: the cookie-bound server client (./server.ts) reads
// `cookies()`, which opts the calling route into dynamic rendering and is not
// allowed inside an `unstable_cache`/`use cache` scope. This client reads no
// request state, so its callers can be wrapped in `unstable_cache` and the
// storefront pages can be statically/ISR rendered.
//
// Only use this for data that is safe to serve from a shared cache to every
// visitor — i.e. published catalog/blog/category content that anon RLS already
// exposes. Never use it for per-user data (carts, profiles, draft previews):
// use ./server.ts (cookie-bound) for those so RLS scopes to the signed-in user.
let client: ReturnType<typeof createSupabaseClient> | null = null;

export function createPublicClient() {
  // Reuse a single stateless instance across calls (no session, no refresh).
  if (client) return client;
  client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return client;
}
