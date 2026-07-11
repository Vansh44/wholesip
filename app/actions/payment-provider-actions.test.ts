/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => STORE),
}));
vi.mock("@/lib/payments/crypto", () => ({
  encryptSecret: vi.fn((s: string) => `enc(${s})`),
}));
vi.mock("@/lib/payments/razorpay", () => ({
  validateCredentials: vi.fn(),
}));

import {
  getChannelState,
  saveRazorpayCredentials,
  setRazorpayEnabled,
  disconnectRazorpay,
} from "./payment-provider-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { validateCredentials } from "@/lib/payments/razorpay";
import { makeChain, makeSupabase } from "./_test-helpers";

const STORE = "a0000000-0000-4000-8000-000000000001";
const KEY_ID = "rzp_test_abc123XYZ";
const SECRET = "super_secret_value";

function makeAdmin(
  plan = "basic",
  providerRow: any = null,
  overrides: Record<string, any> = {},
) {
  return makeSupabase({
    stores: makeChain({
      data: { plan, plan_expires_at: null },
      error: null,
    }),
    store_payment_providers: makeChain(
      { data: providerRow, error: null },
      { data: providerRow ? [{ store_id: STORE }] : [], error: null },
    ),
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getManagerUserId).mockResolvedValue("admin-1");
  vi.mocked(validateCredentials).mockResolvedValue({
    ok: true,
    data: true,
  } as any);
});

describe("saveRazorpayCredentials", () => {
  it("rejects a caller without channels manage permission", async () => {
    vi.mocked(getManagerUserId).mockResolvedValue(null);
    const admin = makeAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await saveRazorpayCredentials(KEY_ID, SECRET);
    expect(res.error).toMatch(/permission/i);
    expect(admin._tables.store_payment_providers.upsert).not.toHaveBeenCalled();
  });

  it("enforces the plan gate server-side (free plan blocked)", async () => {
    const admin = makeAdmin("free");
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await saveRazorpayCredentials(KEY_ID, SECRET);
    expect(res.error).toMatch(/basic plan/i);
    expect(admin._tables.store_payment_providers.upsert).not.toHaveBeenCalled();
  });

  it("rejects a malformed key id before calling Razorpay", async () => {
    const admin = makeAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await saveRazorpayCredentials("not-a-key", SECRET);
    expect(res.error).toMatch(/key id/i);
    expect(validateCredentials).not.toHaveBeenCalled();
  });

  it("rejects credentials Razorpay itself refuses", async () => {
    vi.mocked(validateCredentials).mockResolvedValue({
      ok: false,
      error: "Authentication failed",
    } as any);
    const admin = makeAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await saveRazorpayCredentials(KEY_ID, SECRET);
    expect(res.error).toMatch(/rejected/i);
    expect(admin._tables.store_payment_providers.upsert).not.toHaveBeenCalled();
  });

  it("verifies, encrypts the secret, and enables the gateway", async () => {
    const admin = makeAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await saveRazorpayCredentials(` ${KEY_ID} `, ` ${SECRET} `);
    expect(res.success).toBe(true);
    expect(validateCredentials).toHaveBeenCalledWith({
      keyId: KEY_ID,
      keySecret: SECRET,
    });
    const upserted =
      admin._tables.store_payment_providers.upsert.mock.calls[0][0];
    expect(upserted.key_id).toBe(KEY_ID);
    // The secret is stored ENCRYPTED, never plaintext.
    expect(upserted.key_secret_enc).toBe(`enc(${SECRET})`);
    expect(upserted).not.toHaveProperty("key_secret");
    expect(upserted.enabled).toBe(true);
    expect(upserted.store_id).toBe(STORE);
  });
});

describe("setRazorpayEnabled", () => {
  it("blocks enabling on a plan without online payments", async () => {
    const admin = makeAdmin("free");
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await setRazorpayEnabled(true);
    expect(res.error).toMatch(/basic plan/i);
  });

  it("allows PAUSING regardless of plan (no upsell wall to turn things off)", async () => {
    const admin = makeAdmin("free", { key_id: KEY_ID, enabled: true });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await setRazorpayEnabled(false);
    expect(res.success).toBe(true);
  });

  it("errors when nothing is connected yet", async () => {
    const admin = makeAdmin("basic", null);
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await setRazorpayEnabled(true);
    expect(res.error).toMatch(/connect razorpay first/i);
  });
});

describe("getChannelState", () => {
  it("returns the key id and enabled state — never the secret", async () => {
    const admin = makeAdmin("basic", {
      key_id: KEY_ID,
      enabled: true,
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const state = await getChannelState();
    expect(state).toEqual({
      connected: true,
      keyId: KEY_ID,
      enabled: true,
      planAllowsOnlinePayments: true,
    });
    // The select never asks for the encrypted secret column.
    const selects =
      admin._tables.store_payment_providers.select.mock.calls.flat();
    for (const sel of selects) {
      expect(String(sel)).not.toMatch(/secret/);
    }
  });

  it("reports not-connected for a fresh store", async () => {
    const admin = makeAdmin("basic", null);
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const state = await getChannelState();
    expect(state.connected).toBe(false);
    expect(state.keyId).toBeNull();
  });
});

describe("disconnectRazorpay", () => {
  it("requires manage permission", async () => {
    vi.mocked(getManagerUserId).mockResolvedValue(null);
    const admin = makeAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await disconnectRazorpay();
    expect(res.error).toMatch(/permission/i);
  });

  it("deletes the provider row for the acting store", async () => {
    const admin = makeAdmin("basic", { key_id: KEY_ID, enabled: true });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await disconnectRazorpay();
    expect(res.success).toBe(true);
    expect(admin._tables.store_payment_providers.delete).toHaveBeenCalled();
    expect(admin._tables.store_payment_providers.eq).toHaveBeenCalledWith(
      "store_id",
      STORE,
    );
  });
});
