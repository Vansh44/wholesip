/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/email/layout", () => ({
  wrapBrandedEmail: vi.fn((s: string) => s),
}));
// vi.hoisted ensures `resendSend` exists at the moment the `vi.mock("resend")`
// factory runs (mocks are hoisted above imports). The factory must return a
// real constructor (class), because invite-user.ts uses `new Resend(...)`.
const { resendSend } = vi.hoisted(() => ({
  resendSend: vi.fn().mockResolvedValue({}),
}));
vi.mock("resend", () => {
  class Resend {
    emails: { send: typeof resendSend };
    constructor() {
      this.emails = { send: resendSend };
    }
  }
  return { Resend };
});

import { inviteUser } from "./invite-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeChain, makeSupabase } from "./_test-helpers";

function makeFormData(fields: Record<string, string | null | undefined>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) fd.set(k, v);
  }
  return fd;
}

// invite-user.ts — superadmin-only action that creates a new dashboard user.
// Generates a cryptographically-secure temp password, sends the credentials
// via Resend (or logs them in dev fallback).
describe("inviteUser", () => {
  let supabase: any;
  let admin: any;
  const validForm = {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    role: "member",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resendSend.mockClear();
    resendSend.mockResolvedValue({});
    process.env.RESEND_API_KEY = "re_actual_key";
    supabase = makeSupabase({
      profiles: makeChain({ data: { role: "superadmin" }, error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(supabase);
    admin = makeSupabase({
      profiles: makeChain({ data: null, error: null }), // not already-taken
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
  });

  // Field-level validation runs before any DB call.
  it("rejects empty first name", async () => {
    const result = await inviteUser(
      makeFormData({ ...validForm, firstName: "" }),
    );
    expect(result.error).toMatch(/first name/i);
  });

  it("rejects malformed email", async () => {
    const result = await inviteUser(makeFormData({ ...validForm, email: "x" }));
    expect(result.error).toMatch(/valid email/i);
  });

  // Only superadmin / member are valid roles for the legacy invite endpoint.
  it("rejects unknown role", async () => {
    const result = await inviteUser(
      makeFormData({ ...validForm, role: "ghost" }),
    );
    expect(result.error).toMatch(/invalid role/i);
  });

  // Anonymous visitors cannot invite — even before reaching the DB.
  it("rejects unauthenticated callers", async () => {
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    const result = await inviteUser(makeFormData(validForm));
    expect(result.error).toMatch(/not authenticated/i);
  });

  // Only superadmins can invite — verifies even a 'member' caller is blocked.
  it("rejects non-superadmin callers", async () => {
    supabase._tables.profiles = makeChain({
      data: { role: "member" },
      error: null,
    });
    const result = await inviteUser(makeFormData(validForm));
    expect(result.error).toMatch(/unauthorized|superadmin/i);
  });

  // Email collision check at the profiles layer (auth catches duplicates too,
  // but a phone-only auth account can collide at the profile layer).
  it("rejects when a profile with that email already exists", async () => {
    admin._tables.profiles = makeChain({
      data: { id: "existing" },
      error: null,
    });
    const result = await inviteUser(makeFormData(validForm));
    expect(result.error).toMatch(/already exists/i);
  });

  // Happy path — creates the auth user and inserts the profile, then sends
  // the welcome email via Resend (mocked here).
  it("creates the auth user + profile and sends invite email", async () => {
    const result = await inviteUser(makeFormData(validForm));
    expect(result.success).toBe(true);
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        email_confirm: true,
      }),
    );
    expect(admin._tables.profiles.upsert).toHaveBeenCalled();
    expect(resendSend).toHaveBeenCalledTimes(1);
  });

  // If profile insert fails, the auth user must be cleaned up — leaves no
  // orphan auth accounts.
  it("cleans up the auth user if profile insert fails", async () => {
    admin._tables.profiles = makeChain({
      data: null,
      error: { code: "boom", message: "no" },
    });
    // Force the upsert path to return the error result rather than success.
    admin._tables.profiles.upsert = vi.fn(() => admin._tables.profiles);
    admin._tables.profiles.then = (resolve: any) =>
      Promise.resolve({
        data: null,
        error: { code: "boom", message: "no" },
      }).then(resolve);
    const result = await inviteUser(makeFormData(validForm));
    expect(result.error).toMatch(/failed to create user profile/i);
    expect(admin.auth.admin.deleteUser).toHaveBeenCalled();
  });

  // When no Resend key is configured (dev fallback) the action still succeeds
  // and the temp password is printed to the console — never the other way.
  it("falls back gracefully without RESEND_API_KEY (dev mode)", async () => {
    process.env.RESEND_API_KEY = "placeholder";
    const result = await inviteUser(makeFormData(validForm));
    expect(result.success).toBe(true);
    expect(resendSend).not.toHaveBeenCalled();
  });

  // HTML escaping is the only defence against an attacker-controlled name
  // landing inside the invite email body. Without it, < and > would render
  // as raw HTML.
  it("escapes HTML in the invitee name within the email body", async () => {
    await inviteUser(
      makeFormData({ ...validForm, firstName: "<img/onerror=x>" }),
    );
    const sentHtml = resendSend.mock.calls[0][0].html as string;
    expect(sentHtml).not.toContain("<img/onerror");
    expect(sentHtml).toContain("&lt;img");
  });
});
