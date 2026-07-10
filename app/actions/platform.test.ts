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

import { setStorePlan } from "./platform";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidateTag } from "next/cache";
import { makeChain, makeSupabase } from "./_test-helpers";

const OPERATOR = { id: "op-1", email: "op@storemink.com" };

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
function makeAdmin(plan = "free") {
  return makeSupabase({
    stores: makeChain(
      { data: { id: "s1", plan }, error: null },
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

  it("rejects an unknown plan id (incl. the retired 'growth')", async () => {
    expect((await setStorePlan("s1", "growth")).error).toMatch(/invalid plan/i);
    expect((await setStorePlan("s1", "PRO")).error).toMatch(/invalid plan/i);
    expect(admin._tables.stores.update).not.toHaveBeenCalled();
  });

  it("rejects when the store is already on the target plan", async () => {
    admin = makeAdmin("pro");
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await setStorePlan("s1", "pro");
    expect(res.error).toMatch(/already on pro/i);
    expect(admin._tables.stores.update).not.toHaveBeenCalled();
  });

  it("rejects downgrades (upgrade-only console)", async () => {
    admin = makeAdmin("pro");
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await setStorePlan("s1", "starter");
    expect(res.error).toMatch(/can't be downgraded/i);
    expect(admin._tables.stores.update).not.toHaveBeenCalled();

    admin = makeAdmin("starter");
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res2 = await setStorePlan("s1", "free");
    expect(res2.error).toMatch(/can't be downgraded/i);
  });

  it("upgrades free → pro, marks the plan comp, audits, and busts the cache", async () => {
    const res = await setStorePlan("s1", "pro");
    expect(res.success).toBe(true);

    // Plan written as an operator comp.
    expect(admin._tables.stores.update).toHaveBeenCalledWith({
      plan: "pro",
      plan_source: "comp",
    });
    // Guarded by id AND the previously-read plan (stale-row protection).
    expect(admin._tables.stores.eq).toHaveBeenCalledWith("id", "s1");
    expect(admin._tables.stores.eq).toHaveBeenCalledWith("plan", "free");

    // Audit row records who did what.
    expect(admin._tables.plan_events.insert).toHaveBeenCalledWith({
      store_id: "s1",
      from_plan: "free",
      to_plan: "pro",
      source: "operator",
      actor: OPERATOR.email,
    });

    expect(revalidateTag).toHaveBeenCalled();
  });

  it("upgrades starter → pro (the only path up from starter)", async () => {
    admin = makeAdmin("starter");
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await setStorePlan("s1", "pro");
    expect(res.success).toBe(true);
    expect(admin._tables.stores.update).toHaveBeenCalledWith({
      plan: "pro",
      plan_source: "comp",
    });
  });

  it("still succeeds when the audit insert fails (best-effort trail)", async () => {
    admin = makeAdmin("free");
    admin._tables.plan_events = makeChain(undefined, {
      error: { message: "boom" },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const res = await setStorePlan("s1", "starter");
    expect(res.success).toBe(true);
  });
});
