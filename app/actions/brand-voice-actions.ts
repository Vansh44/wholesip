"use server";

import { eq } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { storeBrandProfiles, stores } from "@/drizzle/schema";
import { getActingStoreId, getManagerUserId } from "@/app/dashboard/lib/access";
import { callGemini } from "@/lib/ai/gemini";
import {
  consumeAiQuota,
  getAiUsage,
  type AiUsageSummary,
} from "@/lib/ai/quota";
import {
  getBrandVoiceProfile,
  normalizeStructured,
  type BrandVoiceStructured,
} from "@/lib/ai/brand-voice";

// Brand voice — the per-store identity every AI copy feature speaks from.
// Edited at /dashboard/branding: the merchant answers five plain questions,
// optionally lets Gemini compose a proper brand guide from them, reviews it,
// and saves. Saving stores BOTH the guide (content) and the answers
// (structured), so the guided setup can be re-run and refined later.

export interface ActionResult {
  success?: boolean;
  error?: string;
}

export interface BrandVoiceEditorData {
  content: string;
  structured: BrandVoiceStructured;
  usage: AiUsageSummary;
}

// Pre-fill for the branding page (the page enforces view permission).
export async function getBrandVoiceForEditor(): Promise<BrandVoiceEditorData> {
  const storeId = await getActingStoreId();
  const [profile, usage] = await Promise.all([
    getBrandVoiceProfile(storeId),
    getAiUsage(storeId),
  ]);
  return { ...profile, usage };
}

const MAX_CONTENT = 20_000;

export async function saveBrandVoice(input: {
  content: string;
  structured: BrandVoiceStructured;
}): Promise<ActionResult> {
  const userId = await getManagerUserId("branding");
  if (!userId) return { error: "Not authenticated" };

  const content = (
    typeof input?.content === "string" ? input.content : ""
  ).trim();
  if (content.length > MAX_CONTENT) {
    return {
      error: `Brand guide is too long (max ${MAX_CONTENT.toLocaleString()} characters).`,
    };
  }
  const structured = normalizeStructured(input?.structured);

  const storeId = await getActingStoreId();
  const updateFields = {
    contentMd: content,
    structured,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  };
  try {
    // One row per store: upsert keyed on store_id (store_brand_profiles is
    // service-only — the manage check above is the gate).
    await withService((db) =>
      db
        .insert(storeBrandProfiles)
        .values({ storeId, ...updateFields })
        .onConflictDoUpdate({
          target: storeBrandProfiles.storeId,
          set: updateFields,
        }),
    );
  } catch (err) {
    console.error("saveBrandVoice:", err instanceof Error ? err.message : err);
    return { error: "Could not save your brand voice. Please try again." };
  }
  return { success: true };
}

// The strategist persona is FIXED (platform asset) — only the answers vary.
const STRATEGIST_SYSTEM = `You are a seasoned brand strategist who writes brand voice guides for small online stores. You turn a merchant's plain answers into a guide an AI copywriter can follow faithfully. You write clean markdown, you are concrete, and you never invent facts the merchant didn't give you.`;

/**
 * Compose a brand guide from the merchant's guided-setup answers. Returns the
 * draft for review — it is NOT saved until the merchant clicks save.
 */
export async function generateBrandVoice(
  raw: BrandVoiceStructured,
): Promise<{ content?: string; error?: string }> {
  const userId = await getManagerUserId("branding");
  if (!userId) return { error: "Not authenticated" };

  const s = normalizeStructured(raw);
  if (!s.sell) {
    return { error: "Tell us what you sell first — it anchors everything." };
  }

  const storeId = await getActingStoreId();
  const quota = await consumeAiQuota(storeId);
  if (!quota.allowed) return { error: quota.error };

  let storeName = "this store";
  try {
    const rows = await withService((db) =>
      db
        .select({ name: stores.name })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1),
    );
    storeName = rows[0]?.name || "this store";
  } catch (err) {
    console.error("generateBrandVoice store read:", err);
  }

  const answers = [
    `Store name: ${storeName}`,
    `What it sells: ${s.sell}`,
    s.audience ? `Who buys it: ${s.audience}` : "",
    s.personality
      ? `Personality (the merchant's own words): ${s.personality}`
      : "",
    s.why ? `Why the brand exists: ${s.why}` : "",
    s.avoid ? `Words/claims the merchant wants avoided: ${s.avoid}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const userText = `Write a brand voice guide for the store below, in markdown, 250–400 words. Structure it as:

# ${storeName} — Brand Voice
## Who we are        (2–3 sentences: what we sell, who it's for, why we exist)
## How we sound      (voice + tone in concrete terms, with 2 short example lines that SOUND like this brand)
## Words we use      (a handful of words/phrases that fit)
## Words we avoid    (merchant's avoid-list plus hype/pressure words)
## Rules we never break
  (always include: use only provided product facts, never invent details or numbers, no medical or curative claims, no guilt or body-shaming, no fake urgency)

Use ONLY the merchant's answers below — do not invent products, history, or claims they didn't state. Output the markdown only: no preamble, no notes, no code fences.

MERCHANT'S ANSWERS:
${answers}`;

  const { text, error } = await callGemini(STRATEGIST_SYSTEM, userText, {
    temperature: 0.7,
    maxOutputTokens: 2048,
  });
  if (error) return { error };
  return { content: text };
}
