/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "./_test-helpers";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/auth/server-user", () => ({ getServerUser: vi.fn() }));
vi.mock("@/lib/email/layout", () => ({
  wrapBrandedEmail: vi.fn((s: string) => s),
}));
vi.mock("@/lib/store/brand", () => ({
  getStoreBrandById: vi.fn(async () => ({
    name: "WholeSip",
    domain: "wholesip.com",
  })),
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

// The ported data layer: with* runners invoke the callback with the mock db.
const dbHolder = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/lib/db/client", () => ({
  withUser: vi.fn((_identity: any, fn: any) =>
    Promise.resolve(fn(dbHolder.current.db)),
  ),
  withService: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
  withAnon: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
}));

import { inviteUser } from "./invite-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerUser } from "@/lib/auth/server-user";

function makeFormData(fields: Record<string, string | null | undefined>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) fd.set(k, v);
  }
  return fd;
}

// The caller-role gate reads via withUser (select #1 = role + store_id), the
// email-collision check via withService (select #2). superadmin, in-store.
function superadminCaller(existingEmail = false) {
  dbHolder.current = makeDbMock({
    selectQueue: [
      [{ role: "superadmin", store_id: "store-1" }],
      existingEmail ? [{ id: "existing" }] : [],
    ],
  });
}

// invite-user.ts — superadmin-only action that creates a new dashboard user.
// Profile reads/writes are on Drizzle; auth.admin.createUser/deleteUser and the
// Resend email stay on their providers.
describe("inviteUser", () => {
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
    superadminCaller();
    vi.mocked(getServerUser).mockResolvedValue({
      id: "caller-1",
      email: "super@example.com",
      phone: null,
      phoneConfirmed: true,
      metadata: {},
    } as any);
    admin = {
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: { id: "new-user" } },
            error: null,
          }),
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    };
    vi.mocked(createAdminClient).mockReturnValue(admin);
  });

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

  it("rejects unknown role", async () => {
    const result = await inviteUser(
      makeFormData({ ...validForm, role: "ghost" }),
    );
    expect(result.error).toMatch(/invalid role/i);
  });

  it("rejects unauthenticated callers", async () => {
    vi.mocked(getServerUser).mockResolvedValue(null);
    const result = await inviteUser(makeFormData(validForm));
    expect(result.error).toMatch(/not authenticated/i);
  });

  it("rejects non-superadmin callers", async () => {
    dbHolder.current = makeDbMock({
      selectQueue: [[{ role: "member", store_id: "store-1" }]],
    });
    const result = await inviteUser(makeFormData(validForm));
    expect(result.error).toMatch(/unauthorized|superadmin/i);
  });

  it("rejects when a profile with that email already exists", async () => {
    superadminCaller(true);
    const result = await inviteUser(makeFormData(validForm));
    expect(result.error).toMatch(/already exists/i);
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("creates the auth user + profile and sends invite email", async () => {
    const result = await inviteUser(makeFormData(validForm));
    expect(result.success).toBe(true);
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        email_confirm: true,
      }),
    );
    // Profile upserted with the new auth id + inviter's store.
    expect(dbHolder.current.calls.values[0]).toMatchObject({
      id: "new-user",
      email: "ada@example.com",
      storeId: "store-1",
      invitedBy: "caller-1",
    });
    expect(resendSend).toHaveBeenCalledTimes(1);
  });

  it("cleans up the auth user if profile insert fails", async () => {
    superadminCaller();
    dbHolder.current.db.insert = vi.fn(() => {
      throw new Error("no");
    });
    const result = await inviteUser(makeFormData(validForm));
    expect(result.error).toMatch(/failed to create user profile/i);
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith("new-user");
  });

  it("falls back gracefully without RESEND_API_KEY (dev mode)", async () => {
    process.env.RESEND_API_KEY = "placeholder";
    const result = await inviteUser(makeFormData(validForm));
    expect(result.success).toBe(true);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("escapes HTML in the invitee name within the email body", async () => {
    await inviteUser(
      makeFormData({ ...validForm, firstName: "<img/onerror=x>" }),
    );
    const sentHtml = resendSend.mock.calls[0][0].html as string;
    expect(sentHtml).not.toContain("<img/onerror");
    expect(sentHtml).toContain("&lt;img");
  });
});
