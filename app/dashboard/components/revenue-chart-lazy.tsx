"use client";

import dynamic from "next/dynamic";

// recharts (+ its d3 dependencies) is ~100KB+ gzipped and was shipping in the
// dashboard home's initial JS, above the fold. Load it on the client after
// paint instead. ssr:false is required (recharts touches the DOM) and is only
// allowed inside a Client Component — hence this wrapper, since the dashboard
// home page is a Server Component.
export const RevenueChart = dynamic(
  () => import("./revenue-chart").then((m) => m.RevenueChart),
  {
    ssr: false,
    loading: () => (
      <div className="dash-card h-full min-h-[360px] animate-pulse" />
    ),
  },
);
