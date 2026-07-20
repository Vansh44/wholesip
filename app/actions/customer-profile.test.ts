/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "./_test-helpers";

vi.mock("@/lib/auth/firebase-users", () => ({
  updateAuthUser: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/server-user", () => ({ getServerUser: vi.fn() }));
vi.mock("@/lib/store/resolve", () => ({
  getCurrentStoreId: vi.fn(async () => "a0000000-0000-4000-8000-000000000001"),
  FALLBACK_STORE_ID: "a0000000-0000-4000-8000-000000000001",
}));

// The ported data layer: with* runners invoke the callback with the mock db.
const dbHolder = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/lib/db/client", () => ({
  withUser: vi.fn((_identity: any, fn: any) =>
    Promise.resolve(fn(dbHolder.current.db)),
  ),
  withService: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
  withAnon: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
}));

import { updateCustomerProfile } from "./customer-profile";
import { updateAuthUser } from "@/lib/auth/firebase-users";
import { getServerUser } from "@/lib/auth/server-user";

function makeFormData(fields: Record<string, string | null | undefined>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) fd.set(k, v);
  }
  return fd;
}

const serverUser = (overrides: Record<string, any> = {}) => ({
  id: "user-1",
  email: "old@example.com",
  phone: "+11234567890",
  phoneConfirmed: true,
  metadata: {},
  ...overrides,
});

// customer-profile.ts — the /profile page action that lets a signed-in
// shopper update their name and email. Identity comes from getServerUser; the
// email change goes through Identity Platform (updateAuthUser). Phone is NOT
// NULL UNIQUE in the DB so this action only ever writes it from a verified value.
describe("updateCustomerProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbHolder.current = makeDbMock();
    vi.mocked(updateAuthUser).mockResolvedValue();
    vi.mocked(getServerUser).mockResolvedValue(serverUser() as any);
  });

  // First name is the only required field.
  it("rejects when first name is missing", async () => {
    const result = await updateCustomerProfile(
      makeFormData({ firstName: "  " }),
    );
    expect(result.error).toMatch(/first name/i);
  });

  // Email shape sanity check — minimal "must contain @".
  it("rejects a malformed email", async () => {
    const result = await updateCustomerProfile(
      makeFormData({ firstName: "Ada", email: "no-at-sign" }),
    );
    expect(result.error).toMatch(/valid email/i);
  });

  // Anonymous visitors cannot update a profile.
  it("rejects unauthenticated callers", async () => {
    vi.mocked(getServerUser).mockResolvedValue(null);
    const result = await updateCustomerProfile(
      makeFormData({ firstName: "Ada" }),
    );
    expect(result.error).toMatch(/not authenticated/i);
  });

  // Changing the email updates the Identity Platform account.
  it("calls updateAuthUser when email changes", async () => {
    await updateCustomerProfile(
      makeFormData({ firstName: "Ada", email: "new@example.com" }),
    );
    expect(updateAuthUser).toHaveBeenCalledWith("user-1", {
      email: "new@example.com",
    });
  });

  // Same email → no auth update, just the profile upsert.
  it("does not call updateAuthUser when email is unchanged", async () => {
    await updateCustomerProfile(
      makeFormData({ firstName: "Ada", email: "old@example.com" }),
    );
    expect(updateAuthUser).not.toHaveBeenCalled();
  });

  // Phone is written from the verified auth identity only — never from the
  // form, never empty. Critical because users.phone is NOT NULL UNIQUE and an
  // empty string would collide across every phone-less customer.
  it("only writes phone when auth has a verified value", async () => {
    await updateCustomerProfile(makeFormData({ firstName: "Ada" }));
    expect(dbHolder.current.calls.values[0].phone).toBe("+11234567890");
  });

  it("omits phone entirely when auth has no phone", async () => {
    vi.mocked(getServerUser).mockResolvedValue(
      serverUser({ phone: null }) as any,
    );
    await updateCustomerProfile(makeFormData({ firstName: "Ada" }));
    expect(dbHolder.current.calls.values[0].phone).toBeUndefined();
  });
});
