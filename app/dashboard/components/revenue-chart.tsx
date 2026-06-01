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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 border-b border-border pb-3">
        <div>
          <h2 className="text-lg font-semibold text-primary">
            Revenue & Orders Analytics
          </h2>
          <p className="text-sm text-secondary-foreground mt-0.5">
            Overview of your store performance
          </p>
        </div>

        <div className="flex bg-muted p-1 rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === tab
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-primary"
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
                <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#E5E7EB"
            />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#6B7280" }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#6B7280" }}
              tickFormatter={(value) => `$${value}`}
              dx={-10}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #E5E7EB",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
              itemStyle={{ color: "#111827", fontWeight: 500 }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#6366F1"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorRevenue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
