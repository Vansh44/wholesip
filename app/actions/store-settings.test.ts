/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  // lib/store/resolve (imported for STORE_TAG) wraps its lookups at module
  // load — pass the function through untouched.
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => "store-1"),
  getViewerContext: vi.fn(),
}));

import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId, getViewerContext } from "@/app/dashboard/lib/access";
import { getStoreSettingsForEditor, saveStoreSettings } from "./store-settings";
import { makeChain, makeSupabase } from "./_test-helpers";

function makeAdmin(storeRow: any) {
  return makeSupabase({
    stores: makeChain({ data: storeRow, error: null }),
  });
}

describe("store-settings actions", () => {
  let admin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    admin = makeAdmin({ settings: {}, plan: "free" });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
    vi.mocked(getViewerContext).mockResolvedValue({
      userId: "user-1",
      userEmail: "a@b.c",
      profile: { email: "a@b.c", role: "superadmin" },
      isSuperadmin: true,
      permissions: {},
      storeId: "store-1",
      isPlatformAdmin: false,
    } as any);
  });

  describe("getStoreSettingsForEditor", () => {
    it("returns the catalog with resolved values", async () => {
      admin = makeAdmin({
        settings: { features: { "blogs.customerSubmissions": false } },
        plan: "free",
      });
      vi.mocked(createAdminClient).mockReturnValue(admin);

      const { settings } = await getStoreSettingsForEditor();
      const byKey = Object.fromEntries(settings.map((s) => [s.key, s]));
      expect(byKey["blogs.customerSubmissions"].value).toBe(false);
      expect(byKey["blogs.requireApproval"].value).toBe(true); // default
      expect(byKey["blogs.requireApproval"].dependsOn).toBe(
        "blogs.customerSubmissions",
      );
    });

    it("returns an empty catalog without a viewer profile", async () => {
      vi.mocked(getViewerContext).mockResolvedValue(null as any);
      const { settings } = await getStoreSettingsForEditor();
      expect(settings).toEqual([]);
    });

    // Each setting is gated by ITS OWN section — no permissions, no catalog.
    it("returns an empty catalog without view permission on any section", async () => {
      vi.mocked(getViewerContext).mockResolvedValue({
        profile: { email: "a@b.c", role: "editor" },
        isSuperadmin: false,
        permissions: { products: ["view"] }, // no blogs access
        storeId: "store-1",
      } as any);
      const { settings } = await getStoreSettingsForEditor();
      expect(settings).toEqual([]);
    });

    // Blog settings live with the blogs feature: blogs.view is enough.
    it("shows a group's settings to viewers of its owning section", async () => {
      vi.mocked(getViewerContext).mockResolvedValue({
        profile: { email: "a@b.c", role: "editor" },
        isSuperadmin: false,
        permissions: { blogs: ["view"] },
        storeId: "store-1",
      } as any);
      const { settings } = await getStoreSettingsForEditor("Blogs");
      expect(settings.map((s) => s.key)).toContain("blogs.customerSubmissions");
    });

    it("filters to the requested group", async () => {
      const { settings } = await getStoreSettingsForEditor("Nope");
      expect(settings).toEqual([]);
    });
  });

  describe("saveStoreSettings", () => {
    it("rejects unauthenticated callers", async () => {
      vi.mocked(getViewerContext).mockResolvedValue(null as any);
      const r = await saveStoreSettings({ "blogs.customerSubmissions": false });
      expect(r.error).toMatch(/not authenticated/i);
    });

    // Saving a setting requires manage on ITS owning section (blogs here).
    it("rejects callers without manage on the owning section", async () => {
      vi.mocked(getViewerContext).mockResolvedValue({
        profile: { email: "a@b.c", role: "editor" },
        isSuperadmin: false,
        permissions: { blogs: ["view"] }, // view only
        storeId: "store-1",
      } as any);
      const r = await saveStoreSettings({ "blogs.customerSubmissions": false });
      expect(r.error).toMatch(/permission/i);
      expect(admin._tables.stores.update).not.toHaveBeenCalled();
    });

    it("allows blogs managers to save blog settings", async () => {
      vi.mocked(getViewerContext).mockResolvedValue({
        profile: { email: "a@b.c", role: "editor" },
        isSuperadmin: false,
        permissions: { blogs: ["view", "manage"] },
        storeId: "store-1",
      } as any);
      const r = await saveStoreSettings({ "blogs.customerSubmissions": false });
      expect(r.success).toBe(true);
    });

    it("writes registry keys into settings.features and busts the store cache", async () => {
      const r = await saveStoreSettings({
        "blogs.customerSubmissions": false,
        "blogs.requireApproval": true,
      });
      expect(r.success).toBe(true);

      const updateArg = admin._tables.stores.update.mock.calls[0][0];
      expect(updateArg.settings.features).toMatchObject({
        "blogs.customerSubmissions": false,
        "blogs.requireApproval": true,
      });
      expect(revalidateTag).toHaveBeenCalled();
    });

    it("ignores unknown keys and non-boolean values", async () => {
      await saveStoreSettings({
        "blogs.customerSubmissions": false,
        "made.up": true,
        "blogs.requireApproval": "yes",
      } as any);

      const updateArg = admin._tables.stores.update.mock.calls[0][0];
      expect(updateArg.settings.features).toEqual({
        "blogs.customerSubmissions": false,
      });
    });

    it("preserves unrelated settings (e.g. brand) when saving", async () => {
      admin = makeAdmin({
        settings: {
          brand: { name: "Acme" },
          features: { "blogs.requireApproval": false },
        },
        plan: "free",
      });
      vi.mocked(createAdminClient).mockReturnValue(admin);

      await saveStoreSettings({ "blogs.customerSubmissions": false });

      const updateArg = admin._tables.stores.update.mock.calls[0][0];
      expect(updateArg.settings.brand).toEqual({ name: "Acme" });
      // Existing feature overrides survive a partial save.
      expect(updateArg.settings.features["blogs.requireApproval"]).toBe(false);
      expect(updateArg.settings.features["blogs.customerSubmissions"]).toBe(
        false,
      );
    });

    it("surfaces a read failure", async () => {
      admin = makeSupabase({
        stores: makeChain({ data: null, error: { message: "boom" } }),
      });
      vi.mocked(createAdminClient).mockReturnValue(admin);
      const r = await saveStoreSettings({ "blogs.customerSubmissions": true });
      expect(r.error).toMatch(/could not load/i);
    });
  });
});
