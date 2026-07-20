"use server";

// Channels → Digital payments: a merchant connects their OWN Razorpay account
// (BYO gateway — order money settles directly with them). Credentials live in
// store_payment_providers (service-only, supabase/payment_providers.sql);
// the key secret is app-layer encrypted (lib/payments/crypto.ts) and is
// WRITE-ONLY: no action ever returns it to a client.
//
// Plan gate: online payments are a paid feature (PLAN_LIMITS.onlinePayments,
// basic+). Enforced server-side here on save/enable AND again at checkout
// time (getCheckoutConfig / placeOrder) so a lapsed plan turns the gateway
// off without touching the merchant's stored credentials.

import { and, eq } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { storePaymentProviders, stores } from "@/drizzle/schema";
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
  try {
    const rows = await withService((db) =>
      db
        .select({ plan: stores.plan, plan_expires_at: stores.planExpiresAt })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1),
    );
    return limitsFor(effectivePlan(rows[0] ?? {})).onlinePayments;
  } catch (err) {
    console.error(
      "planAllowsPayments:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

export async function getChannelState(): Promise<ChannelState> {
  const storeId = await getActingStoreId();
  const [row, planOk] = await Promise.all([
    withService((db) =>
      db
        // Deliberately NEVER selects the encrypted secret column.
        .select({
          key_id: storePaymentProviders.keyId,
          enabled: storePaymentProviders.enabled,
        })
        .from(storePaymentProviders)
        .where(
          and(
            eq(storePaymentProviders.storeId, storeId),
            eq(storePaymentProviders.provider, "razorpay"),
          ),
        )
        .limit(1),
    ).then(
      (rows) => rows[0],
      () => undefined,
    ),
    planAllowsPayments(storeId),
  ]);
  return {
    connected: !!row,
    keyId: row?.key_id ?? null,
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

  const updateFields = {
    provider: "razorpay",
    keyId: id,
    keySecretEnc: encryptSecret(secret),
    // Connecting (or re-keying) enables the gateway — the merchant just
    // proved intent by pasting working credentials.
    enabled: true,
    updatedAt: new Date().toISOString(),
  };
  try {
    await withService((db) =>
      db
        .insert(storePaymentProviders)
        .values({ storeId, ...updateFields })
        .onConflictDoUpdate({
          target: storePaymentProviders.storeId,
          set: updateFields,
        }),
    );
  } catch (err) {
    console.error(
      "saveRazorpayCredentials:",
      err instanceof Error ? err.message : err,
    );
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

  let updated: { store_id: string }[];
  try {
    updated = await withService((db) =>
      db
        .update(storePaymentProviders)
        .set({ enabled: !!enabled, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(storePaymentProviders.storeId, storeId),
            eq(storePaymentProviders.provider, "razorpay"),
          ),
        )
        .returning({ store_id: storePaymentProviders.storeId }),
    );
  } catch (err) {
    console.error(
      "setRazorpayEnabled:",
      err instanceof Error ? err.message : err,
    );
    return { error: "Failed to update the gateway. Please try again." };
  }
  if (!updated.length) return { error: "Connect Razorpay first." };
  return { success: true };
}

export async function disconnectRazorpay(): Promise<ChannelActionResult> {
  const userId = await getManagerUserId("channels");
  if (!userId) return { error: "You don't have permission to do this." };

  const storeId = await getActingStoreId();
  try {
    await withService((db) =>
      db
        .delete(storePaymentProviders)
        .where(
          and(
            eq(storePaymentProviders.storeId, storeId),
            eq(storePaymentProviders.provider, "razorpay"),
          ),
        ),
    );
  } catch (err) {
    console.error(
      "disconnectRazorpay:",
      err instanceof Error ? err.message : err,
    );
    return { error: "Failed to disconnect. Please try again." };
  }
  return { success: true };
}
