/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "./_test-helpers";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getManagerIdentity: vi.fn(),
  getActingStoreId: vi.fn(async () => "a0000000-0000-4000-8000-000000000001"),
}));
vi.mock("@/lib/storage/cleanup", () => ({
  deleteStorageUrls: vi.fn().mockResolvedValue(undefined),
}));

// The ported data layer: with* runners invoke the callback with the mock db.
const dbHolder = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/lib/db/client", () => ({
  withUser: vi.fn((_identity: any, fn: any) => fn(dbHolder.current.db)),
  withService: vi.fn((fn: any) => fn(dbHolder.current.db)),
  withAnon: vi.fn((fn: any) => fn(dbHolder.current.db)),
}));

import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "./category-actions";
import { getManagerIdentity } from "@/app/dashboard/lib/access";
import { deleteStorageUrls } from "@/lib/storage/cleanup";

const validForm = {
  name: "Skincare",
  slug: "",
  description: "Glow",
  image_url: "https://x.example.com/object/public/media/skincare.png",
  sort_order: 1,
  status: "active" as const,
};

// category-actions.ts manages product categories. Gated by categories.manage,
// auto-slugifies, retries on slug collisions (each attempt in its own
// transaction), and cleans up storage files when an image is replaced or the
// row is deleted. Writes run through withUser (RLS-enforced).
describe("category-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // select #1 = the slug lookup (no collisions by default).
    dbHolder.current = makeDbMock({ returning: [{ id: "c1" }] });
    vi.mocked(getManagerIdentity).mockResolvedValue({
      uid: "user-1",
      email: "admin@example.com",
    });
  });

  describe("createCategory", () => {
    // Auth gate.
    it("rejects when caller lacks categories.manage", async () => {
      vi.mocked(getManagerIdentity).mockResolvedValue(null);
      const result = await createCategory(validForm);
      expect(result.error).toMatch(/not authenticated/i);
      expect(dbHolder.current.calls.insert).toHaveLength(0);
    });

    // Empty name is rejected before any DB call.
    it("rejects empty name", async () => {
      const result = await createCategory({ ...validForm, name: " " });
      expect(result.error).toMatch(/name is required/i);
      expect(dbHolder.current.calls.insert).toHaveLength(0);
    });

    // No slug provided → derived from the name (matches client preview).
    it("derives the slug from the name when not provided", async () => {
      await createCategory({ ...validForm, name: "Hair Care" });
      expect(dbHolder.current.calls.values[0].slug).toBe("hair-care");
    });

    // Manual slug overrides the name-derived one (also slugified for safety).
    it("uses provided slug verbatim (after slugify)", async () => {
      await createCategory({ ...validForm, slug: "Custom Slug!" });
      expect(dbHolder.current.calls.values[0].slug).toBe("custom-slug");
    });

    it("inserts trimmed fields and the acting store id", async () => {
      const result = await createCategory({
        ...validForm,
        name: "  Skincare  ",
      });
      const inserted = dbHolder.current.calls.values[0];
      expect(inserted.name).toBe("Skincare");
      expect(inserted.storeId).toBe("a0000000-0000-4000-8000-000000000001");
      expect(result).toEqual({ success: true, data: { id: "c1" } });
    });

    // The slug lookup sees an existing "skincare" → first attempt already
    // uses the bumped slug.
    it("bumps the slug when the lookup finds a collision", async () => {
      dbHolder.current = makeDbMock({
        returning: [{ id: "c1" }],
        selectQueue: [[{ slug: "skincare" }]],
      });
      await createCategory(validForm);
      expect(dbHolder.current.calls.values[0].slug).toBe("skincare-2");
    });

    // A concurrent insert wins the slug between lookup and insert → the
    // unique violation (surfaced as the pg error on `cause`, the Drizzle
    // wrapper shape) triggers a retry with the next slug in a NEW transaction.
    it("retries with a bumped slug on a unique-violation insert", async () => {
      const realInsert = dbHolder.current.db.insert;
      let attempts = 0;
      dbHolder.current.db.insert = vi.fn((t: any) => {
        if (attempts++ === 0)
          throw Object.assign(new Error("Failed query"), {
            cause: Object.assign(new Error("duplicate key"), {
              code: "23505",
            }),
          });
        return realInsert(t);
      });
      const result = await createCategory(validForm);
      expect(result.success).toBe(true);
      expect(dbHolder.current.calls.values[0].slug).toBe("skincare-2");
    });

    // Surface the Postgres error message for non-uniqueness failures.
    it("returns DB error when insert fails for non-unique reason", async () => {
      dbHolder.current.db.insert = vi.fn(() => {
        throw Object.assign(new Error("boom"), { code: "99999" });
      });
      const result = await createCategory(validForm);
      expect(result.error).toBe("boom");
    });
  });

  describe("updateCategory", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerIdentity).mockResolvedValue(null);
      const result = await updateCategory("c1", validForm);
      expect(result.error).toMatch(/not authenticated/i);
      expect(dbHolder.current.calls.update).toHaveLength(0);
    });

    // When the image URL changes, the previous file is purged from storage.
    // This is the only way storage doesn't accumulate orphan files.
    // (select #1 = slug lookup, select #2 = previous-image prefetch.)
    it("purges the previous image from storage when changed", async () => {
      const oldUrl = "https://x.example.com/object/public/media/old.png";
      const newUrl = "https://x.example.com/object/public/media/new.png";
      dbHolder.current = makeDbMock({
        selectQueue: [[], [{ imageUrl: oldUrl }]],
      });
      const result = await updateCategory("c1", {
        ...validForm,
        image_url: newUrl,
      });
      expect(result.success).toBe(true);
      expect(deleteStorageUrls).toHaveBeenCalledWith([oldUrl]);
    });

    // When the image is unchanged, deleteStorageUrls is NOT called — we
    // don't want to wipe out the same file we're still using.
    it("does not purge storage when the image is unchanged", async () => {
      const url = "https://x.example.com/object/public/media/same.png";
      dbHolder.current = makeDbMock({
        selectQueue: [[], [{ imageUrl: url }]],
      });
      await updateCategory("c1", { ...validForm, image_url: url });
      expect(deleteStorageUrls).not.toHaveBeenCalled();
    });
  });

  describe("deleteCategory", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerIdentity).mockResolvedValue(null);
      const result = await deleteCategory("c1");
      expect(result.error).toMatch(/not authenticated/i);
      expect(dbHolder.current.calls.delete).toHaveLength(0);
    });

    // On delete, the category's image file is cleaned out of storage.
    // (Products that referenced the category get category_id set to NULL by
    // the FK — they're not lost.)
    it("removes the row and purges its image from storage", async () => {
      const url = "https://x.example.com/object/public/media/cat.png";
      dbHolder.current = makeDbMock({ selectQueue: [[{ imageUrl: url }]] });
      const result = await deleteCategory("c1");
      expect(result.success).toBe(true);
      expect(dbHolder.current.calls.delete).toHaveLength(1);
      expect(deleteStorageUrls).toHaveBeenCalledWith([url]);
    });
  });
});
