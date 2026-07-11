"use server";

// Channels → Digital payments: a merchant connects their OWN Razorpay account
// (BYO gateway — order money settles directly with them). Credentials live in
// store_payment_providers (service-role only, supabase/payment_providers.sql);
// the key secret is app-layer encrypted (lib/payments/crypto.ts) and is
// WRITE-ONLY: no action ever returns it to a client.
//
// Plan gate: online payments are a paid feature (PLAN_LIMITS.onlinePayments,
// basic+). Enforced server-side here on save/enable AND again at checkout
// time (getCheckoutConfig / placeOrder) so a lapsed plan turns the gateway
// off without touching the merchant's stored credentials.

import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";
import { effectivePlan, limitsFor } from "@/lib/plans";
import { encryptSecret } from "@/lib/payments/crypto";
import { validateCredentials } from "@/lib/payments/razorpay";

export interface ChannelState {
  connected: boolean;
  /** The public key id (shown for recognition; the secret never leaves the server). */
  keyId: string | null;
  enabled: boolean;
  /** Whether the store's plan includes online payments at all. */
  planAllowsOnlinePayments: boolean;
}

async function planAllowsPayments(storeId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("plan, plan_expires_at")
    .eq("id", storeId)
    .maybeSingle();
  return limitsFor(effectivePlan(store ?? {})).onlinePayments;
}

export async function getChannelState(): Promise<ChannelState> {
  const storeId = await getActingStoreId();
  const admin = createAdminClient();
  const [{ data: row }, planOk] = await Promise.all([
    admin
      .from("store_payment_providers")
      .select("key_id, enabled")
      .eq("store_id", storeId)
      .eq("provider", "razorpay")
      .maybeSingle(),
    planAllowsPayments(storeId),
  ]);
  return {
    connected: !!row,
    keyId: (row?.key_id as string | undefined) ?? null,
    enabled: !!row?.enabled,
    planAllowsOnlinePayments: planOk,
  };
}

export interface ChannelActionResult {
  success?: boolean;
  error?: string;
}

export async function saveRazorpayCredentials(
  keyId: string,
  keySecret: string,
): Promise<ChannelActionResult> {
  const userId = await getManagerUserId("channels");
  if (!userId) return { error: "You don't have permission to do this." };

  const storeId = await getActingStoreId();
  if (!(await planAllowsPayments(storeId))) {
    return {
      error:
        "Online payments are available on the Basic plan and above. Upgrade to connect your gateway.",
    };
  }

  const id = (keyId ?? "").trim();
  const secret = (keySecret ?? "").trim();
  // Razorpay key ids look like rzp_test_xxxx / rzp_live_xxxx — a cheap shape
  // check before we spend an API call on obviously wrong input.
  if (!/^rzp_(test|live)_[A-Za-z0-9]{6,}$/.test(id)) {
    return { error: "That doesn't look like a Razorpay Key ID (rzp_…)." };
  }
  if (secret.length < 8 || secret.length > 200) {
    return { error: "That doesn't look like a Razorpay Key Secret." };
  }

  // Prove the pair actually works before storing it — a typo'd secret must
  // fail HERE, not at a customer's checkout.
  const check = await validateCredentials({ keyId: id, keySecret: secret });
  if (!check.ok) {
    return {
      error: `Razorpay rejected these credentials: ${check.error}`,
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("store_payment_providers").upsert(
    {
      store_id: storeId,
      provider: "razorpay",
      key_id: id,
      key_secret_enc: encryptSecret(secret),
      // Connecting (or re-keying) enables the gateway — the merchant just
      // proved intent by pasting working credentials.
      enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id" },
  );
  if (error) {
    console.error("saveRazorpayCredentials:", error.message);
    return { error: "Failed to save credentials. Please try again." };
  }
  return { success: true };
}

export async function setRazorpayEnabled(
  enabled: boolean,
): Promise<ChannelActionResult> {
  const userId = await getManagerUserId("channels");
  if (!userId) return { error: "You don't have permission to do this." };

  const storeId = await getActingStoreId();
  if (enabled && !(await planAllowsPayments(storeId))) {
    return {
      error:
        "Online payments are available on the Basic plan and above. Upgrade to enable your gateway.",
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("store_payment_providers")
    .update({ enabled: !!enabled, updated_at: new Date().toISOString() })
    .eq("store_id", storeId)
    .eq("provider", "razorpay")
    .select("store_id");
  if (error) {
    console.error("setRazorpayEnabled:", error.message);
    return { error: "Failed to update the gateway. Please try again." };
  }
  if (!data?.length) return { error: "Connect Razorpay first." };
  return { success: true };
}

export async function disconnectRazorpay(): Promise<ChannelActionResult> {
  const userId = await getManagerUserId("channels");
  if (!userId) return { error: "You don't have permission to do this." };

  const storeId = await getActingStoreId();
  const admin = createAdminClient();
  const { error } = await admin
    .from("store_payment_providers")
    .delete()
    .eq("store_id", storeId)
    .eq("provider", "razorpay");
  if (error) {
    console.error("disconnectRazorpay:", error.message);
    return { error: "Failed to disconnect. Please try again." };
  }
  return { success: true };
}
