"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Supabase Realtime changes on the given tables and refreshes the
 * current dashboard route when one fires — so storefront-driven changes (a new
 * order, a customer submitting a blog for review) show up without a manual
 * refresh. `router.refresh()` re-runs the server components in place (no full
 * page reload), so the list updates SPA-style.
 *
 * Robustness: the realtime socket can silently drop on a network blip or when
 * the laptop sleeps, missing events while it's down. As a safety net we also
 * refresh when the tab regains focus, so the view is never left stale even if
 * the subscription missed something.
 *
 * Realtime respects RLS: the signed-in admin only receives events for rows they
 * can SELECT (e.g. only their own store's orders). Renders nothing.
 *
 * NOTE: each table must be in Supabase's `supabase_realtime` publication — see
 * supabase/realtime_orders.sql / realtime_blogs.sql. Without that, no events
 * fire and only the tab-focus fallback keeps things fresh.
 */
export function RealtimeRefresher({ tables }: { tables: string[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable key so the effect doesn't re-subscribe on every render.
  const tableKey = tables.join(",");

  useEffect(() => {
    const supabase = createClient();

    // Coalesce bursts (e.g. a multi-row write) into a single refresh.
    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase.channel(`dashboard-realtime:${tableKey}`);
    for (const table of tableKey.split(",").filter(Boolean)) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleRefresh,
      );
    }
    channel.subscribe();

    // Fallback: whenever the tab becomes visible again, re-fetch — catches any
    // events the socket missed while backgrounded / disconnected.
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [tableKey, router]);

  return null;
}
