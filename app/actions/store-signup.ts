"use server";

import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { STORE_TAG } from "@/lib/store/resolve";
import { ROOT_DOMAIN } from "@/lib/store/host";
import { slugify } from "@/lib/slug";
import { applyTheme } from "@/lib/themes/apply";
import { DEFAULT_THEME_ID } from "@/lib/themes/meta";
import { submitSitemapToGoogle, pingIndexNow } from "@/lib/seo/search-engines";

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
  // The demo- namespace belongs to theme demo stores (seedDemoStore).
  if (/^demo(-|$)/.test(slug)) {
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

export interface SignupResume {
  /** Whether there's an authenticated session (email/password or Google). */
  authenticated: boolean;
  /** Whether this account already owns a store (→ send them to the dashboard). */
  hasStore: boolean;
  /** The owned store's slug, when hasStore. */
  slug?: string;
  /** Whether the account's phone is OTP-verified already. */
  phoneConfirmed: boolean;
  email?: string;
  /** Name prefill (from Google profile metadata when signing in with Google). */
  firstName?: string;
  lastName?: string;
}

/**
 * What the signup wizard needs on load to resume: after a Google redirect (or a
 * refreshed tab), an account may already have a session — and possibly a store.
 * Lets the client jump straight to the phone/name step (prefilling the Google
 * name), or bounce a finished account to its dashboard.
 */
export async function getSignupResumeInfo(): Promise<SignupResume> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { authenticated: false, hasStore: false, phoneConfirmed: false };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("admins")
    .select("store_id")
    .eq("id", user.id)
    .maybeSingle();

  let slug: string | undefined;
  if (existing?.store_id) {
    const { data: store } = await admin
      .from("stores")
      .select("slug")
      .eq("id", existing.store_id)
      .maybeSingle();
    slug = (store?.slug as string) ?? undefined;
  }

  // Best-effort name prefill from OAuth profile metadata.
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const full = String(meta.full_name || meta.name || "").trim();
  const parts = full ? full.split(/\s+/) : [];
  const firstName = (meta.given_name as string) || parts[0] || undefined;
  const lastName =
    (meta.family_name as string) ||
    (parts.length > 1 ? parts.slice(1).join(" ") : undefined);

  return {
    authenticated: true,
    hasStore: !!existing?.store_id,
    slug,
    phoneConfirmed: !!user.phone_confirmed_at,
    email: user.email ?? undefined,
    firstName,
    lastName,
  };
}

export interface CreateStoreInput {
  /** Store display name (also seeds the subdomain slug). */
  name: string;
  /** Chosen theme/template id (see lib/themes/meta). */
  template?: string;
  /** Owner's first name (written to admins.first_name). */
  firstName?: string;
  /** Owner's last name (admins.last_name; optional). */
  lastName?: string;
  /** ISO country code the merchant sells from (settings.business.country). */
  country?: string;
  /** City the merchant sells from (settings.business.city; optional). */
  city?: string;
}

export interface CreateStoreResult {
  slug?: string;
  storeId?: string;
  error?: string;
}

/**
 * Provision a new store. Called AFTER the owner has phone-OTP-verified (so
 * there's an authenticated session — see the signup wizard). Creates the store,
 * makes the caller its superadmin (recording their name + selling location),
 * and returns the slug + id. Runs the writes via the service role because a
 * brand-new owner isn't yet a superadmin of any store (so RLS would block them).
 */
export async function createStore(
  input: CreateStoreInput,
): Promise<CreateStoreResult> {
  const rawName = input.name;
  const template = input.template || DEFAULT_THEME_ID;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Please sign in before creating a store." };
  }
  // The client wizard tracks verification in React state, which a caller can
  // bypass by invoking this action directly. Phone is the authoritative
  // verification (email confirmation is disabled — signup is phone-only), so a
  // store can't be provisioned without a confirmed phone number.
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

  // Where the merchant sells from — captured at signup, non-secret (it prints on
  // invoices later), so it lives in the anon-readable stores.settings jsonb
  // under `business` (never a secret — convention #9).
  const country = (input.country || "").trim().slice(0, 2).toUpperCase();
  const city = (input.city || "").trim().slice(0, 80);
  const business: Record<string, string> = {};
  if (country) business.country = country;
  if (city) business.city = city;

  // Create the store.
  const { data: store, error: storeErr } = await admin
    .from("stores")
    .insert({
      slug,
      name: rawName.trim(),
      status: "active",
      plan: "free",
      settings: {
        template,
        brand: { name: rawName.trim() },
        ...(Object.keys(business).length ? { business } : {}),
      },
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

  // Make the owner the store's superadmin, recording their name (falls back to
  // the email local-part so admins.first_name is never blank).
  const firstName =
    (input.firstName || "").trim() ||
    (user.email ? user.email.split("@")[0] : "Owner");
  const lastName = (input.lastName || "").trim() || null;
  const { error: adminErr } = await admin.from("admins").insert({
    id: user.id,
    email: user.email ?? "",
    role: "superadmin",
    store_id: store.id,
    first_name: firstName.slice(0, 80),
    last_name: lastName ? lastName.slice(0, 80) : null,
    // The owner set their own password during signup — the admins column
    // defaults force_password_reset=true (that's for INVITED staff who get a
    // temporary password), so override it here or the owner is bounced to
    // /auth/set-password on their first login.
    force_password_reset: false,
  });
  if (adminErr) {
    // Roll back the store so a retry isn't blocked by the now-taken slug.
    await admin.from("stores").delete().eq("id", store.id);
    console.error("createStore (admin insert):", adminErr.message);
    return { error: "Could not set up your store account. Please try again." };
  }

  // Seed the chosen theme: homepage + content pages (published), menus, brand
  // accents, and clearly-labeled sample products/categories — the merchant
  // starts by EDITING a real website, not building from a blank canvas.
  // Best-effort: a partial seed still leaves a working store, and applyTheme
  // is idempotent (upserts by store_id+slug) so it can be re-run.
  const seeded = await applyTheme(store.id, template, {
    publish: true,
    actorUserId: user.id,
  });
  if (!seeded.success) {
    console.error("createStore (theme seed):", seeded.errors.join(" | "));
  }

  // New store row is now resolvable — bust the cached store lookups.
  revalidateTag(STORE_TAG, "max");

  // Announce the new store to search engines so it's discovered without waiting
  // for organic crawl. Runs after the response (never blocks signup) and is
  // best-effort/dormant until the platform's Search Console + IndexNow env is
  // configured. Google then finds all future content via the dynamic sitemap.
  const storeUrl = `https://${store.slug}.${ROOT_DOMAIN}`;
  after(async () => {
    await Promise.allSettled([
      submitSitemapToGoogle(`${storeUrl}/sitemap.xml`),
      pingIndexNow([`${storeUrl}/`]),
    ]);
  });

  return { slug: store.slug as string, storeId: store.id as string };
}
