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
  getActingStoreId: vi.fn(async () => "store-1"),
}));

// The ported data layer: with* runners invoke the callback with the mock db.
const dbHolder = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/lib/db/client", () => ({
  withUser: vi.fn((_identity: any, fn: any) => fn(dbHolder.current.db)),
  withService: vi.fn((fn: any) => fn(dbHolder.current.db)),
  withAnon: vi.fn((fn: any) => fn(dbHolder.current.db)),
}));

import { revalidateTag } from "next/cache";
import { getManagerIdentity } from "@/app/dashboard/lib/access";
import {
  createBlogTaxonomyItem,
  renameBlogTaxonomyItem,
  deleteBlogTaxonomyItem,
} from "./blog-taxonomy-actions";
import { blogCategories, blogTags, blogs } from "@/drizzle/schema";

// Per-store blog categories & tags CRUD, including the rename/delete
// propagation into the blogs text[] columns. All writes run through withUser
// (RLS-enforced) with explicit store scoping.
describe("blog-taxonomy-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // select #1 = the existing-row lookup, select #2 = the propagation lookup.
    dbHolder.current = makeDbMock({
      selectQueue: [[{ name: "Recipes" }], []],
    });
    vi.mocked(getManagerIdentity).mockResolvedValue({
      uid: "user-1",
      email: "admin@example.com",
    });
  });

  describe("createBlogTaxonomyItem", () => {
    it("rejects callers without blogs.manage", async () => {
      vi.mocked(getManagerIdentity).mockResolvedValue(null);
      const r = await createBlogTaxonomyItem("category", "News");
      expect(r.error).toMatch(/not authenticated/i);
    });

    it("rejects an empty name", async () => {
      const r = await createBlogTaxonomyItem("category", "   ");
      expect(r.error).toMatch(/required/i);
      expect(dbHolder.current.calls.insert).toHaveLength(0);
    });

    it("rejects an over-long name", async () => {
      const r = await createBlogTaxonomyItem("tag", "x".repeat(41));
      expect(r.error).toMatch(/under 40/i);
    });

    it("inserts a trimmed, whitespace-collapsed name scoped to the store", async () => {
      const r = await createBlogTaxonomyItem("category", "  Healthy   Living ");
      expect(r.success).toBe(true);
      expect(dbHolder.current.calls.insert[0]).toBe(blogCategories);
      expect(dbHolder.current.calls.values[0]).toEqual({
        storeId: "store-1",
        name: "Healthy Living",
      });
      expect(revalidateTag).toHaveBeenCalled();
    });

    it("routes tags to the blog_tags table", async () => {
      await createBlogTaxonomyItem("tag", "Sleep");
      expect(dbHolder.current.calls.insert[0]).toBe(blogTags);
      expect(dbHolder.current.calls.values[0]).toEqual({
        storeId: "store-1",
        name: "Sleep",
      });
    });

    it("maps a unique violation to a friendly duplicate message", async () => {
      dbHolder.current.db.insert = vi.fn(() => {
        throw Object.assign(new Error("Failed query"), {
          cause: Object.assign(new Error("dup"), { code: "23505" }),
        });
      });
      const r = await createBlogTaxonomyItem("category", "Recipes");
      expect(r.error).toMatch(/already exists/i);
    });
  });

  describe("renameBlogTaxonomyItem", () => {
    it("rejects callers without blogs.manage", async () => {
      vi.mocked(getManagerIdentity).mockResolvedValue(null);
      const r = await renameBlogTaxonomyItem("category", "c1", "New");
      expect(r.error).toMatch(/not authenticated/i);
    });

    it("errors when the row doesn't exist for this store", async () => {
      dbHolder.current = makeDbMock({ selectQueue: [[]] });
      const r = await renameBlogTaxonomyItem("category", "c1", "New");
      expect(r.error).toMatch(/not found/i);
    });

    it("no-ops when the name is unchanged", async () => {
      const r = await renameBlogTaxonomyItem("category", "c1", "Recipes");
      expect(r.success).toBe(true);
      expect(dbHolder.current.calls.update).toHaveLength(0);
    });

    it("renames the row and rewrites the name inside affected blogs", async () => {
      dbHolder.current = makeDbMock({
        selectQueue: [
          [{ name: "Recipes" }],
          [{ id: "b1", values: ["Recipes", "Community"] }],
        ],
      });
      const r = await renameBlogTaxonomyItem("category", "c1", "Meals");
      expect(r.success).toBe(true);
      // First update = the taxonomy row; second = the affected blog rewrite.
      expect(dbHolder.current.calls.update[0]).toBe(blogCategories);
      expect(dbHolder.current.calls.set[0]).toEqual({ name: "Meals" });
      expect(dbHolder.current.calls.update[1]).toBe(blogs);
      expect(dbHolder.current.calls.set[1]).toEqual({
        categories: ["Meals", "Community"],
      });
    });

    it("dedupes when the new name already exists in a blog's array", async () => {
      dbHolder.current = makeDbMock({
        selectQueue: [
          [{ name: "Recipes" }],
          [{ id: "b1", values: ["Recipes", "Meals"] }],
        ],
      });
      await renameBlogTaxonomyItem("category", "c1", "Meals");
      expect(dbHolder.current.calls.set[1]).toEqual({ categories: ["Meals"] });
    });

    it("maps a unique violation to a friendly duplicate message", async () => {
      dbHolder.current = makeDbMock({ selectQueue: [[{ name: "Recipes" }]] });
      dbHolder.current.db.update = vi.fn(() => {
        throw Object.assign(new Error("dup"), { code: "23505" });
      });
      const r = await renameBlogTaxonomyItem("category", "c1", "Community");
      expect(r.error).toMatch(/already exists/i);
    });
  });

  describe("deleteBlogTaxonomyItem", () => {
    it("rejects callers without blogs.manage", async () => {
      vi.mocked(getManagerIdentity).mockResolvedValue(null);
      const r = await deleteBlogTaxonomyItem("tag", "t1");
      expect(r.error).toMatch(/not authenticated/i);
    });

    it("errors when the row doesn't exist for this store", async () => {
      dbHolder.current = makeDbMock({ selectQueue: [[]] });
      const r = await deleteBlogTaxonomyItem("tag", "t1");
      expect(r.error).toMatch(/not found/i);
    });

    it("deletes the row and strips the name from affected blogs", async () => {
      dbHolder.current = makeDbMock({
        selectQueue: [
          [{ name: "Protein" }],
          [{ id: "b1", values: ["Protein", "Sleep"] }],
        ],
      });
      const r = await deleteBlogTaxonomyItem("tag", "t1");
      expect(r.success).toBe(true);
      expect(dbHolder.current.calls.delete[0]).toBe(blogTags);
      expect(dbHolder.current.calls.update[0]).toBe(blogs);
      expect(dbHolder.current.calls.set[0]).toEqual({ tags: ["Sleep"] });
      expect(revalidateTag).toHaveBeenCalled();
    });
  });
});
