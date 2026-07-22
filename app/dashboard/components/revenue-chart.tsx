"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MonthPoint } from "../analytics/data";

export interface RevenueChartProps {
  series: { m7: MonthPoint[]; m12: MonthPoint[]; all: MonthPoint[] };
  totalRevenue: number;
  trendPct: number;
  trendUp: boolean;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[10px] border border-[var(--dash-border-strong)] bg-[var(--dash-surface)] px-3 py-2 shadow-[var(--dash-shadow-lg)]">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--dash-text-3)]">
        {label}
      </div>
      <div className="font-mono-dash text-[15px] font-semibold text-[var(--dash-text)]">
        ₹{payload[0].value.toLocaleString("en-IN")}K
      </div>
    </div>
  );
}

export function RevenueChart({
  series,
  totalRevenue,
  trendPct,
  trendUp,
}: RevenueChartProps) {
  const [range, setRange] = useState<"7M" | "1Y" | "All">("7M");
  const data =
    range === "7M" ? series.m7 : range === "1Y" ? series.m12 : series.all;
  const hasData = totalRevenue > 0;

  return (
    <div className="dash-card h-full">
      <div className="dash-card-header">
        <div>
          <div className="dash-card-title">Revenue over time</div>
          <div className="dash-card-sub">
            {range === "7M"
              ? "Last 7 months"
              : range === "1Y"
                ? "Last 12 months"
                : "All time"}
          </div>
        </div>
        <div className="dash-filter-tabs">
          {(["7M", "1Y", "All"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`dash-filter-tab ${range === tab ? "active" : ""}`}
              onClick={() => setRange(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div className="dash-card-body">
        <div className="mb-4 flex items-end gap-2.5">
          <div className="text-[24px] font-semibold leading-none tracking-[-0.5px] tabular-nums text-[var(--dash-text)]">
            ₹{Math.round(totalRevenue).toLocaleString("en-IN")}
          </div>
          {hasData && (
            <>
              <span
                className={`mb-0.5 text-[12.5px] font-medium tabular-nums ${
                  trendPct === 0
                    ? "text-[var(--dash-text-3)]"
                    : trendUp
                      ? "text-[var(--dash-green)]"
                      : "text-[var(--dash-red)]"
                }`}
              >
                {trendPct === 0
                  ? "—"
                  : `${trendUp ? "↑" : "↓"} ${Math.abs(trendPct)}%`}
              </span>
              <span className="mb-0.5 text-[12.5px] text-[var(--dash-text-3)]">
                vs last month
              </span>
            </>
          )}
        </div>
        <div className="relative h-[260px] w-full">
          {!hasData && (
            <div className="absolute inset-0 z-[1] flex items-center justify-center">
              <span className="text-[13px] text-[var(--dash-text-3)]">
                No revenue yet — your sales will appear here.
              </span>
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
            >
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--dash-accent)"
                    stopOpacity={0.14}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--dash-accent)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="0" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} dy={8} />
              <YAxis axisLine={false} tickLine={false} width={44} />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{
                  stroke: "var(--dash-border-hover)",
                  strokeWidth: 1,
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--dash-accent)"
                strokeWidth={2}
                fill="url(#revFill)"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: "var(--dash-accent)",
                  stroke: "var(--dash-surface)",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
