"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type EnquiryPoint = { label: string; count: number };

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
  const count = payload[0].value;
  return (
    <div className="rounded-[10px] border border-[var(--dash-border-strong)] bg-[var(--dash-surface)] px-3 py-2 shadow-[var(--dash-shadow-lg)]">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--dash-text-3)]">
        {label}
      </div>
      <div className="font-mono-dash text-[15px] font-semibold text-[var(--dash-text)]">
        {count} {count === 1 ? "enquiry" : "enquiries"}
      </div>
    </div>
  );
}

export function EnquiriesChart({
  data,
  total,
}: {
  data: EnquiryPoint[];
  total: number;
}) {
  return (
    <div className="dash-card h-full">
      <div className="dash-card-header">
        <div>
          <div className="dash-card-title">Enquiries</div>
          <div className="dash-card-sub">Last 14 days</div>
        </div>
      </div>
      <div className="dash-card-body">
        <div className="mb-5 flex items-end gap-3">
          <div className="font-mono-dash text-[28px] font-semibold leading-none tracking-tight text-[var(--dash-text)]">
            {total}
          </div>
          <span className="mb-1 text-[12.5px] text-[var(--dash-text-3)]">
            {total === 1 ? "enquiry" : "enquiries"} received
          </span>
        </div>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
            >
              <defs>
                <linearGradient id="enqFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--dash-accent)"
                    stopOpacity={0.9}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--dash-accent)"
                    stopOpacity={0.45}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                dy={8}
                interval="preserveStartEnd"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={32}
                allowDecimals={false}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "var(--dash-surface-2)" }}
              />
              <Bar
                dataKey="count"
                fill="url(#enqFill)"
                radius={[4, 4, 0, 0]}
                maxBarSize={26}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
