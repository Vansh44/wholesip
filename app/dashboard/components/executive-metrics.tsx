import {
  IndianRupee,
  Package,
  Users,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";

type Tone = "blue" | "green" | "amber" | "violet";

type Metric = {
  label: string;
  value: string;
  trend: string;
  trendUp: boolean;
  icon: LucideIcon;
  tone: Tone;
  spark: number[];
};

const toneColor: Record<Tone, string> = {
  blue: "var(--dash-accent)",
  green: "var(--dash-green)",
  amber: "var(--dash-amber)",
  violet: "var(--dash-violet)",
};

const metrics: Metric[] = [
  {
    label: "Total Revenue",
    value: "₹4,28,900",
    trend: "+12.4%",
    trendUp: true,
    icon: IndianRupee,
    tone: "blue",
    spark: [38, 42, 36, 48, 52, 47, 60, 58, 72, 70, 84, 92],
  },
  {
    label: "Orders This Month",
    value: "1,284",
    trend: "+8.1%",
    trendUp: true,
    icon: Package,
    tone: "green",
    spark: [30, 34, 32, 40, 44, 50, 48, 56, 60, 64, 70, 78],
  },
  {
    label: "Total Customers",
    value: "3,940",
    trend: "+5.3%",
    trendUp: true,
    icon: Users,
    tone: "amber",
    spark: [42, 44, 48, 46, 52, 55, 58, 60, 63, 66, 70, 74],
  },
  {
    label: "Products Listed",
    value: "248",
    trend: "-2.1%",
    trendUp: false,
    icon: ShoppingBag,
    tone: "violet",
    spark: [70, 66, 68, 60, 62, 55, 58, 50, 52, 46, 48, 44],
  },
];

function Sparkline({
  data,
  color,
  uid,
}: {
  data: number[];
  color: string;
  uid: string;
}) {
  const w = 96;
  const h = 36;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const gid = `spark-${uid}`;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ExecutiveMetrics() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric, i) => (
        <div key={metric.label} className="dash-stat-card">
          <div className="mb-4 flex items-start justify-between">
            <div className={`dash-stat-icon ${metric.tone}`}>
              <metric.icon className="h-[18px] w-[18px]" />
            </div>
            <span
              className={`dash-trend ${metric.trendUp ? "dash-trend-up" : "dash-trend-down"}`}
            >
              {metric.trendUp ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {metric.trend}
            </span>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="dash-stat-val">{metric.value}</div>
              <div className="dash-stat-label">{metric.label}</div>
            </div>
            <div className="shrink-0 pb-0.5">
              <Sparkline
                data={metric.spark}
                color={toneColor[metric.tone]}
                uid={`m${i}`}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
