"use client";

import dynamic from "next/dynamic";

// recharts (+ its d3 deps) is heavy and client-only. Load it after paint like
// revenue-chart-lazy.tsx. ssr:false is only allowed inside a Client Component,
// hence this wrapper for the Server Component dashboard home.
export const EnquiriesChart = dynamic(
  () => import("./enquiries-chart").then((m) => m.EnquiriesChart),
  {
    ssr: false,
    loading: () => (
      <div className="dash-card h-full min-h-[360px] animate-pulse" />
    ),
  },
);
