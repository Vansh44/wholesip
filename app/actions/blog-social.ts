"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  BLOG_REACTIONS,
  type BlogReaction,
  type ReactionCounts,
} from "@/lib/blog-reactions";

export interface ActionResult {
  success?: boolean;
  error?: string;
}

function emptyCounts(): ReactionCounts {
  return { like: 0, love: 0, haha: 0, wow: 0, celebrate: 0 };
}

// Tally reaction rows for a blog into per-type counts. PostgREST can't GROUP BY
// without an RPC, so we read the (small) set of reaction strings and count in
// JS. Used by both the server action and the page's initial render.
async function tallyReactions(
  client: ReturnType<typeof createAdminClient>,
  blogId: string,
): Promise<ReactionCounts> {
  const counts = emptyCounts();
  const { data } = await client
    .from("blog_likes")
    .select("reaction")
    .eq("blog_id", blogId);
  for (const row of (data ?? []) as { reaction: BlogReaction }[]) {
    if (row.reaction in counts) counts[row.reaction] += 1;
  }
  return counts;
}

/**
 * Toggle ONE emoji reaction for a blog on/off. No login required — the browser
 * passes a random `visitorId` (localStorage). A visitor may hold several
 * different reactions at once (one row per emoji); `active` is the desired
 * state for THIS emoji (true = add, false = remove). Runs through the
 * service-role admin client, so there are no public write policies on
 * blog_likes to abuse. Returns the fresh per-reaction counts.
 */
export async function toggleBlogReaction(
  blogId: string,
  visitorId: string,
  reaction: BlogReaction,
  active: boolean,
): Promise<{ counts: ReactionCounts; error?: string }> {
  if (!blogId || !visitorId) {
    return { counts: emptyCounts(), error: "Missing reaction context." };
  }
  if (!BLOG_REACTIONS.includes(reaction)) {
    return { counts: emptyCounts(), error: "Unknown reaction." };
  }

  const admin = createAdminClient();

  if (active) {
    const { error } = await admin
      .from("blog_likes")
      .upsert(
        { blog_id: blogId, visitor_id: visitorId, reaction },
        { onConflict: "blog_id,visitor_id,reaction", ignoreDuplicates: true },
      );
    if (error) {
      console.error("toggleBlogReaction upsert error:", error);
      return { counts: emptyCounts(), error: "Couldn't save your reaction." };
    }
  } else {
    const { error } = await admin
      .from("blog_likes")
      .delete()
      .eq("blog_id", blogId)
      .eq("visitor_id", visitorId)
      .eq("reaction", reaction);
    if (error) {
      console.error("toggleBlogReaction delete error:", error);
      return { counts: emptyCounts(), error: "Couldn't remove your reaction." };
    }
  }

  return { counts: await tallyReactions(admin, blogId) };
}

/** Per-reaction counts for a blog (server-side initial render). */
export async function getBlogReactionCounts(
  blogId: string,
): Promise<ReactionCounts> {
  return tallyReactions(createAdminClient(), blogId);
}

/**
 * Post a comment on a blog. Requires a signed-in customer. The author's name is
 * snapshotted onto the row (customers is own-row-only under RLS, so public
 * readers can't join to it).
 */
export async function submitBlogComment(form: {
  blog_id: string;
  slug: string;
  body: string;
}): Promise<ActionResult> {
  const body = form.body.trim();
  if (!body) return { error: "Write something first." };
  if (body.length > 2000) {
    return { error: "Comment is too long (2000 characters max)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in to comment." };

  const { data: customer } = await supabase
    .from("users")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  if (!customer) {
    return { error: "Complete your profile before commenting." };
  }

  const authorName = `${customer.first_name ?? ""}${
    customer.last_name ? " " + customer.last_name : ""
  }`.trim();

  const { error } = await supabase.from("blog_comments").insert({
    blog_id: form.blog_id,
    user_id: user.id,
    author_name: authorName || "Anonymous",
    body,
  });

  if (error) {
    console.error("submitBlogComment error:", error);
    return { error: error.message };
  }

  revalidatePath(`/blogs/${form.slug}`);
  return { success: true };
}

/** Delete the signed-in customer's own comment (RLS enforces ownership). */
export async function deleteBlogComment(
  commentId: string,
  slug: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const { error } = await supabase
    .from("blog_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    console.error("deleteBlogComment error:", error);
    return { error: error.message };
  }

  revalidatePath(`/blogs/${slug}`);
  return { success: true };
}
