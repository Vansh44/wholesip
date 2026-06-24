"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/app/(storefront)/components/auth/AuthProvider";
import {
  deleteBlogComment,
  submitBlogComment,
} from "@/app/actions/blog-social";

export interface BlogComment {
  id: string;
  user_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function initials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function BlogComments({
  blogId,
  slug,
  comments,
}: {
  blogId: string;
  slug: string;
  comments: BlogComment[];
}) {
  const router = useRouter();
  const { customer, openAuthModal } = useAuth();
  const [body, setBody] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Set when a logged-out visitor hits "Post" — we open the login modal and
  // post automatically once they're signed in, so their draft isn't lost.
  const pendingPost = useRef(false);

  const post = (text: string) => {
    startTransition(async () => {
      const res = await submitBlogComment({
        blog_id: blogId,
        slug,
        body: text,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Comment posted");
      setBody("");
      router.refresh();
    });
  };

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error("Write something first.");
      return;
    }
    // Logged out: let them keep their draft, send them to sign in, then post.
    if (!customer) {
      pendingPost.current = true;
      toast.message("Sign in to post your comment", {
        // description: "Your draft is saved — it'll post right after you log in.",
      });
      openAuthModal();
      return;
    }
    post(trimmed);
  };

  // Once the visitor signs in with a pending draft, post it automatically.
  useEffect(() => {
    if (customer && pendingPost.current && body.trim()) {
      pendingPost.current = false;
      post(body.trim());
    } else if (customer) {
      pendingPost.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  const remove = (id: string) => {
    startTransition(async () => {
      const res = await deleteBlogComment(id, slug);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Comment removed");
      router.refresh();
    });
  };

  const count = comments.length;
  // Comments arrive newest-first; show the latest 5 until the visitor expands.
  const VISIBLE = 5;
  const visible = showAll ? comments : comments.slice(0, VISIBLE);

  return (
    <section className="blog-comments" id="comments">
      <div className="blog-comments-head">
        <h2>Comments</h2>
        {count > 0 && (
          <span className="blog-comments-count">
            {count} {count === 1 ? "comment" : "comments"}
          </span>
        )}
      </div>

      <div className="blog-comment-form">
        <textarea
          id="blog-comment-input"
          className="blog-comment-textarea"
          placeholder="Share your thoughts…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={2000}
        />
        <div className="blog-comment-form-actions">
          {!customer && (
            <span className="blog-comment-hint">
              {/* You&apos;ll be asked to sign in when you post. */}
            </span>
          )}
          <button
            className="blog-comment-submit"
            onClick={submit}
            disabled={isPending || !body.trim()}
          >
            {isPending ? "Posting…" : "Post comment"}
          </button>
        </div>
      </div>

      <div className="blog-comment-list">
        {count === 0 ? (
          <p className="blog-comments-empty">
            No comments yet — be the first to share your thoughts.
          </p>
        ) : (
          visible.map((c) => {
            const isMine = customer?.id === c.user_id;
            return (
              <article key={c.id} className="blog-comment-card">
                <div className="blog-comment-card-head">
                  <span className="blog-comment-avatar">
                    {initials(c.author_name)}
                  </span>
                  <span className="blog-comment-author">
                    {c.author_name || "Anonymous"}
                    {isMine && <span className="blog-comment-you">You</span>}
                  </span>
                  <span className="blog-comment-date">
                    {formatDate(c.created_at)}
                  </span>
                  {isMine && (
                    <button
                      className="blog-comment-delete"
                      onClick={() => remove(c.id)}
                      disabled={isPending}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p className="blog-comment-body">{c.body}</p>
              </article>
            );
          })
        )}
      </div>

      {count > VISIBLE && (
        <button
          type="button"
          className="blog-comments-more"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show fewer" : `See all ${count} comments`}
        </button>
      )}
    </section>
  );
}
