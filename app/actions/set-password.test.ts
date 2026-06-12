/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
// next/navigation.redirect throws to halt rendering — model that here.
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("__REDIRECT__");
  }),
}));

import { setPassword } from "./set-password";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { makeChain, makeSupabase } from "./_test-helpers";

function makeFormData(fields: Record<string, string | null | undefined>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) fd.set(k, v);
  }
  return fd;
}

// set-password.ts — the action behind /auth/set-password, which an invited
// user lands on after their first sign-in (force_password_reset=true).
describe("setPassword", () => {
  let supabase: any;
  const validForm = {
    password: "supersecret",
    confirmPassword: "supersecret",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "+11234567890",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase({
      profiles: makeChain({ data: null, error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(supabase);
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

  // Phone is required because customers.phone is NOT NULL; the UI is
  // expected to have verified it via OTP before submitting.
  it("requires a phone of length >= 10", async () => {
    const result = await setPassword(
      makeFormData({ ...validForm, phone: "12345" }),
    );
    expect(result?.error).toMatch(/phone/i);
  });

  // If auth.updateUser fails (e.g. password policy), we must NOT clear
  // force_password_reset — the user still hasn't chosen a password.
  it("returns the auth error and does not clear force_password_reset", async () => {
    supabase.auth.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Password rejected" },
    });
    const result = await setPassword(makeFormData(validForm));
    expect(result?.error).toMatch(/password rejected/i);
    expect(supabase._tables.profiles.update).not.toHaveBeenCalled();
  });

  // Happy path — set password, clear flag, refresh JWT, then redirect to
  // /dashboard (modeled here as a throw from the next/navigation mock).
  it("sets password, clears force_password_reset, and redirects to /dashboard", async () => {
    await expect(setPassword(makeFormData(validForm))).rejects.toThrow(
      "__REDIRECT__",
    );

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({
      password: "supersecret",
    });
    const updatePayload = supabase._tables.profiles.update.mock.calls[0][0];
    expect(updatePayload.force_password_reset).toBe(false);
    expect(updatePayload.first_name).toBe("Ada");
    // refreshSession mints a fresh JWT with the cleared flag, so the
    // middleware doesn't bounce the user back here.
    expect(supabase.auth.refreshSession).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
