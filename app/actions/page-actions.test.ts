/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  // lib/storefront/tags is dependency-free, but page-actions pulls in
  // lib/settings/resolve → lib/store/resolve which wraps reads at module load.
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/site", () => ({
  getStoreUrl: vi.fn(async () => "https://store-1.storemink.com"),
}));
vi.mock("@/lib/seo/search-engines", () => ({
  pingIndexNow: vi.fn(),
  submitSitemapToGoogle: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => "store-1"),
}));
vi.mock("@/lib/settings/resolve", () => ({
  getStoreSetting: vi.fn(async () => true),
}));
vi.mock("@/lib/sanitize", () => ({
  sanitizeBlogContent: vi.fn((html: string) =>
    html.replace(/<script[\s\S]*?<\/script>/gi, ""),
  ),
}));

import {
  createPage,
  updatePageMeta,
  savePageDraft,
  publishPage,
  deletePage,
} from "./page-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { getStoreSetting } from "@/lib/settings/resolve";
import { makeChain, makeSupabase } from "./_test-helpers";

const richSection = (html = "<p>Hi</p>") => ({
  id: crypto.randomUUID(),
  type: "rich_text",
  enabled: true,
  config: { html, width: "contained" },
});

const codeSection = () => ({
  id: crypto.randomUUID(),
  type: "custom_code",
  enabled: true,
  config: {
    html: "<div>x</div>",
    css: "",
    js: "",
    height_mode: "auto",
    fixed_height: 320,
  },
});

