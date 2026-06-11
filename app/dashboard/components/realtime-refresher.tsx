"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Supabase Realtime changes on the given tables and refreshes the
 * current dashboard route when one fires — so storefront-driven changes (e.g. a
 * customer submitting a blog for review) show up without a manual refresh.
 *
 * Realtime respects RLS: the signed-in admin only receives events for rows they
 * can SELECT. Renders nothing.
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

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [tableKey, router]);

  return null;
}
