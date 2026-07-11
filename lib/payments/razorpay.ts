import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// Minimal Razorpay REST client — plain fetch + basic auth, no SDK (the SDK
// pulls a dependency tree for what is three endpoints). Used both for a
// store's BYO gateway (order payments, creds from store_payment_providers)
// and the PLATFORM's own account (AI-credit purchases, creds from env).
//
// Docs: https://razorpay.com/docs/api/orders/ + /payments/

const RZP_BASE = "https://api.razorpay.com/v1";

export interface RazorpayCreds {
  keyId: string;
  keySecret: string;
}

function authHeader(creds: RazorpayCreds): string {
  return `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}`;
}

export interface RzpOrder {
  id: string;
  amount: number; // paise
  currency: string;
  receipt: string | null;
  status: string;
}

export interface RzpPayment {
  id: string;
  order_id: string;
  amount: number; // paise
  status: string; // created | authorized | captured | refunded | failed
}

export type RzpResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function rzpFetch<T>(
  creds: RazorpayCreds,
  path: string,
  init?: RequestInit,
): Promise<RzpResult<T>> {
  try {
    const res = await fetch(`${RZP_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader(creds),
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      // Razorpay error bodies: { error: { code, description } }
      let description = `Razorpay request failed (${res.status})`;
      try {
        const body = (await res.json()) as {
          error?: { description?: string };
        };
        if (body?.error?.description) description = body.error.description;
      } catch {
        // non-JSON error body — keep the status message
      }
      return { ok: false, error: description };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Razorpay request failed",
    };
  }
}

/** Create a Razorpay Order for the given (server-computed!) amount. */
export async function rzpCreateOrder(
  creds: RazorpayCreds,
  params: {
    amountPaise: number;
    receipt?: string;
    notes?: Record<string, string>;
  },
): Promise<RzpResult<RzpOrder>> {
  if (!Number.isInteger(params.amountPaise) || params.amountPaise < 100) {
    // Razorpay's own minimum is ₹1 (100 paise).
    return { ok: false, error: "Amount too small for an online payment." };
  }
  return rzpFetch<RzpOrder>(creds, "/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: "INR",
      receipt: params.receipt,
      notes: params.notes,
    }),
  });
}

/** All payment attempts against a Razorpay order — the reconciliation source
 *  of truth (a `captured` payment here means the money was taken). */
export async function rzpFetchOrderPayments(
  creds: RazorpayCreds,
  rzpOrderId: string,
): Promise<RzpResult<RzpPayment[]>> {
  const res = await rzpFetch<{ items: RzpPayment[] }>(
    creds,
    `/orders/${encodeURIComponent(rzpOrderId)}/payments`,
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data.items ?? [] };
}

/** The captured payment on an order, if any. */
export function capturedPayment(payments: RzpPayment[]): RzpPayment | null {
  return payments.find((p) => p.status === "captured") ?? null;
}

/** Cheap authenticated call to prove a key pair works ("Verify & save"). */
export async function validateCredentials(
  creds: RazorpayCreds,
): Promise<RzpResult<true>> {
  const res = await rzpFetch<unknown>(creds, "/orders?count=1");
  if (!res.ok) return res;
  return { ok: true, data: true };
}

/**
 * Razorpay Standard Checkout success signature:
 *   HMAC-SHA256(key_secret, `${order_id}|${payment_id}`) === signature.
 * Pure (no I/O) — unit-tested with a known vector. Constant-time compare.
 */
export function verifyCheckoutSignature(
  keySecret: string,
  rzpOrderId: string,
  rzpPaymentId: string,
  signature: string,
): boolean {
  if (!keySecret || !rzpOrderId || !rzpPaymentId || !signature) return false;
  const expected = createHmac("sha256", keySecret)
    .update(`${rzpOrderId}|${rzpPaymentId}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
