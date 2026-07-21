import "server-only";

import { Resend } from "resend";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { emailCampaignRecipients, emailCampaigns } from "@/drizzle/schema";
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

  // Recover anything stuck mid-send from a previous crashed run.
  await withService((db) =>
    db.execute(
      sql`select requeue_stale_email_recipients(p_older_than_seconds => ${600})`,
    ),
  ).catch((err) => console.error("requeue_stale_email_recipients:", err));

  let processed = 0;
  let sent = 0;
  let failed = 0;

  while (processed < maxPerRun) {
    const want = Math.min(RESEND_BATCH, maxPerRun - processed);
    let batch: ClaimedRecipient[];
    try {
      const res = await withService((db) =>
        db.execute(sql`select * from claim_email_batch(p_limit => ${want})`),
      );
      batch = res.rows as unknown as ClaimedRecipient[];
    } catch (claimErr) {
      console.error("claim_email_batch error:", claimErr);
      break;
    }
    if (batch.length === 0) break;

    // Pull the campaign copy for every campaign represented in this batch.
    const campaignIds = [...new Set(batch.map((r) => r.campaign_id))];
    const campaignRows = await withService((db) =>
      db
        .select({
          id: emailCampaigns.id,
          subject: emailCampaigns.subject,
          body: emailCampaigns.body,
          code: emailCampaigns.code,
          discount_label: emailCampaigns.discountLabel,
          valid_until_label: emailCampaigns.validUntilLabel,
          store_id: emailCampaigns.storeId,
        })
        .from(emailCampaigns)
        .where(inArray(emailCampaigns.id, campaignIds)),
    ).catch(() => [] as CampaignRow[]);
    const campaigns = new Map<string, CampaignRow>(
      campaignRows.map((c) => [c.id, c as CampaignRow]),
    );

    const storeIds = [...new Set(campaignRows.map((c) => c.store_id))].filter(
      Boolean,
    );
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
      await withService((db) =>
        db
          .update(emailCampaignRecipients)
          .set({ status: ok ? "sent" : "failed" })
          .where(inArray(emailCampaignRecipients.id, sentIds)),
      ).catch((err) => console.error("mark attempted:", err));
    }
    if (skippedIds.length) {
      await withService((db) =>
        db
          .update(emailCampaignRecipients)
          .set({ status: "failed" })
          .where(inArray(emailCampaignRecipients.id, skippedIds)),
      ).catch((err) => console.error("mark skipped:", err));
    }

    processed += batch.length;
    if (ok) {
      sent += sentIds.length;
      failed += skippedIds.length;
    } else {
      failed += sentIds.length + skippedIds.length;
    }
  }

  await finalizeCampaigns();

  let remaining = 0;
  try {
    const [row] = await withService((db) =>
      db
        .select({ n: count() })
        .from(emailCampaignRecipients)
        .where(eq(emailCampaignRecipients.status, "pending")),
    );
    remaining = row?.n ?? 0;
  } catch (err) {
    console.error("processEmailQueue (remaining count):", err);
  }

  return { processed, sent, failed, remaining };
}

/**
 * Recompute sent/failed counters for in-flight campaigns and flip them to
 * 'done' once no pending/sending recipients remain.
 */
async function finalizeCampaigns(): Promise<void> {
  let active: { id: string }[];
  try {
    active = await withService((db) =>
      db
        .select({ id: emailCampaigns.id })
        .from(emailCampaigns)
        .where(inArray(emailCampaigns.status, ["pending", "sending"])),
    );
  } catch (err) {
    console.error("finalizeCampaigns (active):", err);
    return;
  }

  for (const c of active) {
    const id = c.id;
    try {
      await withService(async (db) => {
        const sentRes = await db
          .select({ n: count() })
          .from(emailCampaignRecipients)
          .where(
            and(
              eq(emailCampaignRecipients.campaignId, id),
              eq(emailCampaignRecipients.status, "sent"),
            ),
          );
        const failedRes = await db
          .select({ n: count() })
          .from(emailCampaignRecipients)
          .where(
            and(
              eq(emailCampaignRecipients.campaignId, id),
              eq(emailCampaignRecipients.status, "failed"),
            ),
          );
        const openRes = await db
          .select({ n: count() })
          .from(emailCampaignRecipients)
          .where(
            and(
              eq(emailCampaignRecipients.campaignId, id),
              inArray(emailCampaignRecipients.status, ["pending", "sending"]),
            ),
          );

        const open = openRes[0]?.n ?? 0;
        await db
          .update(emailCampaigns)
          .set({
            sent: sentRes[0]?.n ?? 0,
            failed: failedRes[0]?.n ?? 0,
            status: open === 0 ? "done" : "sending",
          })
          .where(eq(emailCampaigns.id, id));
      });
    } catch (err) {
      console.error(`finalizeCampaigns (campaign ${id}):`, err);
    }
  }
}
