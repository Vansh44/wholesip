import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Per-store brand voice — the identity text fed to Gemini as its system
// instruction for every AI copy feature. Replaces the old file-based
// brand/brand.md (now the WholeSip store's store_brand_profiles row).
//
// A store that hasn't set up its voice still gets USABLE copy: the generic
// default template below folds in whatever branding it already has (name,
// tagline, blurb), so AI features work out of the box and improve once the
// merchant runs the guided setup at /dashboard/branding.

// The guided-setup answers a brand guide is generated from (all optional).
export interface BrandVoiceStructured {
  sell?: string; // what the store sells
  audience?: string; // who buys it
  personality?: string; // e.g. "warm, honest, a little playful"
  avoid?: string; // words/claims to avoid
  why?: string; // why the brand exists
}

export interface BrandVoiceProfile {
  content: string; // the brand guide (markdown); "" when never saved
  structured: BrandVoiceStructured;
}

const STRUCTURED_KEYS: (keyof BrandVoiceStructured)[] = [
  "sell",
  "audience",
  "personality",
  "avoid",
  "why",
];

/** Coerce stored jsonb into a clean BrandVoiceStructured (junk-tolerant). */
export function normalizeStructured(raw: unknown): BrandVoiceStructured {
  const out: BrandVoiceStructured = {};
  if (raw && typeof raw === "object") {
    for (const key of STRUCTURED_KEYS) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) out[key] = v.trim().slice(0, 600);
    }
  }
  return out;
}

/**
 * The generic fallback soul for stores that haven't written a brand guide.
 * Deliberately safe: plain-spoken voice, no invented facts, no medical claims —
 * the same guardrails every store's AI copy must respect.
 */
export function defaultBrandSoul(
  storeName: string,
  tagline?: string | null,
  blurb?: string | null,
): string {
  const identity = [
    `You are the voice of **${storeName}**, an online store.`,
    tagline ? `Its tagline: "${tagline}".` : "",
    blurb ? `About the store: ${blurb}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `${identity}

Voice: warm, clear and honest. Write like a real person who knows the products well — plain words, short sentences, quietly confident. No hype ("insane", "unmissable", "game-changer"), no pressure tactics, no shouting.

Rules you never break:
1. Use ONLY the facts you are given about a product. If a detail isn't provided, leave it out — never invent an ingredient, number, or claim.
2. No medical or curative claims of any kind.
3. Respect the reader: no guilt, no body-shaming, no fear-selling.
4. Keep it concrete — name real things instead of reaching for buzzwords.`;
}

/**
 * The brand soul for a store: its saved brand guide when one exists, else the
 * generic default personalised with the store's branding. Never returns null —
 * AI features always have an identity to speak from.
 *
 * Reads with the service-role client (store_brand_profiles is service-role
 * only); callers are dashboard actions that have already passed an app-layer
 * manager check.
 */
export async function getBrandSoulForStore(storeId: string): Promise<string> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("store_brand_profiles")
    .select("content_md")
    .eq("store_id", storeId)
    .maybeSingle();
  const saved = (profile?.content_md as string | undefined)?.trim();
  if (saved) return saved;

  const { data: store } = await admin
    .from("stores")
    .select("name, settings")
    .eq("id", storeId)
    .maybeSingle();
  const brand =
    ((store?.settings as Record<string, unknown> | null)?.brand as Record<
      string,
      unknown
    >) ?? {};
  return defaultBrandSoul(
    (store?.name as string) || "this store",
    typeof brand.tagline === "string" ? brand.tagline : null,
    typeof brand.blurb === "string" ? brand.blurb : null,
  );
}

/** The stored profile for the dashboard editor (content + setup answers). */
export async function getBrandVoiceProfile(
  storeId: string,
): Promise<BrandVoiceProfile> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_brand_profiles")
    .select("content_md, structured")
    .eq("store_id", storeId)
    .maybeSingle();
  return {
    content: (data?.content_md as string) ?? "",
    structured: normalizeStructured(data?.structured),
  };
}
