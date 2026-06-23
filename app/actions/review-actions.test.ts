/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { submitReview, deleteReview } from "./review-actions";
import { createClient } from "@/lib/supabase/server";
import { makeChain, makeSupabase } from "./_test-helpers";

const validReview = {
  product_id: "p1",
  slug: "almonds",
  rating: 5,
  comment: "Great",
};

// review-actions.ts — product reviews are written by signed-in users.
// The unique (product_id, user_id) constraint makes this an upsert.
describe("review-actions", () => {
  let supabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase({
      users: makeChain({
        data: { first_name: "Ada", last_name: "Lovelace" },
        error: null,
      }),
      product_reviews: makeChain({ data: null, error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(supabase);
  });

  describe("submitReview", () => {
    // Anonymous visitors must sign in to leave a review.
    it("rejects unauthenticated callers", async () => {
      supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      const result = await submitReview(validReview);
      expect(result.error).toMatch(/sign in/i);
    });

    // Star rating must be 1–5 — anything else is rejected.
    it("rejects a rating below 1", async () => {
      const result = await submitReview({ ...validReview, rating: 0 });
      expect(result.error).toMatch(/1 to 5/);
    });

    it("rejects a rating above 5", async () => {
      const result = await submitReview({ ...validReview, rating: 6 });
      expect(result.error).toMatch(/1 to 5/);
    });

    // A signed-in user without a users row can't write a review — the
    // join target for the author name is required.
    it("rejects when customer profile is missing", async () => {
      supabase._tables.users = makeChain({ data: null, error: null });
      const result = await submitReview(validReview);
      expect(result.error).toMatch(/profile/i);
    });

    // Happy path — upsert with the author name snapshotted onto the review.
    it("upserts the review with snapshotted author name", async () => {
      const result = await submitReview(validReview);
      expect(result.success).toBe(true);
      const upserted = supabase._tables.product_reviews.upsert.mock.calls[0][0];
      expect(upserted.author_name).toBe("Ada Lovelace");
      expect(upserted.product_id).toBe("p1");
      expect(upserted.rating).toBe(5);
    });

    // Fallback name when both first/last are missing/empty.
    it("falls back to 'Anonymous' when the customer's name is empty", async () => {
      supabase._tables.users = makeChain({
        data: { first_name: "", last_name: null },
        error: null,
      });
      await submitReview(validReview);
      const upserted = supabase._tables.product_reviews.upsert.mock.calls[0][0];
      expect(upserted.author_name).toBe("Anonymous");
    });

    // Float ratings (4.7) get truncated to int (4).
    it("truncates fractional ratings to integers", async () => {
      await submitReview({ ...validReview, rating: 4.7 });
      const upserted = supabase._tables.product_reviews.upsert.mock.calls[0][0];
      expect(upserted.rating).toBe(4);
    });
  });

  describe("deleteReview", () => {
    // Anonymous visitors blocked.
    it("rejects unauthenticated callers", async () => {
      supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      const result = await deleteReview("r1", "almonds");
      expect(result.error).toMatch(/sign in/i);
    });

    // Happy path — the action triggers a delete on product_reviews
    // (RLS enforces ownership at the DB layer).
    it("issues a delete on product_reviews", async () => {
      const result = await deleteReview("r1", "almonds");
      expect(result.success).toBe(true);
      expect(supabase._tables.product_reviews.delete).toHaveBeenCalled();
    });
  });
});
