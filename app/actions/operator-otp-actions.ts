"use server";

import "server-only";
import { cookies, headers } from "next/headers";
import { createHmac, createHash, randomInt, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { platformAdmins } from "@/drizzle/schema";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { sendOperatorOtpEmail } from "@/lib/email/operator-otp";
import {
  getOrCreateAuthUserIdByEmail,
  createCustomAuthToken,
} from "@/lib/auth/firebase-users";

// Operator (platform-admin) email-OTP login. Replaces the Firebase email magic
// link — which landed in spam — with a 6-digit code sent through the platform's
// Resend domain. The code's HASH lives in an HMAC-signed httpOnly cookie (no DB
// table needed), so a code can only be verified on the same browser that
// requested it, and the server never stores the plaintext.

const OTP_COOKIE = "sm_op_otp";
const TTL_MS = 6 * 10 * 60 * 1000; // 60 minutes
const MAX_ATTEMPTS = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface OtpPayload {
  e: string; // email (lowercased)
  h: string; // sha256(code + secret)
  x: number; // expiry (epoch ms)
  a: number; // wrong-attempt count
}

// HMAC key for the cookie signature + a pepper for the code hash. A dedicated
// OPERATOR_OTP_SECRET is preferred; fall back to CRON_SECRET (already present in
// every environment) so this works without a new secret.
function otpSecret(): string {
  const s = process.env.OPERATOR_OTP_SECRET || process.env.CRON_SECRET;
  if (!s) throw new Error("Operator OTP signing secret is not configured.");
  return s;
}

function signPayload(b64: string): string {
  return createHmac("sha256", otpSecret()).update(b64).digest("hex");
}

function hashCode(code: string): string {
  return createHash("sha256").update(`${code}:${otpSecret()}`).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function encodeCookie(payload: OtpPayload): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${b64}.${signPayload(b64)}`;
}

/** Parse + signature-verify the cookie. Returns null on any tamper/decode failure. */
function decodeCookie(raw: string | undefined): OtpPayload | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const b64 = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  if (!safeEqualHex(mac, signPayload(b64))) return null;
  try {
    const p = JSON.parse(
      Buffer.from(b64, "base64url").toString(),
    ) as OtpPayload;
    if (typeof p.e !== "string" || typeof p.h !== "string") return null;
    if (typeof p.x !== "number" || typeof p.a !== "number") return null;
    return p;
  } catch {
    return null;
  }
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Is this email on the platform_admins allowlist? (The operator gate.) */
async function isOperator(email: string): Promise<boolean> {
  const rows = await withService((db) =>
    db
      .select({ email: platformAdmins.email })
      .from(platformAdmins)
      .where(eq(platformAdmins.email, email))
      .limit(1),
  ).catch(() => [] as { email: string }[]);
  return rows.length > 0;
}

/**
 * Send a 6-digit sign-in code to an operator's email. Anti-enumeration: always
 * returns { ok: true } for a well-formed email, but only actually issues a code
 * (cookie + email) when the address is a platform admin.
 */
export async function requestOperatorOtp(
  rawEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  const email = String(rawEmail || "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email))
    return { ok: false, error: "Enter a valid email." };

  const ip = clientIp(await headers());
  const [byEmail, byIp] = await Promise.all([
    rateLimit(`op-otp-req:${email}`, { max: 5, windowSeconds: 900 }),
    rateLimit(`op-otp-req-ip:${ip}`, { max: 20, windowSeconds: 900 }),
  ]);
  if (!byEmail.allowed || !byIp.allowed) {
    return {
      ok: false,
      error: "Too many requests. Please wait a few minutes.",
    };
  }

  // Only real operators get a code — but don't reveal membership either way.
  if (!(await isOperator(email))) return { ok: true };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const payload: OtpPayload = {
    e: email,
    h: hashCode(code),
    x: Date.now() + TTL_MS,
    a: 0,
  };
  (await cookies()).set(
    OTP_COOKIE,
    encodeCookie(payload),
    cookieOptions(TTL_MS / 1000),
  );
  await sendOperatorOtpEmail(email, code);
  return { ok: true };
}

/**
 * Verify a submitted code against the signed cookie. On success returns a
 * Firebase custom token the client exchanges for a session; on failure returns a
 * user-facing message (and burns one of the capped attempts).
 */
export async function verifyOperatorOtp(
  rawEmail: string,
  rawCode: string,
): Promise<{ customToken?: string; error?: string }> {
  const email = String(rawEmail || "")
    .trim()
    .toLowerCase();
  const code = String(rawCode || "").trim();
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code." };

  const ip = clientIp(await headers());
  const [byEmail, byIp] = await Promise.all([
    rateLimit(`op-otp-vf:${email}`, { max: 10, windowSeconds: 900 }),
    rateLimit(`op-otp-vf-ip:${ip}`, { max: 40, windowSeconds: 900 }),
  ]);
  if (!byEmail.allowed || !byIp.allowed) {
    return { error: "Too many attempts. Please wait a few minutes." };
  }

  const jar = await cookies();
  const payload = decodeCookie(jar.get(OTP_COOKIE)?.value);
  if (!payload || payload.e !== email) {
    return { error: "No active code. Request a new one." };
  }
  if (Date.now() > payload.x) {
    jar.delete(OTP_COOKIE);
    return { error: "That code expired. Request a new one." };
  }
  if (payload.a >= MAX_ATTEMPTS) {
    jar.delete(OTP_COOKIE);
    return { error: "Too many wrong attempts. Request a new code." };
  }

  if (!safeEqualHex(hashCode(code), payload.h)) {
    const next: OtpPayload = { ...payload, a: payload.a + 1 };
    const remaining = MAX_ATTEMPTS - next.a;
    if (remaining <= 0) {
      jar.delete(OTP_COOKIE);
      return { error: "Too many wrong attempts. Request a new code." };
    }
    const secondsLeft = Math.max(
      1,
      Math.round((payload.x - Date.now()) / 1000),
    );
    jar.set(OTP_COOKIE, encodeCookie(next), cookieOptions(secondsLeft));
    return {
      error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`,
    };
  }

  // Correct — consume the code so it can't be replayed.
  jar.delete(OTP_COOKIE);

  // Defense in depth: re-check the allowlist at the moment of sign-in.
  if (!(await isOperator(email))) {
    return { error: "This email isn't an operator account." };
  }

  try {
    const uid = await getOrCreateAuthUserIdByEmail(email);
    const customToken = await createCustomAuthToken(uid);
    return { customToken };
  } catch (err) {
    console.error("verifyOperatorOtp mint failed:", err);
    return { error: "Could not complete sign-in. Please try again." };
  }
}
