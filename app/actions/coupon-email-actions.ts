"use server";

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { callGemini, brandSystemText, loadBrandSoul } from "@/lib/ai/gemini";
import {
  mergeTokens,
  renderCouponEmail,
  type CouponEmailContent,
} from "@/lib/email/coupon-campaign";

const FROM_ADDRESS = "WholeSip <admin@wholesip.com>";

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
  sent?: number;
  skippedNoEmail?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Recipients — lazy-loaded by the email dialog for the "specific" picker.
// ---------------------------------------------------------------------------

export async function listEmailRecipients(): Promise<{
  customers: RecipientOption[];
  error?: string;
}> {
  const userId = await getManagerUserId("marketing");
  if (!userId) return { customers: [], error: "Not authenticated" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, first_name, last_name, email, phone")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listEmailRecipients error:", error);
    return { customers: [], error: "Could not load customers." };
  }

  return {
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
  const content: CouponEmailContent = {
    body: input.body,
    firstName,
    code: input.code,
    discountLabel: input.discountLabel,
    validUntilLabel: input.validUntilLabel,
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

const BATCH_SIZE = 100;

export async function sendCouponEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const userId = await getManagerUserId("marketing");
  if (!userId) return { error: "Not authenticated" };

  if (!input.subject.trim() || !input.body.trim())
    return { error: "Add a subject and body before sending." };

  const resend = getResend();
  if (!resend)
    return {
      error:
        "Email isn't configured (RESEND_API_KEY missing). Add it to send campaigns.",
    };

  const recipients = await resolveRecipients(input.audience);
  const withEmail = recipients.filter((r) => r.email);
  const skippedNoEmail = recipients.length - withEmail.length;

  if (withEmail.length === 0)
    return {
      sent: 0,
      skippedNoEmail,
      error: "None of the selected customers have an email address on file.",
    };

  // Build a personalised message per recipient, then send in batches of 100
  // (Resend's batch limit). Each entry can carry its own merged subject/html.
  const messages = withEmail.map((r) => {
    const firstName = r.first_name?.trim() || "there";
    return {
      from: FROM_ADDRESS,
      to: r.email as string,
      subject: mergeTokens(input.subject, firstName),
      html: renderCouponEmail({
        body: input.body,
        firstName,
        code: input.code,
        discountLabel: input.discountLabel,
        validUntilLabel: input.validUntilLabel,
      }),
    };
  });

  let sent = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    try {
      const { data, error } = await resend.batch.send(chunk);
      if (error) {
        console.error("sendCouponEmail batch error:", error);
      } else {
        sent += data?.data?.length ?? chunk.length;
      }
    } catch (e) {
      console.error("sendCouponEmail batch threw:", e);
    }
  }

  if (sent === 0)
    return {
      sent: 0,
      skippedNoEmail,
      error: "Sending failed. Check the server logs and your Resend setup.",
    };

  return { sent, skippedNoEmail };
}
