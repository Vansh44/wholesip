/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/store/resolve", () => ({
  getCurrentStoreId: vi.fn(async () => "a0000000-0000-4000-8000-000000000001"),
  WHOLESIP_STORE_ID: "a0000000-0000-4000-8000-000000000001",
}));

import { updateCustomerProfile } from "./customer-profile";
import { createClient } from "@/lib/supabase/server";
import { makeChain, makeSupabase } from "./_test-helpers";

function makeFormData(fields: Record<string, string | null | undefined>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) fd.set(k, v);
  }
  return fd;
}

// customer-profile.ts — the /profile page action that lets a signed-in
// shopper update their name and email. Phone is NOT NULL UNIQUE in the DB
// so this action only ever writes it when auth has a verified value.
describe("updateCustomerProfile", () => {
  let supabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase(
      {
        users: makeChain({ data: null, error: null }),
      },
      { id: "user-1", email: "old@example.com", phone: "+11234567890" },
    );
    vi.mocked(createClient).mockResolvedValue(supabase);
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
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    const result = await updateCustomerProfile(
      makeFormData({ firstName: "Ada" }),
    );
    expect(result.error).toMatch(/not authenticated/i);
  });

  // Changing the email triggers a Supabase Auth update (which sends the
  // confirmation flow on the auth side).
  it("calls auth.updateUser when email changes", async () => {
    await updateCustomerProfile(
      makeFormData({ firstName: "Ada", email: "new@example.com" }),
    );
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({
      email: "new@example.com",
    });
  });

  // Same email → no auth update, just the profile upsert.
  it("does not call auth.updateUser when email is unchanged", async () => {
    await updateCustomerProfile(
      makeFormData({ firstName: "Ada", email: "old@example.com" }),
    );
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  // Phone is written from auth.user.phone only — never from the form, never
  // empty. Critical because users.phone is NOT NULL UNIQUE and an empty
  // string would collide across every phone-less customer.
  it("only writes phone when auth has a verified value", async () => {
    await updateCustomerProfile(makeFormData({ firstName: "Ada" }));
    const upserted = supabase._tables.users.upsert.mock.calls[0][0];
    expect(upserted.phone).toBe("+11234567890");
  });

  it("omits phone entirely when auth has no phone", async () => {
    supabase = makeSupabase(
      { users: makeChain({ data: null, error: null }) },
      { id: "user-1", email: "old@example.com", phone: null },
    );
    vi.mocked(createClient).mockResolvedValue(supabase);
    await updateCustomerProfile(makeFormData({ firstName: "Ada" }));
    const upserted = supabase._tables.users.upsert.mock.calls[0][0];
    expect(upserted.phone).toBeUndefined();
  });
});
