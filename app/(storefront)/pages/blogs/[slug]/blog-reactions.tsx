"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquarePlus, SmilePlus } from "lucide-react";
import { toggleBlogReaction } from "@/app/actions/blog-social";
import {
  BLOG_REACTIONS,
  type BlogReaction,
  type ReactionCounts,
} from "@/lib/blog-reactions";

const VISITOR_KEY = "soakd_visitor_id";

const REACTION_META: Record<BlogReaction, { emoji: string; label: string }> = {
  like: { emoji: "👍", label: "Like" },
  love: { emoji: "❤️", label: "Love" },
  haha: { emoji: "😂", label: "Haha" },
  wow: { emoji: "😮", label: "Wow" },
  celebrate: { emoji: "🎉", label: "Celebrate" },
};

// Pre-computed positions for the semicircular fan that opens to the LEFT of the
// reaction button (radius px from the button centre, arc spanning ~136°).
const FAN = (() => {
  const R = 96;
  const n: number = BLOG_REACTIONS.length;
  return BLOG_REACTIONS.map((_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const angle = ((-68 + 136 * t) * Math.PI) / 180;
    return { dx: -R * Math.cos(angle), dy: R * Math.sin(angle) };
  });
})();

function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

/**
 * Google-Docs-style floating action bar (right rail on desktop, bottom on
 * mobile): a reaction button that fans the emojis out in a semicircle, and a
 * comment button that jumps to the composer. Reactions are anonymous and a
 * visitor may pick several; the chosen set is remembered per-browser in
 * localStorage and each emoji shows its own count.
 */
export function BlogReactions({
  blogId,
  initialCounts,
}: {
  blogId: string;
  initialCounts: ReactionCounts;
}) {
  const [counts, setCounts] = useState<ReactionCounts>(initialCounts);
  const [mine, setMine] = useState<Set<BlogReaction>>(new Set());
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const mineKey = `soakd_blog_reactions_${blogId}`;

  // Hydrate the visitor's saved reactions from localStorage after mount.
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(mineKey) || "[]");
      const set = new Set<BlogReaction>(
        Array.isArray(raw)
          ? raw.filter((r): r is BlogReaction => BLOG_REACTIONS.includes(r))
          : [],
      );
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage (external store)
      setMine(set);
    } catch {
      /* ignore malformed storage */
    }
  }, [mineKey]);

  // Fade the bar out once the site footer is in view so it never overlaps it.
  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const io = new IntersectionObserver(
      ([entry]) => setHidden(entry.isIntersecting),
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(footer);
    return () => io.disconnect();
  }, []);

  // Close the fan on outside-click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const total = BLOG_REACTIONS.reduce((sum, r) => sum + (counts[r] || 0), 0);

  const persist = (set: Set<BlogReaction>) =>
    localStorage.setItem(mineKey, JSON.stringify([...set]));

  const react = async (r: BlogReaction) => {
    const active = !mine.has(r);
    const prevCounts = counts;
    const prevMine = mine;

    const nextMine = new Set(prevMine);
    if (active) nextMine.add(r);
    else nextMine.delete(r);
    const optimistic = {
      ...prevCounts,
      [r]: Math.max(0, (prevCounts[r] || 0) + (active ? 1 : -1)),
    };
    setMine(nextMine);
    setCounts(optimistic);
    persist(nextMine);

    const res = await toggleBlogReaction(blogId, getVisitorId(), r, active);
    if (res.error) {
      setMine(prevMine);
      setCounts(prevCounts);
      persist(prevMine);
      return;
    }
    setCounts(res.counts);
  };

  const goToComment = () => {
    const input = document.getElementById("blog-comment-input");
    const section = document.getElementById("comments");
    (section ?? input)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => (input as HTMLTextAreaElement | null)?.focus(), 450);
  };

  return (
    <div
      className={`blog-reactions${hidden ? " is-hidden" : ""}${open ? " open" : ""}`}
      ref={rootRef}
      aria-hidden={hidden}
    >
      {/* Reaction button + its semicircular fan */}
      <div className="blog-reactions-react">
        <button
          type="button"
          className="blog-reactions-btn"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="React to this post"
          title="React"
        >
          <SmilePlus size={20} strokeWidth={1.9} />
          {total > 0 && <span className="blog-reactions-badge">{total}</span>}
        </button>

        <div
          className="blog-reaction-fan"
          role="group"
          aria-label="Pick a reaction"
        >
          {BLOG_REACTIONS.map((r, i) => {
            const meta = REACTION_META[r];
            const isMine = mine.has(r);
            return (
              <button
                key={r}
                type="button"
                className={`blog-reaction${isMine ? " active" : ""}`}
                style={
                  {
                    "--dx": `${FAN[i].dx}px`,
                    "--dy": `${FAN[i].dy}px`,
                    "--i": i,
                  } as React.CSSProperties
                }
                onClick={() => react(r)}
                aria-pressed={isMine}
                aria-label={`${meta.label} (${counts[r] || 0})`}
                title={meta.label}
              >
                <span className="blog-reaction-emoji">{meta.emoji}</span>
                <span className="blog-reaction-count">{counts[r] || 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Comment button */}
      <button
        type="button"
        className="blog-reactions-btn"
        onClick={goToComment}
        aria-label="Write a comment"
        title="Comment"
      >
        <MessageSquarePlus size={20} strokeWidth={1.9} />
      </button>
    </div>
  );
}
