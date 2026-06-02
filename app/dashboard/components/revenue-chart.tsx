"use client";

import { useState } from "react";

const months7 = [
  { label: "Dec", height: "55%", accent: false },
  { label: "Jan", height: "70%", accent: false },
  { label: "Feb", height: "48%", accent: false },
  { label: "Mar", height: "82%", accent: false },
  { label: "Apr", height: "65%", accent: false },
  { label: "May", height: "90%", accent: false },
  { label: "Jun", height: "100%", accent: true },
];

const months12 = [
  { label: "Jul", height: "40%", accent: false },
  { label: "Aug", height: "55%", accent: false },
  { label: "Sep", height: "48%", accent: false },
  { label: "Oct", height: "60%", accent: false },
  { label: "Nov", height: "75%", accent: false },
  { label: "Dec", height: "70%", accent: false },
  { label: "Jan", height: "58%", accent: false },
  { label: "Feb", height: "65%", accent: false },
  { label: "Mar", height: "80%", accent: false },
  { label: "Apr", height: "70%", accent: false },
  { label: "May", height: "88%", accent: false },
  { label: "Jun", height: "100%", accent: true },
];

export function RevenueChart() {
  const [range, setRange] = useState<"7M" | "1Y" | "All">("7M");
  const bars = range === "1Y" || range === "All" ? months12 : months7;

  return (
    <div className="dash-card">
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
        <div className="dash-bar-chart">
          {bars.map((bar) => (
            <div key={bar.label} className="dash-bar-wrap">
              <div className="dash-bar-spacer" />
              <div
                className={`dash-bar-fill ${bar.accent ? "accent" : "muted"}`}
                style={{ height: bar.height }}
              />
              <span className="dash-bar-label">{bar.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
