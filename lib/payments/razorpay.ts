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

// ─────────────────────────── Subscriptions (autopay) ───────────────────────
// Recurring plan billing on the PLATFORM's Razorpay account. A Plan is the
// price+period (created once, cached in razorpay_plans); a Subscription is one
// merchant's signup against a plan; the merchant authorises a mandate in
// Checkout and Razorpay auto-charges each cycle (webhooks drive the rest).

export interface RzpPlan {
  id: string;
  period: string;
  interval: number;
}

export interface RzpSubscription {
  id: string;
  plan_id: string;
  status: string; // created|authenticated|active|pending|halted|cancelled|completed
  current_start: number | null; // unix seconds
  current_end: number | null; // unix seconds
  charge_at: number | null;
  paid_count: number;
  total_count: number;
  short_url: string | null;
}

/** Create a Razorpay Plan (price + billing period). Idempotency is handled by
 *  the caller via the razorpay_plans cache — one plan per (tier, period, price). */
export async function rzpCreatePlan(
  creds: RazorpayCreds,
  params: {
    period: "monthly" | "yearly";
    amountPaise: number;
    name: string;
  },
): Promise<RzpResult<RzpPlan>> {
  return rzpFetch<RzpPlan>(creds, "/plans", {
    method: "POST",
    body: JSON.stringify({
      period: params.period,
      interval: 1,
      item: {
        name: params.name,
        amount: params.amountPaise,
        currency: "INR",
      },
    }),
  });
}

/** Create a Subscription against a plan. `startAt` (unix seconds) schedules a
 *  future first charge — used to begin a new plan only after the current one
 *  expires. `totalCount` is Razorpay-required (max cycles); we set it large. */
export async function rzpCreateSubscription(
  creds: RazorpayCreds,
  params: {
    planId: string;
    totalCount: number;
    notes?: Record<string, string>;
    startAt?: number;
  },
): Promise<RzpResult<RzpSubscription>> {
  return rzpFetch<RzpSubscription>(creds, "/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: params.planId,
      total_count: params.totalCount,
      customer_notify: 1,
      notes: params.notes,
      ...(params.startAt ? { start_at: params.startAt } : {}),
    }),
  });
}

/** The reconciliation source of truth for a subscription's live state. */
export async function rzpFetchSubscription(
  creds: RazorpayCreds,
  subscriptionId: string,
): Promise<RzpResult<RzpSubscription>> {
  return rzpFetch<RzpSubscription>(
    creds,
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
}

/** Cancel a subscription. `cancelAtCycleEnd` keeps access until the paid cycle
 *  ends (no further charges); false cancels immediately. */
export async function rzpCancelSubscription(
  creds: RazorpayCreds,
  subscriptionId: string,
  cancelAtCycleEnd: boolean,
): Promise<RzpResult<RzpSubscription>> {
  return rzpFetch<RzpSubscription>(
    creds,
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 }),
    },
  );
}

/** Change a subscription's plan (upgrade/downgrade) on the SAME mandate.
 *  `scheduleChangeAt: "now"` prorates and resets the cycle immediately;
 *  "cycle_end" applies the change at the next renewal. */
export async function rzpUpdateSubscription(
  creds: RazorpayCreds,
  subscriptionId: string,
  params: { planId: string; scheduleChangeAt: "now" | "cycle_end" },
): Promise<RzpResult<RzpSubscription>> {
  return rzpFetch<RzpSubscription>(
    creds,
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        plan_id: params.planId,
        schedule_change_at: params.scheduleChangeAt,
        customer_notify: 1,
      }),
    },
  );
}

/**
 * Razorpay Subscription checkout success signature. NOTE the operand order is
 * `${payment_id}|${subscription_id}` — the REVERSE of one-time checkout
 * (`${order_id}|${payment_id}`). Pure; constant-time compare.
 */
export function verifySubscriptionSignature(
  keySecret: string,
  rzpPaymentId: string,
  rzpSubscriptionId: string,
  signature: string,
): boolean {
  if (!keySecret || !rzpPaymentId || !rzpSubscriptionId || !signature)
    return false;
  const expected = createHmac("sha256", keySecret)
    .update(`${rzpPaymentId}|${rzpSubscriptionId}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Razorpay WEBHOOK signature (Phase 2): HMAC-SHA256 of the RAW request body
 * with the webhook secret, compared to the X-Razorpay-Signature header. Pure.
 */
export function verifyWebhookSignature(
  webhookSecret: string,
  rawBody: string,
  signature: string,
): boolean {
  if (!webhookSecret || !rawBody || !signature) return false;
  const expected = createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
