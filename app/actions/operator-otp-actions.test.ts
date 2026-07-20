import { describe, it, expect, vi, beforeEach } from "vitest";

// A shared fake cookie jar so requestOperatorOtp (sets) and verifyOperatorOtp
// (reads) see the same cookie within a test.
let jar: Map<string, string>;
const fakeJar = {
  get: (k: string) =>
    jar.has(k) ? { value: jar.get(k) as string } : undefined,
  set: (k: string, v: string) => {
    jar.set(k, v);
  },
  delete: (k: string) => {
    jar.delete(k);
  },
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => fakeJar),
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "1.2.3.4" })),
}));

const rateLimit = vi.fn(async () => ({ allowed: true }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => rateLimit(...(a as [])),
  clientIp: () => "1.2.3.4",
}));

// isOperator reads platform_admins via withService — return preset rows.
let operatorRows: { email: string }[];
vi.mock("@/lib/db/client", () => ({
  withService: vi.fn(async () => operatorRows),
}));

// Capture the code the email would carry so verify can submit the right one.
let sentCode = "";
const sendOperatorOtpEmail = vi.fn(async (_to: string, code: string) => {
  sentCode = code;
  return { sent: true };
});
vi.mock("@/lib/email/operator-otp", () => ({
  sendOperatorOtpEmail: (...a: unknown[]) =>
    sendOperatorOtpEmail(...(a as [string, string])),
}));

const getOrCreateAuthUserIdByEmail = vi.fn(async () => "uid-123");
const createCustomAuthToken = vi.fn(async () => "custom-token-abc");
vi.mock("@/lib/auth/firebase-users", () => ({
  getOrCreateAuthUserIdByEmail: () => getOrCreateAuthUserIdByEmail(),
  createCustomAuthToken: () => createCustomAuthToken(),
}));

import { requestOperatorOtp, verifyOperatorOtp } from "./operator-otp-actions";

const OP = "operator@storemink.com";

beforeEach(() => {
  process.env.CRON_SECRET = "test-otp-secret";
  jar = new Map();
  operatorRows = [{ email: OP }];
  sentCode = "";
  rateLimit.mockResolvedValue({ allowed: true });
  vi.clearAllMocks();
  rateLimit.mockResolvedValue({ allowed: true });
});

describe("requestOperatorOtp", () => {
  it("rejects a malformed email", async () => {
    const r = await requestOperatorOtp("not-an-email");
    expect(r.ok).toBe(false);
    expect(sendOperatorOtpEmail).not.toHaveBeenCalled();
    expect(jar.size).toBe(0);
  });

  it("issues a code + cookie for an operator", async () => {
    const r = await requestOperatorOtp(OP);
    expect(r.ok).toBe(true);
    expect(sendOperatorOtpEmail).toHaveBeenCalledOnce();
    expect(sentCode).toMatch(/^\d{6}$/);
    expect(jar.get("sm_op_otp")).toBeTruthy();
  });

  it("stays quiet (no code) for a non-operator but still returns ok", async () => {
    operatorRows = [];
    const r = await requestOperatorOtp("stranger@example.com");
    expect(r.ok).toBe(true);
    expect(sendOperatorOtpEmail).not.toHaveBeenCalled();
    expect(jar.size).toBe(0);
  });

  it("blocks when rate limited", async () => {
    rateLimit.mockResolvedValue({ allowed: false });
    const r = await requestOperatorOtp(OP);
    expect(r.ok).toBe(false);
    expect(sendOperatorOtpEmail).not.toHaveBeenCalled();
  });
});

describe("verifyOperatorOtp", () => {
  it("mints a custom token for the correct code", async () => {
    await requestOperatorOtp(OP);
    const r = await verifyOperatorOtp(OP, sentCode);
    expect(r.error).toBeUndefined();
    expect(r.customToken).toBe("custom-token-abc");
    // consumed
    expect(jar.has("sm_op_otp")).toBe(false);
  });

  it("rejects a wrong code and counts the attempt down", async () => {
    await requestOperatorOtp(OP);
    const wrong = sentCode === "000000" ? "111111" : "000000";
    const r = await verifyOperatorOtp(OP, wrong);
    expect(r.customToken).toBeUndefined();
    expect(r.error).toMatch(/4 attempts left/);
    // cookie survives for the next attempt
    expect(jar.has("sm_op_otp")).toBe(true);
  });

  it("rejects when there is no active code", async () => {
    const r = await verifyOperatorOtp(OP, "123456");
    expect(r.error).toMatch(/No active code/);
  });

  it("rejects a tampered cookie", async () => {
    await requestOperatorOtp(OP);
    jar.set("sm_op_otp", jar.get("sm_op_otp")!.slice(0, -2) + "zz");
    const r = await verifyOperatorOtp(OP, sentCode);
    expect(r.error).toMatch(/No active code/);
  });

  it("rejects a non-6-digit code without touching the cookie", async () => {
    await requestOperatorOtp(OP);
    const r = await verifyOperatorOtp(OP, "12ab");
    expect(r.error).toMatch(/6-digit/);
  });
});
