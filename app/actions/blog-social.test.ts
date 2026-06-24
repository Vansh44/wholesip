/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import {
  toggleBlogReaction,
  getBlogReactionCounts,
  submitBlogComment,
  deleteBlogComment,
} from "./blog-social";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { makeChain, makeSupabase } from "./_test-helpers";

// blog-social.ts powers the anonymous reaction bar (service-role admin client)
// and login-gated comments (cookie-bound server client). BLOG_REACTIONS is
// used with its real values — like / love / haha / wow / celebrate.
describe("blog-social", () => {
  let supabase: any;
  let admin: any;

  // The tally reads blog_likes via .select("reaction").eq(...) and awaits the
  // chain directly, so the reaction rows live in the chain's listResult.
  const reactionRows = [
    { reaction: "like" },
    { reaction: "love" },
    { reaction: "like" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    admin = makeSupabase({
      blog_likes: makeChain(
        { data: null, error: null },
        { data: reactionRows, error: null },
      ),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);

    supabase = makeSupabase({
      users: makeChain({
        data: { first_name: "Ada", last_name: "Lovelace" },
        error: null,
      }),
      blog_comments: makeChain({ data: null, error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(supabase);
  });

  describe("toggleBlogReaction", () => {
    // Missing context — no blogId.
    it("rejects a missing blogId", async () => {
      const result = await toggleBlogReaction("", "v1", "like", true);
      expect(result.error).toMatch(/missing reaction context/i);
    });

    // Missing context — no visitorId.
    it("rejects a missing visitorId", async () => {
      const result = await toggleBlogReaction("b1", "", "like", true);
      expect(result.error).toMatch(/missing reaction context/i);
    });

    // Unknown reaction string is rejected before any DB write.
    it("rejects an unknown reaction", async () => {
      const result = await toggleBlogReaction(
        "b1",
        "v1",
        "thumbsup" as any,
        true,
      );
      expect(result.error).toMatch(/unknown reaction/i);
    });

    // active=true upserts the row, then returns the tallied counts.
    it("upserts when active and returns tallied counts", async () => {
      const result = await toggleBlogReaction("b1", "v1", "like", true);
      expect(result.error).toBeUndefined();
      expect(admin._tables.blog_likes.upsert).toHaveBeenCalled();
      expect(result.counts).toEqual({
        like: 2,
        love: 1,
        haha: 0,
        wow: 0,
        celebrate: 0,
      });
    });

    // Upsert failure → friendly error + zeroed counts.
    it("returns an error when the upsert fails", async () => {
      admin._tables.blog_likes = makeChain(
        {},
        {
          data: null,
          error: { message: "boom" },
        },
      );
      const result = await toggleBlogReaction("b1", "v1", "like", true);
      expect(result.error).toMatch(/couldn.?t save/i);
      expect(result.counts).toEqual({
        like: 0,
        love: 0,
        haha: 0,
        wow: 0,
        celebrate: 0,
      });
    });

    // active=false deletes the row, then returns the tallied counts.
    it("deletes when inactive and returns tallied counts", async () => {
      const result = await toggleBlogReaction("b1", "v1", "love", false);
      expect(result.error).toBeUndefined();
      expect(admin._tables.blog_likes.delete).toHaveBeenCalled();
      expect(admin._tables.blog_likes.eq).toHaveBeenCalledWith("blog_id", "b1");
      expect(admin._tables.blog_likes.eq).toHaveBeenCalledWith(
        "visitor_id",
        "v1",
      );
      expect(admin._tables.blog_likes.eq).toHaveBeenCalledWith(
        "reaction",
        "love",
      );
      expect(result.counts).toEqual({
        like: 2,
        love: 1,
        haha: 0,
        wow: 0,
        celebrate: 0,
      });
    });

    // Delete failure → friendly error + zeroed counts.
    it("returns an error when the delete fails", async () => {
      admin._tables.blog_likes = makeChain(
        {},
        {
          data: null,
          error: { message: "boom" },
        },
      );
      const result = await toggleBlogReaction("b1", "v1", "love", false);
      expect(result.error).toMatch(/couldn.?t remove/i);
      expect(result.counts).toEqual({
        like: 0,
        love: 0,
        haha: 0,
        wow: 0,
        celebrate: 0,
      });
    });
  });

  describe("getBlogReactionCounts", () => {
    // Tallies the reaction rows into per-type counts.
    it("tallies reaction rows into counts", async () => {
      const counts = await getBlogReactionCounts("b1");
      expect(counts).toEqual({
        like: 2,
        love: 1,
        haha: 0,
        wow: 0,
        celebrate: 0,
      });
    });

    // No rows → all zeroes.
    it("returns all zeroes when there are no rows", async () => {
      admin._tables.blog_likes = makeChain({}, { data: [], error: null });
      const counts = await getBlogReactionCounts("b1");
      expect(counts).toEqual({
        like: 0,
        love: 0,
        haha: 0,
        wow: 0,
        celebrate: 0,
      });
    });
  });

  const commentForm = {
    blog_id: "b1",
    slug: "hello",
    body: "Great post!",
  };

  describe("submitBlogComment", () => {
    // Empty / whitespace-only body is rejected.
    it("rejects an empty body", async () => {
      const result = await submitBlogComment({ ...commentForm, body: "   " });
      expect(result.error).toMatch(/write something/i);
    });

    // Over 2000 chars is rejected.
    it("rejects a body over 2000 characters", async () => {
      const result = await submitBlogComment({
        ...commentForm,
        body: "a".repeat(2001),
      });
      expect(result.error).toMatch(/too long/i);
    });

    // Anonymous visitors are blocked.
    it("rejects when not signed in", async () => {
      supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      const result = await submitBlogComment(commentForm);
      expect(result.error).toMatch(/sign in/i);
    });

    // Without a customer profile row the action stops.
    it("rejects when the customer profile is missing", async () => {
      supabase._tables.users = makeChain({ data: null, error: null });
      const result = await submitBlogComment(commentForm);
      expect(result.error).toMatch(/profile/i);
    });

    // Author name is snapshotted from first + last name.
    it("snapshots the author name from the customer profile", async () => {
      const result = await submitBlogComment(commentForm);
      expect(result.success).toBe(true);
      const inserted = supabase._tables.blog_comments.insert.mock.calls[0][0];
      expect(inserted.author_name).toBe("Ada Lovelace");
      expect(inserted.blog_id).toBe("b1");
      expect(inserted.user_id).toBe("user-1");
      expect(inserted.body).toBe("Great post!");
    });

    // Insert error surfaces its message.
    it("returns the raw message on an insert error", async () => {
      supabase._tables.blog_comments = makeChain(
        {},
        {
          data: null,
          error: { message: "boom" },
        },
      );
      const result = await submitBlogComment(commentForm);
      expect(result.error).toBe("boom");
    });

    // Happy path revalidates the blog detail page.
    it("revalidates the blog page on success", async () => {
      await submitBlogComment(commentForm);
      expect(revalidatePath).toHaveBeenCalledWith("/blogs/hello");
    });
  });

  describe("deleteBlogComment", () => {
    // Anonymous visitors blocked.
    it("rejects when not signed in", async () => {
      supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      const result = await deleteBlogComment("cmt-1", "hello");
      expect(result.error).toMatch(/sign in/i);
    });

    // Delete error surfaces its message.
    it("returns the raw message on a delete error", async () => {
      supabase._tables.blog_comments = makeChain(
        {},
        {
          data: null,
          error: { message: "boom" },
        },
      );
      const result = await deleteBlogComment("cmt-1", "hello");
      expect(result.error).toBe("boom");
    });

    // Happy path — deletes by id and revalidates.
    it("deletes the comment and revalidates", async () => {
      const result = await deleteBlogComment("cmt-1", "hello");
      expect(result.success).toBe(true);
      expect(supabase._tables.blog_comments.delete).toHaveBeenCalled();
      expect(supabase._tables.blog_comments.eq).toHaveBeenCalledWith(
        "id",
        "cmt-1",
      );
      expect(revalidatePath).toHaveBeenCalledWith("/blogs/hello");
    });
  });
});
