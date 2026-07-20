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

const cookies = vi.fn();
const headers = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => cookies(),
  headers: () => headers(),
}));

const rateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => rateLimit(...(a as [])),
  clientIp: () => "1.2.3.4",
}));

// isOperator reads platform_admins via withService — return preset rows.
let operatorRows: { email: string }[];
const withService = vi.fn();
vi.mock("@/lib/db/client", () => ({
  withService: (...a: unknown[]) => withService(...(a as [])),
}));

// Capture the code the email would carry so verify can submit the right one.
let sentCode = "";
const sendOperatorOtpEmail = vi.fn();
vi.mock("@/lib/email/operator-otp", () => ({
  sendOperatorOtpEmail: (...a: unknown[]) =>
    sendOperatorOtpEmail(...(a as [string, string])),
}));

const getOrCreateAuthUserIdByEmail = vi.fn();
const createCustomAuthToken = vi.fn();
vi.mock("@/lib/auth/firebase-users", () => ({
  getOrCreateAuthUserIdByEmail: () => getOrCreateAuthUserIdByEmail(),
  createCustomAuthToken: () => createCustomAuthToken(),
}));

import { requestOperatorOtp, verifyOperatorOtp } from "./operator-otp-actions";

const OP = "operator@storemink.com";

// Re-establish implementations AFTER clearAllMocks so nothing bleeds across
// tests/files (clearAllMocks wipes implementations set inline in the factory).
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-otp-secret";
  jar = new Map();
  operatorRows = [{ email: OP }];
  sentCode = "";
  cookies.mockImplementation(async () => fakeJar);
  headers.mockImplementation(
    async () => new Headers({ "x-forwarded-for": "1.2.3.4" }),
  );
  rateLimit.mockResolvedValue({ allowed: true });
  withService.mockImplementation(async () => operatorRows);
  sendOperatorOtpEmail.mockImplementation(async (_to: string, code: string) => {
    sentCode = code;
    return { sent: true };
  });
  getOrCreateAuthUserIdByEmail.mockResolvedValue("uid-123");
  createCustomAuthToken.mockResolvedValue("custom-token-abc");
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
    // MAX_ATTEMPTS is 3, so one wrong attempt leaves 2.
    expect(r.error).toMatch(/2 attempts left/);
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
