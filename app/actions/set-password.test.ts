/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "./_test-helpers";

vi.mock("@/lib/auth/firebase-users", () => ({
  updateAuthUser: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/firebase-claims", () => ({
  setUserClaims: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/server-user", () => ({ getServerUser: vi.fn() }));

// The ported data layer: with* runners invoke the callback with the mock db.
const dbHolder = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/lib/db/client", () => ({
  withUser: vi.fn((_identity: any, fn: any) =>
    Promise.resolve(fn(dbHolder.current.db)),
  ),
  withService: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
  withAnon: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
}));

import { setPassword } from "./set-password";
import { updateAuthUser } from "@/lib/auth/firebase-users";
import { setUserClaims } from "@/lib/auth/firebase-claims";
import { getServerUser } from "@/lib/auth/server-user";

function makeFormData(fields: Record<string, string | null | undefined>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) fd.set(k, v);
  }
  return fd;
}

// set-password.ts — the action behind /auth/set-password, which an invited
// user lands on after their first sign-in (force_password_reset=true). The
// password update + claim clear go through Identity Platform; the admins
// own-row update is on Drizzle (withUser). It returns success (no redirect) so
// the client can re-mint the session cookie with the cleared claim.
describe("setPassword", () => {
  const validForm = {
    password: "supersecret",
    confirmPassword: "supersecret",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "+11234567890",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dbHolder.current = makeDbMock();
    vi.mocked(updateAuthUser).mockResolvedValue();
    vi.mocked(setUserClaims).mockResolvedValue();
    vi.mocked(getServerUser).mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      phone: null,
      phoneConfirmed: false,
      metadata: {},
    } as any);
  });

  // Field validation runs before any auth call.
  it("rejects short passwords", async () => {
    const result = await setPassword(
      makeFormData({
        ...validForm,
        password: "short",
        confirmPassword: "short",
      }),
    );
    expect(result?.error).toMatch(/8 characters/);
  });

  it("rejects mismatched passwords", async () => {
    const result = await setPassword(
      makeFormData({ ...validForm, confirmPassword: "different-pw" }),
    );
    expect(result?.error).toMatch(/do not match/i);
  });

  it("requires first name", async () => {
    const result = await setPassword(
      makeFormData({ ...validForm, firstName: "  " }),
    );
    expect(result?.error).toMatch(/first name/i);
  });

  // Phone is required because users.phone is NOT NULL; the UI is
  // expected to have verified it via OTP before submitting.
  it("requires a phone of length >= 10", async () => {
    const result = await setPassword(
      makeFormData({ ...validForm, phone: "12345" }),
    );
    expect(result?.error).toMatch(/phone/i);
  });

  // If the password update fails (e.g. policy), we must NOT clear
  // force_password_reset — the user still hasn't chosen a password.
  it("returns the auth error and does not clear force_password_reset", async () => {
    vi.mocked(updateAuthUser).mockRejectedValueOnce(new Error("policy"));
    const result = await setPassword(makeFormData(validForm));
    expect(result?.error).toMatch(/couldn.?t set your password/i);
    expect(dbHolder.current.calls.update).toHaveLength(0);
    expect(setUserClaims).not.toHaveBeenCalled();
  });

  // Happy path — set the password, clear the flag + claim, and return success
  // (the client re-mints the session cookie and navigates).
  it("sets password, clears force_password_reset, and returns success", async () => {
    const result = await setPassword(makeFormData(validForm));
    expect(result).toEqual({ success: true });

    expect(updateAuthUser).toHaveBeenCalledWith("user-1", {
      password: "supersecret",
    });
    const updatePayload = dbHolder.current.calls.set[0];
    expect(updatePayload.forcePasswordReset).toBe(false);
    expect(updatePayload.firstName).toBe("Ada");
    // The custom claim is cleared so the proxy stops bouncing the user here.
    expect(setUserClaims).toHaveBeenCalledWith("user-1", {
      forcePasswordReset: false,
    });
  });
});
