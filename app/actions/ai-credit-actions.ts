"use server";

// AI-credit purchases + the AI-usage page's data. Credits revenue is
// STOREMINK's, so purchases run on the PLATFORM's Razorpay account (env
// RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) — a store does NOT need its own
// Channels gateway to buy credits.
//
// Lifecycle: startCreditPurchase (pending row + platform Razorpay order) →
// client pays in the Razorpay modal → confirmCreditPurchase (HMAC verify →
// paid → add_ai_credits). The add_ai_credits RPC is idempotent per payment id
// (unique partial index), so double-confirmation / reconcile races can never
// double-credit. Dropped callbacks are reconciled on AI-page load (the same
// reconcile-on-read pattern as order payments — no webhook in v1).

import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";
import { effectivePlan, planAllows } from "@/lib/plans";
import { CREDIT_PACKS, getCreditPack } from "@/lib/ai/credits";
import { getAiUsage, type AiUsageSummary } from "@/lib/ai/quota";
import { getPlatformRazorpayCreds } from "@/lib/payments/provider";
import {
  capturedPayment,
  rzpCreateOrder,
  rzpFetchOrderPayments,
  verifyCheckoutSignature,
} from "@/lib/payments/razorpay";

// A purchase left `pending` this long is presumed dropped and gets reconciled
// against Razorpay on the next AI-page load.
const RECONCILE_AFTER_MS = 3 * 60_000;

export interface AiLedgerEntry {
  id: string;
  delta: number;
  kind: "purchase" | "grant" | "spend";
  note: string | null;
  created_at: string;
}

export interface AiUsagePageData {
  usage: AiUsageSummary;
  plan: string;
  /** Whether this store's plan may buy credits (basic+). */
  canBuyCredits: boolean;
  /** Whether the platform's payment account is configured at all. */
  purchasesAvailable: boolean;
  ledger: AiLedgerEntry[];
}

