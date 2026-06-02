import { IndianRupee, Package, Users, ShoppingBag } from "lucide-react";

export function ExecutiveMetrics() {
  const metrics = [
    {
      label: "Total Revenue",
      value: "₹4,28,900",
      trend: "+12.4%",
      trendUp: true,
      icon: IndianRupee,
      tone: "blue" as const,
    },
    {
      label: "Orders This Month",
      value: "1,284",
      trend: "+8.1%",
      trendUp: true,
      icon: Package,
      tone: "green" as const,
    },
    {
      label: "Total Customers",
      value: "3,940",
      trend: "+5.3%",
      trendUp: true,
      icon: Users,
      tone: "amber" as const,
    },
    {
      label: "Products Listed",
      value: "248",
      trend: "-2.1%",
      trendUp: false,
      icon: ShoppingBag,
      tone: "red" as const,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="dash-stat-card">
          <div className="mb-3 flex items-start justify-between">
            <div className={`dash-stat-icon ${metric.tone}`}>
              <metric.icon className="h-4 w-4" />
            </div>
            <span
              className={`dash-trend ${metric.trendUp ? "dash-trend-up" : "dash-trend-down"}`}
            >
              {metric.trend}
            </span>
          </div>
          <div className="dash-stat-val">{metric.value}</div>
          <div className="dash-stat-label">{metric.label}</div>
        </div>
      ))}
    </div>
  );
}
