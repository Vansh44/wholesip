import { TrendingUp, ShoppingBag, Users, AlertTriangle } from "lucide-react";

export function ExecutiveMetrics() {
  return (
    <div className="w-full flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-border border-y border-border bg-transparent">
      {/* Metric 1: Revenue */}
      <div className="flex-1 py-6 sm:px-6 first:pl-0 last:pr-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-secondary-foreground">
          <TrendingUp className="h-4 w-4" />
          <span>Revenue</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold tracking-tight text-primary">
            $84,250.00
          </span>
          <span className="text-sm font-medium text-success">+12.5%</span>
        </div>
      </div>

      {/* Metric 2: Orders */}
      <div className="flex-1 py-6 sm:px-6 first:pl-0 last:pr-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-secondary-foreground">
          <ShoppingBag className="h-4 w-4" />
          <span>Orders</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold tracking-tight text-primary">
            1,248
          </span>
          <span className="text-sm font-medium text-success">+8.2%</span>
        </div>
      </div>

      {/* Metric 3: Customers */}
      <div className="flex-1 py-6 sm:px-6 first:pl-0 last:pr-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-secondary-foreground">
          <Users className="h-4 w-4" />
          <span>Customers</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold tracking-tight text-primary">
            8,492
          </span>
          <span className="text-sm font-medium text-success">+4.1%</span>
        </div>
      </div>

      {/* Metric 4: Alerts */}
      <div className="flex-1 py-6 sm:px-6 first:pl-0 last:pr-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-secondary-foreground">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span className="text-warning">Inventory Alerts</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold tracking-tight text-primary">
            12
          </span>
          <span className="text-sm font-medium text-warning">Low Stock</span>
        </div>
      </div>
    </div>
  );
}
