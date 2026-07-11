import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "./crypto";
import type { RazorpayCreds } from "./razorpay";

// Loaders for payment credentials. Two entirely separate accounts:
//   • a STORE's BYO Razorpay gateway (store_payment_providers — order money
//     settles with the merchant), and
//   • the PLATFORM's own Razorpay account (env — AI-credit purchases only).
// Neither ever reaches a client component; secrets stay server-side.

export interface StoreGateway {
  creds: RazorpayCreds;
  enabled: boolean;
}

/** The store's decrypted BYO Razorpay credentials, or null when not
 *  connected (or the stored secret fails to decrypt). */
export async function getStoreGateway(
  storeId: string,
): Promise<StoreGateway | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("store_payment_providers")
    .select("key_id, key_secret_enc, enabled")
    .eq("store_id", storeId)
    .eq("provider", "razorpay")
    .maybeSingle();
  if (error) {
    console.error("getStoreGateway:", error.message);
    return null;
  }
  if (!data) return null;
  try {
    return {
      creds: {
        keyId: data.key_id as string,
        keySecret: decryptSecret(data.key_secret_enc as string),
      },
      enabled: !!data.enabled,
    };
  } catch (e) {
    // Wrong/rotated PAYMENT_CRED_KEY or corrupt row — treat as not connected
    // rather than crashing checkout.
    console.error(
      "getStoreGateway (decrypt):",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

/** The platform's own Razorpay account (AI-credit purchases). Null until the
 *  RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET env vars are set. */
export function getPlatformRazorpayCreds(): RazorpayCreds | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}
