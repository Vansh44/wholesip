"use server";

import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { STORE_TAG } from "@/lib/store/resolve";
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
  "storemink",
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

export interface CreateStoreResult {
  slug?: string;
  error?: string;
}

/**
 * Provision a new store. Called AFTER the owner has OTP-verified (so there's an
 * authenticated session). Creates the store, makes the caller its superadmin,
 * and returns the slug. Runs the writes via the service role because a brand-new
 * owner isn't yet a superadmin of any store (so RLS would block them).
 */
export async function createStore(
  rawName: string,
  template: string = "arcade",
): Promise<CreateStoreResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Please verify your email before creating a store." };
  }
  // The client wizard tracks verification in React state, which a caller can
  // bypass by invoking this action directly. Re-check the authoritative flags
  // on the auth user so a store can't be provisioned without a confirmed
  // email AND phone.
  if (!user.email_confirmed_at) {
    return { error: "Please verify your email before creating a store." };
  }
  if (!user.phone_confirmed_at) {
    return {
      error: "Please verify your phone number before creating a store.",
    };
  }

  // Authoritative re-check (the client check is just for live feedback).
  const check = await checkStoreSlugAvailability(rawName);
  if (!check.available) {
    return { error: check.reason ?? "This name is not available." };
  }
  const slug = check.slug;

  const admin = createAdminClient();

  // One store per owner for now (admins.id is the auth user id).
  const { data: existing } = await admin
    .from("admins")
    .select("store_id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) {
    return { error: "This account already has a store." };
  }

  // Create the store.
  const { data: store, error: storeErr } = await admin
    .from("stores")
    .insert({
      slug,
      name: rawName.trim(),
      status: "active",
      plan: "free",
      settings: { template, brand: { name: rawName.trim() } },
    })
    .select("id, slug")
    .single();
  if (storeErr || !store) {
    if (storeErr?.code === "23505") {
      return { error: "That name was just taken — try another." };
    }
    console.error("createStore (store insert):", storeErr?.message);
    return { error: "Could not create your store. Please try again." };
  }

  // Seed the homepage as a store_pages row (slug "" — the homepage sentinel,
  // edited in /dashboard/builder like any page) with a default promo banner so
  // the new store's homepage isn't totally empty. Published immediately.
  const welcomeBanner = [
    {
      id: crypto.randomUUID(),
      type: "promo_banner",
      enabled: true,
      config: {
        image_url: "",
        heading: `Welcome to ${rawName.trim()}`,
        subtext: "We're getting things ready. Check back soon!",
        cta_label: "Shop Now",
        cta_href: "/shop",
        alignment: "center",
        theme: "light",
      },
    },
  ];
  await admin.from("store_pages").insert({
    store_id: store.id,
    slug: "",
    title: "Home",
    status: "published",
    sections: welcomeBanner,
    published_sections: welcomeBanner,
    published_at: new Date().toISOString(),
    created_by: user.id,
    updated_by: user.id,
  });

  // Make the owner the store's superadmin.
  const { error: adminErr } = await admin.from("admins").insert({
    id: user.id,
    email: user.email ?? "",
    role: "superadmin",
    store_id: store.id,
  });
  if (adminErr) {
    // Roll back the store so a retry isn't blocked by the now-taken slug.
    await admin.from("stores").delete().eq("id", store.id);
    console.error("createStore (admin insert):", adminErr.message);
    return { error: "Could not set up your store account. Please try again." };
  }

  // New store row is now resolvable — bust the cached store lookups.
  revalidateTag(STORE_TAG, "max");
  return { slug: store.slug as string };
}
