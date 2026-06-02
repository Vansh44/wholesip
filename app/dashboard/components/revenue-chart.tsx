"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const data7Days = [
  { name: "Mon", revenue: 4000, orders: 24 },
  { name: "Tue", revenue: 3000, orders: 18 },
  { name: "Wed", revenue: 5000, orders: 32 },
  { name: "Thu", revenue: 2780, orders: 15 },
  { name: "Fri", revenue: 6890, orders: 48 },
  { name: "Sat", revenue: 8390, orders: 62 },
  { name: "Sun", revenue: 7490, orders: 51 },
];

export function RevenueChart() {
  const [activeTab, setActiveTab] = useState("7 Days");

  const tabs = ["7 Days", "30 Days", "90 Days", "12 Months"];

  return (
    <div className="h-full flex flex-col">
      <div className="mb-8 flex flex-col justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div>
          <span className="dashboard-kicker">Analytics View</span>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-primary">
            Revenue & Orders Analytics
          </h2>
          <p className="mt-1 text-sm text-secondary-foreground">
            Overview of your store performance
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-all ${
                activeTab === tab
                  ? "border-accent/35 bg-accent text-accent-foreground"
                  : "border-border/80 bg-background/80 text-muted-foreground hover:border-border hover:text-primary"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-[300px] w-full">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={0}
        >
          <AreaChart
            data={data7Days}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1E6B64" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#1E6B64" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="2 5"
              vertical={false}
              stroke="#D7D0C2"
            />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#67717D" }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#67717D" }}
              tickFormatter={(value) => `$${value}`}
              dx={-10}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "4px",
                border: "1px solid #D7D0C2",
                backgroundColor: "#FBFAF7",
                boxShadow: "0 14px 32px -24px rgba(19, 26, 34, 0.55)",
              }}
              itemStyle={{ color: "#131A22", fontWeight: 600 }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#1E6B64"
              strokeWidth={2.25}
              fillOpacity={1}
              fill="url(#colorRevenue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
