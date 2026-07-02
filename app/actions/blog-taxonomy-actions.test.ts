/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => "store-1"),
}));

import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import {
  createBlogTaxonomyItem,
  renameBlogTaxonomyItem,
  deleteBlogTaxonomyItem,
} from "./blog-taxonomy-actions";
import { makeChain, makeSupabase } from "./_test-helpers";

// Per-store blog categories & tags CRUD, including the rename/delete
// propagation into the blogs text[] columns.
describe("blog-taxonomy-actions", () => {
  let supabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase({
      blog_categories: makeChain({ data: { name: "Recipes" }, error: null }),
      blog_tags: makeChain({ data: { name: "Protein" }, error: null }),
      blogs: makeChain({ data: null, error: null }, { data: [], error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(supabase);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  describe("createBlogTaxonomyItem", () => {
    it("rejects callers without blogs.manage", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const r = await createBlogTaxonomyItem("category", "News");
      expect(r.error).toMatch(/not authenticated/i);
    });

    it("rejects an empty name", async () => {
      const r = await createBlogTaxonomyItem("category", "   ");
      expect(r.error).toMatch(/required/i);
      expect(supabase._tables.blog_categories.insert).not.toHaveBeenCalled();
    });

    it("rejects an over-long name", async () => {
      const r = await createBlogTaxonomyItem("tag", "x".repeat(41));
      expect(r.error).toMatch(/under 40/i);
    });

    it("inserts a trimmed, whitespace-collapsed name scoped to the store", async () => {
      const r = await createBlogTaxonomyItem("category", "  Healthy   Living ");
      expect(r.success).toBe(true);
      expect(supabase._tables.blog_categories.insert).toHaveBeenCalledWith({
        store_id: "store-1",
        name: "Healthy Living",
      });
      expect(revalidateTag).toHaveBeenCalled();
    });

    it("routes tags to the blog_tags table", async () => {
      await createBlogTaxonomyItem("tag", "Sleep");
      expect(supabase._tables.blog_tags.insert).toHaveBeenCalledWith({
        store_id: "store-1",
        name: "Sleep",
      });
      expect(supabase._tables.blog_categories.insert).not.toHaveBeenCalled();
    });

    it("maps a unique violation to a friendly duplicate message", async () => {
      supabase._tables.blog_categories = makeChain(
        { data: null, error: null },
        { data: null, error: { code: "23505", message: "dup" } },
      );
      const r = await createBlogTaxonomyItem("category", "Recipes");
      expect(r.error).toMatch(/already exists/i);
    });
  });

  describe("renameBlogTaxonomyItem", () => {
    it("rejects callers without blogs.manage", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const r = await renameBlogTaxonomyItem("category", "c1", "New");
      expect(r.error).toMatch(/not authenticated/i);
    });

    it("errors when the row doesn't exist for this store", async () => {
      supabase._tables.blog_categories = makeChain({ data: null, error: null });
      const r = await renameBlogTaxonomyItem("category", "c1", "New");
      expect(r.error).toMatch(/not found/i);
    });

    it("no-ops when the name is unchanged", async () => {
      const r = await renameBlogTaxonomyItem("category", "c1", "Recipes");
      expect(r.success).toBe(true);
      expect(supabase._tables.blog_categories.update).not.toHaveBeenCalled();
    });

    it("renames the row and rewrites the name inside affected blogs", async () => {
      supabase._tables.blogs = makeChain(
        { data: null, error: null },
        {
          data: [{ id: "b1", categories: ["Recipes", "Community"] }],
          error: null,
        },
      );
      const r = await renameBlogTaxonomyItem("category", "c1", "Meals");
      expect(r.success).toBe(true);
      expect(supabase._tables.blog_categories.update).toHaveBeenCalledWith({
        name: "Meals",
      });
      // Propagation looked up blogs containing the old name…
      expect(supabase._tables.blogs.contains).toHaveBeenCalledWith(
        "categories",
        ["Recipes"],
      );
      // …and rewrote the array with the new name in place.
      expect(supabase._tables.blogs.update).toHaveBeenCalledWith({
        categories: ["Meals", "Community"],
      });
    });

    it("dedupes when the new name already exists in a blog's array", async () => {
      supabase._tables.blogs = makeChain(
        { data: null, error: null },
        { data: [{ id: "b1", categories: ["Recipes", "Meals"] }], error: null },
      );
      await renameBlogTaxonomyItem("category", "c1", "Meals");
      expect(supabase._tables.blogs.update).toHaveBeenCalledWith({
        categories: ["Meals"],
      });
    });

    it("maps a unique violation to a friendly duplicate message", async () => {
      supabase._tables.blog_categories = makeChain(
        { data: { name: "Recipes" }, error: null },
        { data: null, error: { code: "23505", message: "dup" } },
      );
      const r = await renameBlogTaxonomyItem("category", "c1", "Community");
      expect(r.error).toMatch(/already exists/i);
    });
  });

  describe("deleteBlogTaxonomyItem", () => {
    it("rejects callers without blogs.manage", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const r = await deleteBlogTaxonomyItem("tag", "t1");
      expect(r.error).toMatch(/not authenticated/i);
    });

    it("errors when the row doesn't exist for this store", async () => {
      supabase._tables.blog_tags = makeChain({ data: null, error: null });
      const r = await deleteBlogTaxonomyItem("tag", "t1");
      expect(r.error).toMatch(/not found/i);
    });

    it("deletes the row and strips the name from affected blogs", async () => {
      supabase._tables.blogs = makeChain(
        { data: null, error: null },
        { data: [{ id: "b1", tags: ["Protein", "Sleep"] }], error: null },
      );
      const r = await deleteBlogTaxonomyItem("tag", "t1");
      expect(r.success).toBe(true);
      expect(supabase._tables.blog_tags.delete).toHaveBeenCalled();
      expect(supabase._tables.blogs.contains).toHaveBeenCalledWith("tags", [
        "Protein",
      ]);
      expect(supabase._tables.blogs.update).toHaveBeenCalledWith({
        tags: ["Sleep"],
      });
      expect(revalidateTag).toHaveBeenCalled();
    });
  });
});
