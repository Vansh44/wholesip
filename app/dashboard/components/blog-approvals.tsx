import Link from "next/link";
import { ClipboardCheck, ArrowRight } from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { blogs } from "@/drizzle/schema";
import { getActingStoreId } from "../lib/access";

interface PendingBlog {
  id: string;
  title: string | null;
  created_at: string;
}

const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

const AMBER = "var(--dash-amber)";

/**
 * Dashboard indicator: surfaces blog submissions awaiting approval
 * (status = "pending_review"). Shows a live count, a 7-day submission
 * mini bar chart, and a deep link into the pending review queue.
 */
export async function BlogApprovals() {
  const storeId = await getActingStoreId();

  let pending: PendingBlog[];
  let error = false;
  try {
    pending = (await withService((db) =>
      db
        .select({
          id: blogs.id,
          title: blogs.title,
          created_at: blogs.createdAt,
        })
        .from(blogs)
        .where(
          and(eq(blogs.storeId, storeId), eq(blogs.status, "pending_review")),
        )
        .orderBy(desc(blogs.createdAt)),
    )) as PendingBlog[];
  } catch {
    pending = [];
    error = true;
  }
  const count = pending.length;

  // Bucket submissions into the last 7 days (oldest → newest).
  const today = startOfDay(new Date());
  const buckets = Array.from({ length: 7 }, (_, i) => {
    const dayStart = today - (6 - i) * DAY_MS;
    return {
      dayStart,
      label: new Date(dayStart).toLocaleDateString("en-US", {
        weekday: "short",
      }),
      count: 0,
    };
  });
  for (const b of pending) {
    const day = startOfDay(new Date(b.created_at));
    const idx = Math.round((day - (today - 6 * DAY_MS)) / DAY_MS);
    if (idx >= 0 && idx < 7) buckets[idx].count++;
  }
  const maxBar = Math.max(1, ...buckets.map((b) => b.count));
  const hasPending = count > 0;

  return (
    <div className="dash-card h-full">
      <div className="dash-card-header">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-[var(--dash-radius-sm)]"
            style={{
              background: "var(--dash-amber-soft)",
              color: AMBER,
            }}
          >
            <ClipboardCheck className="h-[17px] w-[17px]" />
          </span>
          <div>
            <div className="dash-card-title">Blog Approvals</div>
            <div className="dash-card-sub">Submissions awaiting review</div>
          </div>
        </div>
        {hasPending && (
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
              style={{ background: AMBER }}
            />
            <span
              className="relative inline-flex h-2.5 w-2.5 rounded-full"
              style={{ background: AMBER }}
            />
          </span>
        )}
      </div>

      <div className="dash-card-body">
        {error ? (
          <p className="text-[13px] text-[var(--dash-text-3)]">
            Couldn&rsquo;t load approvals.
          </p>
        ) : (
          <>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <div
                  className="text-[34px] font-bold leading-none"
                  style={{ color: hasPending ? AMBER : "var(--dash-text)" }}
                >
                  {count}
                </div>
                <div className="mt-1 text-[12.5px] text-[var(--dash-text-2)]">
                  {hasPending
                    ? `request${count === 1 ? "" : "s"} need your review`
                    : "You're all caught up 🎉"}
                </div>
              </div>

              {/* 7-day submission mini bar chart */}
              <div className="flex h-12 items-end gap-1" aria-hidden>
                {buckets.map((b) => (
                  <div
                    key={b.dayStart}
                    title={`${b.label}: ${b.count}`}
                    className="w-2.5 rounded-[2px]"
                    style={{
                      height: `${Math.max(8, (b.count / maxBar) * 100)}%`,
                      background: b.count > 0 ? AMBER : "var(--dash-surface-3)",
                      opacity: b.count > 0 ? 1 : 0.6,
                    }}
                  />
                ))}
              </div>
            </div>

            {hasPending && (
              <div className="mb-3 flex flex-col gap-1.5">
                {pending.slice(0, 3).map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between gap-3 text-[12.5px]"
                  >
                    <span className="truncate text-[var(--dash-text)]">
                      {b.title?.trim() || "Untitled submission"}
                    </span>
                    <span className="shrink-0 font-mono-dash text-[11px] text-[var(--dash-text-3)]">
                      {relativeTime(b.created_at)}
                    </span>
                  </div>
                ))}
                {count > 3 && (
                  <div className="text-[11.5px] text-[var(--dash-text-3)]">
                    +{count - 3} more
                  </div>
                )}
              </div>
            )}

            <Link
              href="/dashboard/blogs?filter=pending"
              className="dash-btn dash-btn-ghost dash-btn-sm inline-flex items-center gap-1.5"
            >
              {hasPending ? "Review now" : "View blogs"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