// Mark a paid purchase + grant its credits, idempotently. Shared by the
// client confirm path and the reconcile pass.
async function settlePurchase(
  admin: ReturnType<typeof createAdminClient>,
  purchase: { id: string; store_id: string; credits: number; pack_id: string },
  rzpPaymentId: string,
): Promise<void> {
  const { error: updErr } = await admin
    .from("ai_credit_purchases")
    .update({
      status: "paid",
      rzp_payment_id: rzpPaymentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", purchase.id)
    .eq("status", "pending");
  if (updErr) {
    console.error("settlePurchase (status):", updErr.message);
    return;
  }
  // Credits keyed on the payment id — a repeat call is a no-op (returns false).
  const { error: rpcErr } = await admin.rpc("add_ai_credits", {
    p_store: purchase.store_id,
    p_delta: purchase.credits,
    p_kind: "purchase",
    p_ref: rzpPaymentId,
    p_note: `pack ${purchase.pack_id}`,
  });
  if (rpcErr) console.error("settlePurchase (credits):", rpcErr.message);
}

// Reconcile-on-read: any stale pending purchase for this store is checked
// against Razorpay; captured ⇒ settle, nothing captured ⇒ leave pending (the
// shopper may still be mid-payment — there is no reaper for credit purchases,
// an old pending row is harmless).
async function reconcilePendingPurchases(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
): Promise<void> {
  const creds = getPlatformRazorpayCreds();
  if (!creds) return;
  const cutoff = new Date(Date.now() - RECONCILE_AFTER_MS).toISOString();
  const { data: stale } = await admin
    .from("ai_credit_purchases")
    .select("id, store_id, credits, pack_id, rzp_order_id")
    .eq("store_id", storeId)
    .eq("status", "pending")
    .lte("created_at", cutoff)
    .limit(10);
  for (const p of stale ?? []) {
    if (!p.rzp_order_id) continue;
    const res = await rzpFetchOrderPayments(creds, p.rzp_order_id as string);
    if (!res.ok) continue;
    const captured = capturedPayment(res.data);
    if (captured) {
      await settlePurchase(
        admin,
        p as { id: string; store_id: string; credits: number; pack_id: string },
        captured.id,
      );
    }
  }
}

/** Everything the /dashboard/ai page renders. Also runs the pending-purchase
 *  reconcile pass so a dropped payment callback self-heals on next visit. */
export async function getAiUsagePageData(): Promise<AiUsagePageData> {
  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  await reconcilePendingPurchases(admin, storeId);

  const [{ data: store }, usage, { data: ledger }] = await Promise.all([
    admin
      .from("stores")
      .select("plan, plan_expires_at")
      .eq("id", storeId)
      .maybeSingle(),
    getAiUsage(storeId),
    admin
      .from("ai_credit_ledger")
      .select("id, delta, kind, note, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const plan = effectivePlan(store ?? {});
  return {
    usage,
    plan,
    canBuyCredits: planAllows(plan, "basic"),
    purchasesAvailable: getPlatformRazorpayCreds() !== null,
    ledger: (ledger ?? []) as AiLedgerEntry[],
  };
}

export type StartPurchaseResult =
  | {
      success: true;
      purchaseId: string;
      rzpOrderId: string;
      keyId: string;
      amountPaise: number;
      packName: string;
    }
  | { error: string };

export async function startCreditPurchase(
  packId: string,
): Promise<StartPurchaseResult> {
  const userId = await getManagerUserId("ai");
  if (!userId) return { error: "You don't have permission to do this." };

  const pack = getCreditPack(packId);
  if (!pack) return { error: "Unknown credit pack." };

  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  // Plan gate (server-side, convention #9): credits are a paid-plan top-up.
  const { data: store } = await admin
    .from("stores")
    .select("plan, plan_expires_at")
    .eq("id", storeId)
    .maybeSingle();
  if (!planAllows(effectivePlan(store ?? {}), "basic")) {
    return {
      error:
        "AI credits are available on the Basic plan and above. Upgrade your plan to buy credits.",
    };
  }

  const creds = getPlatformRazorpayCreds();
  if (!creds) {
    return { error: "Credit purchases aren't available right now." };
  }

  const { data: purchase, error: insErr } = await admin
    .from("ai_credit_purchases")
    .insert({
      store_id: storeId,
      pack_id: pack.id,
      credits: pack.credits,
      amount_inr: pack.priceInr,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !purchase) {
    console.error("startCreditPurchase (insert):", insErr?.message);
    return { error: "Couldn't start the purchase. Please try again." };
  }

  const amountPaise = pack.priceInr * 100;
  const rzpRes = await rzpCreateOrder(creds, {
    amountPaise,
    receipt: `aicr_${(purchase.id as string).slice(0, 30)}`,
    notes: { store_id: storeId, purchase_id: purchase.id as string },
  });
  if (!rzpRes.ok) {
    console.error("startCreditPurchase (rzp):", rzpRes.error);
    await admin
      .from("ai_credit_purchases")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", purchase.id);
    return { error: "Couldn't start the payment. Please try again." };
  }

  const { error: pinErr } = await admin
    .from("ai_credit_purchases")
    .update({
      rzp_order_id: rzpRes.data.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", purchase.id);
  if (pinErr) {
    console.error("startCreditPurchase (pin):", pinErr.message);
    return { error: "Couldn't start the payment. Please try again." };
  }

  return {
    success: true,
    purchaseId: purchase.id as string,
    rzpOrderId: rzpRes.data.id,
    keyId: creds.keyId,
    amountPaise,
    packName: pack.name,
  };
}

export interface ConfirmPurchaseResult {
  success?: boolean;
  creditsAdded?: number;
  error?: string;
}

export async function confirmCreditPurchase(
  purchaseId: string,
  rzpPaymentId: string,
  rzpSignature: string,
): Promise<ConfirmPurchaseResult> {
  const userId = await getManagerUserId("ai");
  if (!userId) return { error: "You don't have permission to do this." };
  if (
    typeof purchaseId !== "string" ||
    !purchaseId ||
    typeof rzpPaymentId !== "string" ||
    !rzpPaymentId ||
    typeof rzpSignature !== "string" ||
    !rzpSignature
  ) {
    return { error: "Invalid payment confirmation." };
  }

  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  const { data: purchase } = await admin
    .from("ai_credit_purchases")
    .select("id, store_id, credits, pack_id, status, rzp_order_id")
    .eq("id", purchaseId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (!purchase) return { error: "Purchase not found." };
  if (purchase.status === "paid") {
    return { success: true, creditsAdded: purchase.credits as number };
  }
  if (purchase.status !== "pending" || !purchase.rzp_order_id) {
    return { error: "This purchase can no longer be completed." };
  }

  const creds = getPlatformRazorpayCreds();
  if (!creds) return { error: "Payment verification is unavailable." };

  const valid = verifyCheckoutSignature(
    creds.keySecret,
    purchase.rzp_order_id as string,
    rzpPaymentId,
    rzpSignature,
  );
  if (!valid) {
    console.error("confirmCreditPurchase: bad signature for", purchaseId);
    return { error: "Payment verification failed." };
  }

  await settlePurchase(
    admin,
    purchase as {
      id: string;
      store_id: string;
      credits: number;
      pack_id: string;
    },
    rzpPaymentId,
  );
  return { success: true, creditsAdded: purchase.credits as number };
}

/** The pack catalog for the buy panel (server → client serializable). */
export async function getCreditPacks() {
  return [...CREDIT_PACKS];
}
