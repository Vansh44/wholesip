import { TrendingUp, ShoppingBag, Users, AlertTriangle } from "lucide-react";

export function ExecutiveMetrics() {
  const metrics = [
    {
      label: "Revenue",
      value: "$84,250.00",
      change: "+12.5%",
      icon: TrendingUp,
      tone: "text-accent",
    },
    {
      label: "Orders",
      value: "1,248",
      change: "+8.2%",
      icon: ShoppingBag,
      tone: "text-primary",
    },
    {
      label: "Customers",
      value: "8,492",
      change: "+4.1%",
      icon: Users,
      tone: "text-primary",
    },
    {
      label: "Inventory Alerts",
      value: "12",
      change: "Low Stock",
      icon: AlertTriangle,
      tone: "text-warning",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="dashboard-panel-muted flex min-h-[148px] flex-col justify-between px-5 py-5"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="dashboard-kicker">{metric.label}</span>
            <metric.icon className={`h-4 w-4 ${metric.tone}`} />
          </div>
          <div className="space-y-2">
            <div className="text-3xl font-semibold tracking-[-0.04em] text-primary">
              {metric.value}
            </div>
            <div className={`text-sm font-semibold ${metric.tone}`}>
              {metric.change}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
