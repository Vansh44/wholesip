import { createBrowserClient } from "@supabase/ssr";
import { cookieDomainForHost } from "@/lib/store/host";

export function createClient() {
  const domain =
    typeof window !== "undefined"
      ? cookieDomainForHost(window.location.host)
      : undefined;

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key",
    domain ? { cookieOptions: { domain } } : undefined,
  );
}
