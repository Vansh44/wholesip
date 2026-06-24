"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface ReviewFormData {
  product_id: string;
  slug: string; // used to revalidate the product page
  rating: number; // 1–5
  comment: string;
}

export interface ActionResult {
  success?: boolean;
  error?: string;
}

// Post or update the signed-in customer's review for a product. There's a
// unique (product_id, user_id) constraint, so this upserts: a second
// submission edits the existing review rather than creating a duplicate.
export async function submitReview(
  form: ReviewFormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please sign in to write a review." };
  }

  const rating = Math.trunc(form.rating);
  if (!(rating >= 1 && rating <= 5)) {
    return { error: "Please choose a rating from 1 to 5 stars." };
  }

  // The reviewer's name is snapshotted onto the review (customers is own-row
  // only under RLS, so public readers can't join to it).
  const { data: customer } = await supabase
    .from("users")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  if (!customer) {
    return { error: "Complete your profile before writing a review." };
  }

  const authorName = `${customer.first_name ?? ""}${
    customer.last_name ? " " + customer.last_name : ""
  }`.trim();

  const { error } = await supabase.from("product_reviews").upsert(
    {
      product_id: form.product_id,
      user_id: user.id,
      author_name: authorName || "Anonymous",
      rating,
      comment: form.comment.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id,user_id" },
  );

  if (error) {
    console.error("submitReview error:", error);
    return { error: error.message };
  }

  revalidatePath(`/shop/${form.slug}`);
  return { success: true };
}

// Delete the signed-in customer's own review (RLS enforces ownership).
export async function deleteReview(
  reviewId: string,
  slug: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Please sign in." };

  const { error } = await supabase
    .from("product_reviews")
    .delete()
    .eq("id", reviewId);

  if (error) {
    console.error("deleteReview error:", error);
    return { error: error.message };
  }

  revalidatePath(`/(pages)/shop/${slug}`);
  return { success: true };
}
