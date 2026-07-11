/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

// setStorePlan authenticates the operator with the cookie client (platform_admins
// lookup) and does the store read/write + audit insert with the service role.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
// platform.ts pulls STORE_TAG/WHOLESIP_STORE_ID from resolve.ts, whose module
// scope calls unstable_cache — stub the constants instead of loading it.
vi.mock("@/lib/store/resolve", () => ({
  STORE_TAG: "stores",
  WHOLESIP_STORE_ID: "a0000000-0000-4000-8000-000000000001",
}));
// Unrelated heavyweight imports of platform.ts — stub so the module loads lean.
vi.mock("@/lib/themes", () => ({ getThemeDefinition: vi.fn() }));
vi.mock("@/lib/themes/apply", () => ({ applyTheme: vi.fn() }));
vi.mock("@/lib/supabase/storage-cleanup", () => ({
  deleteStorageUrls: vi.fn(),
}));

import { setStorePlan, grantAiCredits } from "./platform";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidateTag } from "next/cache";
import { makeChain, makeSupabase } from "./_test-helpers";

const OPERATOR = { id: "op-1", email: "op@storemink.com" };
const FUTURE = "2030-01-01T00:00:00.000Z";
const PAST = "2020-01-01T00:00:00.000Z";

// Cookie client: the caller is a platform_admins superadmin unless overridden.
function makeViewerClient(role: string | null = "superadmin") {
  return makeSupabase(
    {
      platform_admins: makeChain(
        role
          ? { data: { email: OPERATOR.email, role }, error: null }
          : { data: null, error: null },
      ),
    },
    OPERATOR,
  );
}

// Service-role client: the target store + audit table.
function makeAdmin(plan = "free", planExpiresAt: string | null = null) {
  return makeSupabase({
    stores: makeChain(
      {
        data: { id: "s1", plan, plan_expires_at: planExpiresAt },
        error: null,
      },
      { error: null },
    ),
    plan_events: makeChain(undefined, { error: null }),
  });
}

