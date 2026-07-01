"use server";

import { after } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";
import { callGemini, brandSystemText, loadBrandSoul } from "@/lib/ai/gemini";
import { triggerEmailWorker } from "@/lib/email/trigger-worker";
import {
  mergeTokens,
  renderCouponEmail,
  type CouponEmailContent,
} from "@/lib/email/coupon-campaign";
import { getStoreBrand } from "@/lib/store/brand";

const RECIPIENT_PAGE_SIZE = 50;

/** Strip PostgREST filter-control chars so a search term can't break `.or()`. */
function sanitizeSearch(q: string): string {
  return q
    .replace(/[(),:*%\\]/g, " ")
    .trim()
    .slice(0, 100);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmailAudience =
  | { mode: "all" }
  | { mode: "group"; groupId: string }
  | { mode: "specific"; customerIds: string[] };

export interface RecipientOption {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string;
}

export interface GenerateEmailInput {
  code: string;
  description?: string | null;
  discountLabel: string; // e.g. "25% off" / "₹100 off"
  validUntilLabel?: string | null;
  audienceLabel: string; // e.g. "VIP shoppers" — helps the AI set the tone
  instructions?: string; // optional extra steer from the admin
}

export interface GenerateEmailResult {
  subject?: string;
  body?: string;
  error?: string;
}

export interface SendEmailInput {
  subject: string;
  body: string;
  code: string;
  discountLabel: string;
  validUntilLabel?: string | null;
  audience: EmailAudience;
}

export interface SendEmailResult {
  /** Recipients (with an email) queued for background sending. */
  queued?: number;
  skippedNoEmail?: number;
  error?: string;
}

export interface ListRecipientsResult {
  customers: RecipientOption[];
  /** Total customers with an email on file (for the "all" audience count). */
  total: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Recipients — searched server-side by the email dialog's "specific" picker.
// Returns at most RECIPIENT_PAGE_SIZE matches so it stays fast with 100k+
// customers (never loads the whole table into the browser).
// ---------------------------------------------------------------------------

export async function listEmailRecipients(
  search = "",
): Promise<ListRecipientsResult> {
  const userId = await getManagerUserId("marketing");
  if (!userId) return { customers: [], total: 0, error: "Not authenticated" };

  const admin = createAdminClient();

  // Count of all emailable customers — drives the "all customers" estimate.
  const { count: total } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .not("email", "is", null);

  let query = admin
    .from("users")
    .select("id, first_name, last_name, email, phone")
    .not("email", "is", null)
    .order("created_at", { ascending: false })
    .limit(RECIPIENT_PAGE_SIZE);

  const term = sanitizeSearch(search);
  if (term) {
    const like = `*${term}*`;
    query = query.or(
      `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`,
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("listEmailRecipients error:", error);
    return {
      customers: [],
      total: total ?? 0,
      error: "Could not load customers.",
    };
  }

  return {
    total: total ?? 0,
    customers: (data ?? []).map((c) => ({
      id: c.id as string,
      first_name: (c.first_name as string) ?? "",
      last_name: (c.last_name as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      phone: (c.phone as string) ?? "",
    })),
  };
}

// ---------------------------------------------------------------------------
// AI generation — one templated email body with a {{first_name}} merge tag.
// ---------------------------------------------------------------------------

const EMAIL_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
};

export async function generateCouponEmail(
  input: GenerateEmailInput,
): Promise<GenerateEmailResult> {
  const userId = await getManagerUserId("marketing");
  if (!userId) return { error: "Not authenticated" };

  const brand = await loadBrandSoul();
  if (!brand) {
    return {
      error:
        "brand/brand.md is missing or empty. Paste your brand guide first.",
    };
  }

  const facts = [
    `Coupon code: ${input.code}`,
    `Offer: ${input.discountLabel}`,
    input.validUntilLabel ? `Valid until: ${input.validUntilLabel}` : "",
    input.description
      ? `Internal note about the coupon: ${input.description}`
      : "",
    `Audience: ${input.audienceLabel}`,
    input.instructions
      ? `Extra direction from the team: ${input.instructions}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const userText = `Write a short, warm promotional email announcing a discount coupon to existing customers, in the brand's voice.

RULES:
- Address the reader using the literal token {{first_name}} once near the start (e.g. "Hi {{first_name},"). It will be replaced per recipient — do NOT invent a name.
- Do NOT print the coupon code or the discount/validity yourself — those are shown in a styled box added automatically below your copy. Just build desire and tell them a code is waiting inside.
- Keep it to 2–4 short paragraphs. Plain text only — no markdown, no HTML, no links, no images, no sign-off (a "Team WholeSip" sign-off is added automatically).
- Separate paragraphs with a blank line.
- Return JSON: { "subject": "...", "body": "..." }. The subject is a single compelling line (you may use {{first_name}} in it too).

COUPON DETAILS — the only facts you may rely on:
${facts}`;

  const { text, error } = await callGemini(brandSystemText(brand), userText, {
    temperature: 0.8,
    maxOutputTokens: 1024,
    responseMimeType: "application/json",
    responseSchema: EMAIL_SCHEMA,
  });
  if (error) return { error };

  try {
    const parsed = JSON.parse(text ?? "{}") as {
      subject?: string;
      body?: string;
    };
    if (!parsed.subject || !parsed.body)
      return { error: "The AI response was incomplete. Try again." };
    return { subject: parsed.subject.trim(), body: parsed.body.trim() };
  } catch {
    return { error: "Could not parse the AI response. Try again." };
  }
}

// ---------------------------------------------------------------------------
// Preview — full branded HTML for one sample recipient (used in the dialog).
// ---------------------------------------------------------------------------

export async function renderCouponEmailPreview(input: {
  subject: string;
  body: string;
  code: string;
  discountLabel: string;
  validUntilLabel?: string | null;
  sampleName?: string;
}): Promise<{ html?: string; subject?: string; error?: string }> {
  const userId = await getManagerUserId("marketing");
  if (!userId) return { error: "Not authenticated" };

  const firstName = input.sampleName?.trim() || "there";
  const brand = await getStoreBrand();
  const content: CouponEmailContent = {
    body: input.body,
    firstName,
    code: input.code,
    discountLabel: input.discountLabel,
    validUntilLabel: input.validUntilLabel,
    brand,
  };

  return {
    html: renderCouponEmail(content),
    subject: mergeTokens(input.subject, firstName),
  };
}

// ---------------------------------------------------------------------------
// Send — resolve the audience, merge per recipient, send via Resend in batches.
// ---------------------------------------------------------------------------

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.includes("placeholder")) return null;
  return new Resend(apiKey);
}

async function resolveRecipients(
  audience: EmailAudience,
): Promise<RecipientOption[]> {
  const admin = createAdminClient();

  if (audience.mode === "group") {
    const { data: members } = await admin
      .from("user_group_members")
      .select("user_id")
      .eq("group_id", audience.groupId);
    const ids = (members ?? []).map((m) => m.user_id as string);
    if (ids.length === 0) return [];
    const { data } = await admin
      .from("users")
      .select("id, first_name, last_name, email, phone")
      .in("id", ids);
    return (data ?? []) as RecipientOption[];
  }

  if (audience.mode === "specific") {
    if (audience.customerIds.length === 0) return [];
    const { data } = await admin
      .from("users")
      .select("id, first_name, last_name, email, phone")
      .in("id", audience.customerIds);
    return (data ?? []) as RecipientOption[];
  }

  // all
  const { data } = await admin
    .from("users")
    .select("id, first_name, last_name, email, phone");
  return (data ?? []) as RecipientOption[];
}

const RECIPIENT_INSERT_CHUNK = 1000;

/**
 * Queue a coupon campaign for background delivery. We resolve the audience and
 * write one row per recipient to email_campaign_recipients, then return
 * immediately — the worker (app/api/cron/send-emails) does the actual sending.
 * This is what lets a 100k-recipient campaign work at all: doing it inline
 * would exceed the serverless function timeout.
 */
export async function sendCouponEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const userId = await getManagerUserId("marketing");
  if (!userId) return { error: "Not authenticated" };
  const storeId = await getActingStoreId();

  if (!input.subject.trim() || !input.body.trim())
    return { error: "Add a subject and body before sending." };

  // Fail fast in the UI if email isn't set up (the worker checks again too).
  if (!getResend())
    return {
      error:
        "Email isn't configured (RESEND_API_KEY missing). Add it to send campaigns.",
    };

  const recipients = await resolveRecipients(input.audience);
  const withEmail = recipients.filter((r) => r.email);
  const skippedNoEmail = recipients.length - withEmail.length;

  if (withEmail.length === 0)
    return {
      queued: 0,
      skippedNoEmail,
      error: "None of the selected customers have an email address on file.",
    };

  const admin = createAdminClient();

  // 1. Create the campaign (holds the shared subject/body/code).
  const { data: campaign, error: campaignError } = await admin
    .from("email_campaigns")
    .insert({
      subject: input.subject,
      body: input.body,
      code: input.code,
      discount_label: input.discountLabel,
      valid_until_label: input.validUntilLabel ?? null,
      total: withEmail.length,
      skipped_no_email: skippedNoEmail,
      created_by: userId,
      store_id: storeId,
    })
    .select("id")
    .single();

  if (campaignError || !campaign) {
    console.error("Failed to create email campaign:", campaignError);
    return {
      error:
        "Could not queue the campaign. Apply supabase/email_campaigns.sql, then try again.",
    };
  }

  // 2. Insert one recipient row per address, in chunks (one round trip each).
  const rows = withEmail.map((r) => ({
    campaign_id: campaign.id as string,
    email: r.email as string,
    first_name: r.first_name?.trim() || "",
    store_id: storeId,
  }));

  for (let i = 0; i < rows.length; i += RECIPIENT_INSERT_CHUNK) {
    const { error: insertError } = await admin
      .from("email_campaign_recipients")
      .insert(rows.slice(i, i + RECIPIENT_INSERT_CHUNK));
    if (insertError) {
      console.error("Failed to enqueue recipients:", insertError);
      return {
        error:
          "Could not queue all recipients. Some may not receive the email — check the logs.",
      };
    }
  }

  // 3. Kick the worker after the response is sent (cron is the fallback).
  after(() => triggerEmailWorker());

  return { queued: withEmail.length, skippedNoEmail };
}
