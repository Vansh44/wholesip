import "server-only";

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeTokens, renderCouponEmail } from "@/lib/email/coupon-campaign";
import { getStoreBrandById } from "@/lib/store/brand";
import { fromAddress } from "@/lib/email/sender";

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
  store_id: string;
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
      .select(
        "id, subject, body, code, discount_label, valid_until_label, store_id",
      )
      .in("id", campaignIds);
    const campaigns = new Map<string, CampaignRow>(
      (campaignRows ?? []).map((c) => [c.id as string, c as CampaignRow]),
    );

    const storeIds = [
      ...new Set((campaignRows ?? []).map((c) => c.store_id as string)),
    ].filter(Boolean);
    const brandsMap = new Map();
    for (const sid of storeIds) {
      brandsMap.set(sid, await getStoreBrandById(sid));
    }

    // Pair each recipient id with its message so we mark ONLY the rows we
    // actually attempt to send. Recipients whose campaign/brand couldn't be
    // resolved are "skipped" — they must never be recorded as sent.
    const prepared = batch.map((r) => {
      const c = campaigns.get(r.campaign_id);
      const brand = c ? brandsMap.get(c.store_id) : undefined;
      if (!c || !brand) return { id: r.id, message: null };

      const firstName = r.first_name?.trim() || "there";
      return {
        id: r.id,
        message: {
          from: fromAddress(brand),
          to: r.email,
          subject: mergeTokens(c.subject, firstName),
          html: renderCouponEmail({
            body: c.body,
            firstName,
            code: c.code,
            discountLabel: c.discount_label,
            validUntilLabel: c.valid_until_label,
            brand,
          }),
        },
      };
    });

    const sendable = prepared.filter(
      (p): p is { id: string; message: NonNullable<typeof p.message> } =>
        p.message !== null,
    );
    const sentIds = sendable.map((p) => p.id);
    const skippedIds = prepared
      .filter((p) => p.message === null)
      .map((p) => p.id);

    let ok = false;
    if (sendable.length > 0) {
      try {
        const { error: sendErr } = await resend.batch.send(
          sendable.map((p) => p.message),
        );
        ok = !sendErr;
        if (sendErr) console.error("resend batch error:", sendErr);
      } catch (e) {
        console.error("resend batch threw:", e);
      }
    }

    // Attempted rows follow the send outcome; skipped rows are always failures
    // (no campaign/brand to send them) so they aren't silently lost as "sent".
    if (sentIds.length) {
      await admin
        .from("email_campaign_recipients")
        .update({ status: ok ? "sent" : "failed" })
        .in("id", sentIds);
    }
    if (skippedIds.length) {
      await admin
        .from("email_campaign_recipients")
        .update({ status: "failed" })
        .in("id", skippedIds);
    }

    processed += batch.length;
    if (ok) {
      sent += sentIds.length;
      failed += skippedIds.length;
    } else {
      failed += sentIds.length + skippedIds.length;
    }
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
