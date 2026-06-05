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

type Point = { label: string; revenue: number; orders: number };

const data7: Point[] = [
  { label: "Dec", revenue: 248, orders: 920 },
  { label: "Jan", revenue: 312, orders: 1040 },
  { label: "Feb", revenue: 214, orders: 880 },
  { label: "Mar", revenue: 368, orders: 1180 },
  { label: "Apr", revenue: 290, orders: 1010 },
  { label: "May", revenue: 402, orders: 1240 },
  { label: "Jun", revenue: 429, orders: 1284 },
];

const data12: Point[] = [
  { label: "Jul", revenue: 178, orders: 640 },
  { label: "Aug", revenue: 244, orders: 820 },
  { label: "Sep", revenue: 212, orders: 760 },
  { label: "Oct", revenue: 268, orders: 900 },
  { label: "Nov", revenue: 330, orders: 1080 },
  { label: "Dec", revenue: 312, orders: 980 },
  { label: "Jan", revenue: 258, orders: 940 },
  { label: "Feb", revenue: 290, orders: 1010 },
  { label: "Mar", revenue: 356, orders: 1160 },
  { label: "Apr", revenue: 310, orders: 1070 },
  { label: "May", revenue: 392, orders: 1230 },
  { label: "Jun", revenue: 429, orders: 1284 },
];

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

export function RevenueChart() {
  const [range, setRange] = useState<"7M" | "1Y" | "All">("7M");
  const data = range === "7M" ? data7 : data12;

  return (
    <div className="dash-card h-full">
      <div className="dash-card-header">
        <div>
          <div className="dash-card-title">Revenue Overview</div>
          <div className="dash-card-sub">
            {range === "7M" ? "Last 7 months" : "Last 12 months"}
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
        <div className="mb-5 flex items-end gap-3">
          <div className="font-mono-dash text-[28px] font-semibold leading-none tracking-tight text-[var(--dash-text)]">
            ₹4,28,900
          </div>
          <span className="dash-trend dash-trend-up mb-1">+12.4%</span>
          <span className="mb-1 text-[12.5px] text-[var(--dash-text-3)]">
            vs last period
          </span>
        </div>
        <div className="h-[260px] w-full">
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
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--dash-accent)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} dy={8} />
              <YAxis axisLine={false} tickLine={false} width={48} />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{
                  stroke: "var(--dash-accent)",
                  strokeWidth: 1,
                  strokeDasharray: "4 4",
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--dash-accent)"
                strokeWidth={2.5}
                fill="url(#revFill)"
                dot={false}
                activeDot={{
                  r: 5,
                  fill: "var(--dash-accent)",
                  stroke: "var(--dash-surface)",
                  strokeWidth: 2.5,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
