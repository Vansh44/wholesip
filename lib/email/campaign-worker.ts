import "server-only";

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeTokens, renderCouponEmail } from "@/lib/email/coupon-campaign";

const FROM_ADDRESS = "WholeSip <admin@wholesip.com>";
const RESEND_BATCH = 100; // Resend batch.send() hard limit
const MAX_PER_RUN = 2000; // emails per worker invocation (stays within timeout)

interface ClaimedRecipient {
  id: string;
  campaign_id: string;
  email: string;
  first_name: string;
}

interface CampaignRow {
  id: string;
  subject: string;
  body: string;
  code: string;
  discount_label: string;
  valid_until_label: string | null;
}

export interface WorkerResult {
  processed: number;
  sent: number;
  failed: number;
  /** Pending recipients still in the queue across all campaigns. */
  remaining: number;
}

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.includes("placeholder")) return null;
  return new Resend(apiKey);
}

/**
 * Drains up to `maxPerRun` recipients from the queue: claims a batch, sends it
 * via Resend, marks rows sent/failed, and refreshes campaign progress. Returns
 * how many remain so the caller can decide whether to run again.
 */
export async function processEmailQueue(
  maxPerRun = MAX_PER_RUN,
): Promise<WorkerResult> {
  const resend = getResend();
  if (!resend) {
    console.error("processEmailQueue: RESEND_API_KEY not configured.");
    return { processed: 0, sent: 0, failed: 0, remaining: 0 };
  }

  const admin = createAdminClient();

  // Recover anything stuck mid-send from a previous crashed run.
  await admin.rpc("requeue_stale_email_recipients", {
    p_older_than_seconds: 600,
  });

  let processed = 0;
  let sent = 0;
  let failed = 0;

  while (processed < maxPerRun) {
    const want = Math.min(RESEND_BATCH, maxPerRun - processed);
    const { data: claimed, error: claimErr } = await admin.rpc(
      "claim_email_batch",
      { p_limit: want },
    );
    if (claimErr) {
      console.error("claim_email_batch error:", claimErr.message);
      break;
    }
    const batch = (claimed ?? []) as ClaimedRecipient[];
    if (batch.length === 0) break;

    // Pull the campaign copy for every campaign represented in this batch.
    const campaignIds = [...new Set(batch.map((r) => r.campaign_id))];
    const { data: campaignRows } = await admin
      .from("email_campaigns")
      .select("id, subject, body, code, discount_label, valid_until_label")
      .in("id", campaignIds);
    const campaigns = new Map<string, CampaignRow>(
      (campaignRows ?? []).map((c) => [c.id as string, c as CampaignRow]),
    );

    const messages = batch
      .map((r) => {
        const c = campaigns.get(r.campaign_id);
        if (!c) return null;
        const firstName = r.first_name?.trim() || "there";
        return {
          from: FROM_ADDRESS,
          to: r.email,
          subject: mergeTokens(c.subject, firstName),
          html: renderCouponEmail({
            body: c.body,
            firstName,
            code: c.code,
            discountLabel: c.discount_label,
            validUntilLabel: c.valid_until_label,
          }),
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    let ok = false;
    try {
      const { error: sendErr } = await resend.batch.send(messages);
      ok = !sendErr;
      if (sendErr) console.error("resend batch error:", sendErr);
    } catch (e) {
      console.error("resend batch threw:", e);
    }

    const ids = batch.map((r) => r.id);
    await admin
      .from("email_campaign_recipients")
      .update({ status: ok ? "sent" : "failed" })
      .in("id", ids);

    processed += batch.length;
    if (ok) sent += batch.length;
    else failed += batch.length;
  }

  await finalizeCampaigns(admin);

  const { count } = await admin
    .from("email_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return { processed, sent, failed, remaining: count ?? 0 };
}

/**
 * Recompute sent/failed counters for in-flight campaigns and flip them to
 * 'done' once no pending/sending recipients remain.
 */
async function finalizeCampaigns(
  admin: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const { data: active } = await admin
    .from("email_campaigns")
    .select("id")
    .in("status", ["pending", "sending"]);

  for (const c of active ?? []) {
    const id = c.id as string;
    const [sentRes, failedRes, openRes] = await Promise.all([
      admin
        .from("email_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", "sent"),
      admin
        .from("email_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", "failed"),
      admin
        .from("email_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .in("status", ["pending", "sending"]),
    ]);

    const open = openRes.count ?? 0;
    await admin
      .from("email_campaigns")
      .update({
        sent: sentRes.count ?? 0,
        failed: failedRes.count ?? 0,
        status: open === 0 ? "done" : "sending",
      })
      .eq("id", id);
  }
}