describe("page-actions", () => {
  let admin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    admin = makeSupabase({
      store_pages: makeChain({ data: null, error: null }),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
    vi.mocked(getStoreSetting).mockResolvedValue(true);
  });

  // Every action must fail closed without builder.manage — the service-role
  // client bypasses RLS, so this app-layer gate is the only trust boundary.
  describe("auth gate", () => {
    it("rejects each mutation when unauthorised", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      expect((await createPage("about", "About")).error).toMatch(
        /not authenticated/i,
      );
      expect((await savePageDraft("p1", [])).error).toMatch(
        /not authenticated/i,
      );
      expect((await publishPage("p1")).error).toMatch(/not authenticated/i);
      expect((await deletePage("p1")).error).toMatch(/not authenticated/i);
    });
  });

  describe("createPage", () => {
    it("rejects a reserved slug", async () => {
      const r = await createPage("shop", "Shop");
      expect(r.error).toMatch(/reserved/i);
      expect(admin._tables.store_pages.insert).not.toHaveBeenCalled();
    });

    it("rejects a duplicate slug", async () => {
      admin._tables.store_pages = makeChain({
        data: { id: "existing" },
        error: null,
      });
      const r = await createPage("about", "About");
      expect(r.error).toMatch(/already exists/i);
    });

    it("inserts a normalised draft page scoped to the store", async () => {
      // Uniqueness pre-check (.maybeSingle) → null (free); insert (.single) → id.
      admin._tables.store_pages = makeChain({ data: null, error: null });
      admin._tables.store_pages.maybeSingle = vi
        .fn()
        .mockResolvedValue({ data: null, error: null });
      admin._tables.store_pages.single = vi
        .fn()
        .mockResolvedValue({ data: { id: "new" }, error: null });
      const r = await createPage("About-Us", "");
      expect(r.success).toBe(true);
      const insert = admin._tables.store_pages.insert.mock.calls[0][0];
      expect(insert.slug).toBe("about-us");
      expect(insert.title).toBe("about-us"); // falls back to slug
      expect(insert.store_id).toBe("store-1");
      expect(insert.status).toBe("draft");
    });
  });

  describe("savePageDraft", () => {
    it("sanitizes rich_text before storing", async () => {
      admin._tables.store_pages = makeChain({
        data: { slug: "about", updated_at: "t0" },
        error: null,
      });
      await savePageDraft("p1", [
        richSection("<p>Hi</p><script>evil()</script>"),
      ]);
      const update = admin._tables.store_pages.update.mock.calls[0][0];
      expect(update.sections[0].config.html).toContain("<p>Hi</p>");
      expect(update.sections[0].config.html).not.toContain("<script");
    });

    it("refuses custom_code when the store setting is off", async () => {
      admin._tables.store_pages = makeChain({
        data: { slug: "about", updated_at: "t0" },
        error: null,
      });
      vi.mocked(getStoreSetting).mockResolvedValue(false);
      const r = await savePageDraft("p1", [codeSection()]);
      expect(r.error).toMatch(/custom code is disabled/i);
      expect(admin._tables.store_pages.update).not.toHaveBeenCalled();
    });

    it("rejects a stale save (updated_at mismatch) with the stale flag", async () => {
      admin._tables.store_pages = makeChain({
        data: { slug: "about", updated_at: "t1" },
        error: null,
      });
      const r = await savePageDraft("p1", [richSection()], "t0");
      expect(r.error).toMatch(/changed somewhere else/i);
      expect(r.data?.stale).toBe(true);
      expect(admin._tables.store_pages.update).not.toHaveBeenCalled();
    });

    it("returns the fresh updated_at token (autosave round trip)", async () => {
      admin._tables.store_pages = makeChain({
        data: { slug: "about", updated_at: "t9" },
        error: null,
      });
      const r = await savePageDraft("p1", [richSection()], "t9");
      expect(r.success).toBe(true);
      expect(r.data?.updated_at).toBe("t9"); // .single() echoes the row
    });

    it("saves INCOMPLETE sections (draft mode skips completeness)", async () => {
      admin._tables.store_pages = makeChain({
        data: { slug: "about", updated_at: "t0" },
        error: null,
      });
      const r = await savePageDraft("p1", [
        {
          id: "half",
          type: "featured_products",
          enabled: true,
          config: { source: "manual", product_ids: [] }, // mid-edit state
        },
      ]);
      expect(r.success).toBe(true);
      expect(admin._tables.store_pages.update).toHaveBeenCalled();
    });
  });

  describe("publishPage", () => {
    it("copies the draft into published_sections and stamps published_at", async () => {
      admin._tables.store_pages = makeChain({
        data: { slug: "about", sections: [richSection()] },
        error: null,
      });
      const r = await publishPage("p1");
      expect(r.success).toBe(true);
      const update = admin._tables.store_pages.update.mock.calls[0][0];
      expect(update.status).toBe("published");
      expect(update.published_at).toBeTruthy();
      expect(update.published_sections).toHaveLength(1);
    });

    it("rejects a stale publish (token mismatch)", async () => {
      admin._tables.store_pages = makeChain({
        data: { slug: "about", sections: [richSection()], updated_at: "t2" },
        error: null,
      });
      const r = await publishPage("p1", "t1");
      expect(r.error).toMatch(/changed somewhere else/i);
      expect(r.data?.stale).toBe(true);
      expect(admin._tables.store_pages.update).not.toHaveBeenCalled();
    });

    it("STRICTLY re-validates on publish (incomplete draft is rejected)", async () => {
      admin._tables.store_pages = makeChain({
        data: {
          slug: "about",
          updated_at: "t0",
          sections: [
            {
              id: "half",
              type: "featured_products",
              enabled: true,
              config: { source: "manual", product_ids: [] },
            },
          ],
        },
        error: null,
      });
      const r = await publishPage("p1");
      expect(r.error).toMatch(/at least one product/i);
      expect(admin._tables.store_pages.update).not.toHaveBeenCalled();
    });
  });

  describe("deletePage", () => {
    it("refuses to delete the homepage sentinel", async () => {
      admin._tables.store_pages = makeChain({
        data: { slug: "" },
        error: null,
      });
      const r = await deletePage("home");
      expect(r.error).toMatch(/homepage can't be deleted/i);
      expect(admin._tables.store_pages.delete).not.toHaveBeenCalled();
    });

    it("deletes a normal page scoped to the store", async () => {
      admin._tables.store_pages = makeChain({
        data: { slug: "about" },
        error: null,
      });
      const r = await deletePage("p1");
      expect(r.success).toBe(true);
      expect(admin._tables.store_pages.delete).toHaveBeenCalled();
      expect(admin._tables.store_pages.eq).toHaveBeenCalledWith(
        "store_id",
        "store-1",
      );
    });
  });

  describe("updatePageMeta", () => {
    it("keeps the homepage sentinel slug immutable", async () => {
      admin._tables.store_pages = makeChain({
        data: { slug: "" },
        error: null,
      });
      await updatePageMeta("home", { slug: "new-home", title: "Home" });
      const update = admin._tables.store_pages.update.mock.calls[0][0];
      expect(update.slug).toBeUndefined(); // slug change ignored for homepage
      expect(update.title).toBe("Home");
    });

    it("rejects renaming to a reserved slug", async () => {
      admin._tables.store_pages = makeChain({
        data: { slug: "about" },
        error: null,
      });
      const r = await updatePageMeta("p1", { slug: "cart" });
      expect(r.error).toMatch(/reserved/i);
    });
  });
});
