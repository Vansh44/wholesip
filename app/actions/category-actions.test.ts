/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
}));
vi.mock("@/lib/supabase/storage-cleanup", () => ({
  deleteStorageUrls: vi.fn().mockResolvedValue(undefined),
}));

import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "./category-actions";
import { createClient } from "@/lib/supabase/server";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { deleteStorageUrls } from "@/lib/supabase/storage-cleanup";
import { makeChain, makeSupabase } from "./_test-helpers";

const validForm = {
  name: "Skincare",
  slug: "",
  description: "Glow",
  image_url: "https://x.example.com/object/public/media/skincare.png",
  sort_order: 1,
  status: "active" as const,
};

// category-actions.ts manages product categories. Gated by categories.manage,
// auto-slugifies, retries on slug collisions, and cleans up storage files
// when an image is replaced or the row is deleted.
describe("category-actions", () => {
  let supabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase({
      // Slug lookup → no collisions; insert succeeds.
      categories: makeChain({ data: { id: "c1" }, error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(supabase);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  describe("createCategory", () => {
    // Auth gate.
    it("rejects when caller lacks categories.manage", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await createCategory(validForm);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Empty name is rejected before any DB call.
    it("rejects empty name", async () => {
      const result = await createCategory({ ...validForm, name: " " });
      expect(result.error).toMatch(/name is required/i);
    });

    // No slug provided → derived from the name (matches client preview).
    it("derives the slug from the name when not provided", async () => {
      // Slug lookup returns no collisions; insert call is what we inspect.
      await createCategory({ ...validForm, name: "Hair Care" });
      const insert = supabase._tables.categories.insert.mock.calls[0][0];
      expect(insert.slug).toBe("hair-care");
    });

    // Manual slug overrides the name-derived one (also slugified for safety).
    it("uses provided slug verbatim (after slugify)", async () => {
      await createCategory({ ...validForm, slug: "Custom Slug!" });
      const insert = supabase._tables.categories.insert.mock.calls[0][0];
      expect(insert.slug).toBe("custom-slug");
    });

    // Surface the Postgres error message for non-uniqueness failures.
    it("returns DB error when insert fails for non-unique reason", async () => {
      supabase._tables.categories = makeChain({
        data: null,
        error: { code: "99999", message: "boom" },
      });
      const result = await createCategory(validForm);
      expect(result.error).toBe("boom");
    });
  });

  describe("updateCategory", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await updateCategory("c1", validForm);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // When the image URL changes, the previous file is purged from storage.
    // This is the only way storage doesn't accumulate orphan files.
    it("purges the previous image from storage when changed", async () => {
      const oldUrl = "https://x.example.com/object/public/media/old.png";
      const newUrl = "https://x.example.com/object/public/media/new.png";
      // The pre-fetch returns the old URL.
      supabase._tables.categories = makeChain({
        data: { image_url: oldUrl },
        error: null,
      });
      await updateCategory("c1", { ...validForm, image_url: newUrl });
      expect(deleteStorageUrls).toHaveBeenCalledWith([oldUrl]);
    });

    // When the image is unchanged, deleteStorageUrls is NOT called — we
    // don't want to wipe out the same file we're still using.
    it("does not purge storage when the image is unchanged", async () => {
      const url = "https://x.example.com/object/public/media/same.png";
      supabase._tables.categories = makeChain({
        data: { image_url: url },
        error: null,
      });
      await updateCategory("c1", { ...validForm, image_url: url });
      expect(deleteStorageUrls).not.toHaveBeenCalled();
    });
  });

  describe("deleteCategory", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await deleteCategory("c1");
      expect(result.error).toMatch(/not authenticated/i);
    });

    // On delete, the category's image file is cleaned out of storage.
    // (Products that referenced the category get category_id set to NULL by
    // the FK — they're not lost.)
    it("removes the row and purges its image from storage", async () => {
      const url = "https://x.example.com/object/public/media/cat.png";
      supabase._tables.categories = makeChain({
        data: { image_url: url },
        error: null,
      });
      const result = await deleteCategory("c1");
      expect(result.success).toBe(true);
      expect(deleteStorageUrls).toHaveBeenCalledWith([url]);
    });
  });
});
