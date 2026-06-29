"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/slug";

// Subdomains we can never hand out (platform-reserved or operational).
const RESERVED = new Set([
  "www",
  "app",
  "help",
  "api",
  "admin",
  "dashboard",
  "auth",
  "mail",
  "email",
  "smtp",
  "ftp",
  "blog",
  "status",
  "support",
  "billing",
  "account",
  "accounts",
  "login",
  "signup",
  "store",
  "stores",
  "storiq",
  "assets",
  "cdn",
  "static",
  "media",
  "img",
  "images",
]);

export interface SlugCheck {
  slug: string;
  available: boolean;
  reason?: string;
}

/**
 * Live store-name → subdomain availability check for signup. Derives the slug
 * from what the user typed, validates its shape, rejects reserved names, then
 * checks (via the service role, so pending/suspended stores count too) whether
 * any store already owns it.
 */
export async function checkStoreSlugAvailability(
  raw: string,
): Promise<SlugCheck> {
  const slug = slugify(raw || "");

  if (!slug) {
    return { slug, available: false, reason: "Enter a store name." };
  }
  if (slug.length < 3) {
    return { slug, available: false, reason: "At least 3 characters." };
  }
  if (slug.length > 40) {
    return { slug, available: false, reason: "Too long (40 characters max)." };
  }
  if (RESERVED.has(slug)) {
    return { slug, available: false, reason: "This name is reserved." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("stores")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("checkStoreSlugAvailability:", error.message);
    return { slug, available: false, reason: "Couldn't check right now." };
  }
  if (data) {
    return { slug, available: false, reason: "This name is not available." };
  }
  return { slug, available: true };
}
