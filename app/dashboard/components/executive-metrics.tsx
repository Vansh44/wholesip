import { TrendingUp, ShoppingBag, Users, AlertTriangle } from "lucide-react";

export function ExecutiveMetrics() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Card 1: Revenue */}
      <div className="enterprise-card p-6 flex flex-col justify-between h-[140px]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-secondary-foreground">
            Revenue This Month
          </span>
          <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
        </div>
        <div>
          <div className="text-[32px] font-bold text-primary tracking-tight">
            $84,250.00
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-sm font-medium text-success bg-success/10 px-1.5 rounded">
              +12.5%
            </span>
            <span className="text-xs text-secondary-foreground">
              vs last month
            </span>
          </div>
        </div>
      </div>

      {/* Card 2: Orders */}
      <div className="enterprise-card p-6 flex flex-col justify-between h-[140px]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-secondary-foreground">
            Orders
          </span>
          <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <ShoppingBag className="h-4 w-4 text-primary" />
          </div>
        </div>
        <div>
          <div className="text-[32px] font-bold text-primary tracking-tight">
            1,248
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-sm font-medium text-success bg-success/10 px-1.5 rounded">
              +8.2%
            </span>
            <span className="text-xs text-secondary-foreground">
              vs last month
            </span>
          </div>
        </div>
      </div>

      {/* Card 3: Customers */}
      <div className="enterprise-card p-6 flex flex-col justify-between h-[140px]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-secondary-foreground">
            Customers
          </span>
          <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <Users className="h-4 w-4 text-primary" />
          </div>
        </div>
        <div>
          <div className="text-[32px] font-bold text-primary tracking-tight">
            8,492
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-sm font-medium text-success bg-success/10 px-1.5 rounded">
              +4.1%
            </span>
            <span className="text-xs text-secondary-foreground">
              vs last month
            </span>
          </div>
        </div>
      </div>

      {/* Card 4: Inventory Alerts */}
      <div className="enterprise-card p-6 flex flex-col justify-between h-[140px]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-secondary-foreground">
            Inventory Alerts
          </span>
          <div className="h-8 w-8 rounded-full bg-warning/10 flex items-center justify-center">
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>
        </div>
        <div>
          <div className="text-[32px] font-bold text-primary tracking-tight">
            12
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-sm font-medium text-warning bg-warning/10 px-1.5 rounded">
              Low Stock
            </span>
            <span className="text-xs text-secondary-foreground">
              Needs attention
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