describe("setStorePlan", () => {
  let admin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    admin = makeAdmin("free");
    vi.mocked(createClient).mockResolvedValue(makeViewerClient());
    vi.mocked(createAdminClient).mockReturnValue(admin);
  });

  it("rejects a non-superadmin operator", async () => {
    vi.mocked(createClient).mockResolvedValue(makeViewerClient("member"));
    const res = await setStorePlan("s1", "pro");
    expect(res.error).toMatch(/superadmin/i);
    expect(admin._tables.stores.update).not.toHaveBeenCalled();
  });

  it("rejects a caller who is not a platform admin at all", async () => {
    vi.mocked(createClient).mockResolvedValue(makeViewerClient(null));
    const res = await setStorePlan("s1", "pro");
    expect(res.error).toMatch(/superadmin/i);
  });

  it("rejects unknown plan ids (incl. the retired 'growth' and 'starter')", async () => {
    expect((await setStorePlan("s1", "growth")).error).toMatch(/invalid plan/i);
    expect((await setStorePlan("s1", "starter")).error).toMatch(
      /invalid plan/i,
    );
    expect((await setStorePlan("s1", "PRO")).error).toMatch(/invalid plan/i);
    expect(admin._tables.stores.update).not.toHaveBeenCalled();
  });

  it("rejects when the store is already on the target plan with the same expiry", async () => {
    admin = makeAdmin("pro");
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await setStorePlan("s1", "pro");
    expect(res.error).toMatch(/already on pro/i);
    expect(admin._tables.stores.update).not.toHaveBeenCalled();
  });

  it("allows re-granting the same plan with a different expiry", async () => {
    admin = makeAdmin("pro", null);
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await setStorePlan("s1", "pro", { expiresAt: FUTURE });
    expect(res.success).toBe(true);
    expect(admin._tables.stores.update).toHaveBeenCalledWith({
      plan: "pro",
      plan_source: "comp",
      plan_expires_at: FUTURE,
    });
  });

  it("allows downgrades (operator may set any plan)", async () => {
    admin = makeAdmin("pro");
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await setStorePlan("s1", "basic");
    expect(res.success).toBe(true);
    expect(admin._tables.stores.update).toHaveBeenCalledWith({
      plan: "basic",
      plan_source: "comp",
      plan_expires_at: null,
    });

    admin = makeAdmin("basic");
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res2 = await setStorePlan("s1", "free");
    expect(res2.success).toBe(true);
  });

  it("rejects an unparseable or past expiry", async () => {
    expect(
      (await setStorePlan("s1", "pro", { expiresAt: "not-a-date" })).error,
    ).toMatch(/invalid expiry/i);
    expect(
      (await setStorePlan("s1", "pro", { expiresAt: PAST })).error,
    ).toMatch(/future/i);
    expect(admin._tables.stores.update).not.toHaveBeenCalled();
  });

  it("sets a timed plan, marks it comp, audits with the expiry, and busts the cache", async () => {
    const res = await setStorePlan("s1", "pro", { expiresAt: FUTURE });
    expect(res.success).toBe(true);

    expect(admin._tables.stores.update).toHaveBeenCalledWith({
      plan: "pro",
      plan_source: "comp",
      plan_expires_at: FUTURE,
    });
    // Guarded by id AND the previously-read plan (stale-row protection).
    expect(admin._tables.stores.eq).toHaveBeenCalledWith("id", "s1");
    expect(admin._tables.stores.eq).toHaveBeenCalledWith("plan", "free");

    // Audit row records who did what and until when.
    expect(admin._tables.plan_events.insert).toHaveBeenCalledWith({
      store_id: "s1",
      from_plan: "free",
      to_plan: "pro",
      source: "operator",
      actor: OPERATOR.email,
      note: "expires 2030-01-01",
    });

    expect(revalidateTag).toHaveBeenCalled();
  });

  it("an indefinite paid grant audits as such", async () => {
    const res = await setStorePlan("s1", "basic");
    expect(res.success).toBe(true);
    expect(admin._tables.plan_events.insert).toHaveBeenCalledWith(
      expect.objectContaining({ to_plan: "basic", note: "indefinite" }),
    );
  });

  it("the free plan never carries an expiry (ignored if sent)", async () => {
    admin = makeAdmin("pro");
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await setStorePlan("s1", "free", { expiresAt: FUTURE });
    expect(res.success).toBe(true);
    expect(admin._tables.stores.update).toHaveBeenCalledWith({
      plan: "free",
      plan_source: "comp",
      plan_expires_at: null,
    });
  });

  it("still succeeds when the audit insert fails (best-effort trail)", async () => {
    admin = makeAdmin("free");
    admin._tables.plan_events = makeChain(undefined, {
      error: { message: "boom" },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await setStorePlan("s1", "basic");
    expect(res.success).toBe(true);
  });
});

describe("grantAiCredits", () => {
  let admin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    admin = makeAdmin("basic");
    admin.rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    vi.mocked(createClient).mockResolvedValue(makeViewerClient());
    vi.mocked(createAdminClient).mockReturnValue(admin);
  });

  it("rejects a non-superadmin operator", async () => {
    vi.mocked(createClient).mockResolvedValue(makeViewerClient("member"));
    const res = await grantAiCredits("s1", 50);
    expect(res.error).toMatch(/superadmin/i);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("rejects non-integer, zero and oversized amounts", async () => {
    expect((await grantAiCredits("s1", 0)).error).toMatch(/whole number/i);
    expect((await grantAiCredits("s1", 2.5)).error).toMatch(/whole number/i);
    expect((await grantAiCredits("s1", 10001)).error).toMatch(/whole number/i);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("rejects an unknown store", async () => {
    admin = makeAdmin("basic");
    admin._tables.stores.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    admin.rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await grantAiCredits("nope", 50);
    expect(res.error).toMatch(/not found/i);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("grants through the atomic RPC with the operator email as the audited ref", async () => {
    const res = await grantAiCredits("s1", 50, "onboarding goodwill");
    expect(res.success).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith("add_ai_credits", {
      p_store: "s1",
      p_delta: 50,
      p_kind: "grant",
      p_ref: OPERATOR.email,
      p_note: "onboarding goodwill",
    });
  });

  it("surfaces an RPC failure as a friendly error", async () => {
    admin.rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await grantAiCredits("s1", 50);
    expect(res.error).toMatch(/could not grant/i);
  });
});
