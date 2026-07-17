"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_POLL_MS = 20_000;

/**
 * Keeps a dashboard list fresh without a manual reload, so storefront-driven
 * changes (a new order, a customer blog submitted for review) show up on their
 * own. `router.refresh()` re-runs the server components in place, so the list
 * updates SPA-style (no full page reload).
 *
 * MECHANISM (GCP migration Phase 5): polls on an interval and refreshes when the
 * tab regains focus. This replaced Supabase Realtime, which has no Cloud SQL
 * equivalent — plain Postgres can't push row-change events to the browser. The
 * poll runs ONLY while the tab is visible (no wasted refreshes / DB load in the
 * background), and the focus refresh makes returning to the tab feel instant.
 * (A future Postgres LISTEN/NOTIFY → SSE service could restore true push.)
 *
 * `tables` is retained for API stability and as a hint of what the view watches;
 * the poll itself is table-agnostic. Renders nothing.
 */
export function RealtimeRefresher({
  tables,
  intervalMs = DEFAULT_POLL_MS,
}: {
  tables: string[];
  intervalMs?: number;
}) {
  const router = useRouter();
  // Stable dependency so the effect only restarts when the watched set changes.
  const key = tables.join(",");

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) {
        timer = setInterval(() => router.refresh(), intervalMs);
      }
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh(); // catch up immediately on return
        start();
      } else {
        stop(); // don't poll a backgrounded tab
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState === "visible") start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs, key]);

  return null;
}
