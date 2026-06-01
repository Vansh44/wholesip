import { HeroPanel } from "./components/hero-panel";
import { ExecutiveMetrics } from "./components/executive-metrics";
import { ActivityFeed } from "./components/activity-feed";
import { ActionCards } from "./components/action-cards";
import { RevenueChart } from "./components/revenue-chart";
import { OperationalHealth } from "./components/operational-health";
import { ProductPerformance } from "./components/product-performance";
import { InventoryHealth } from "./components/inventory-health";
import { RecentOrdersTable } from "./components/recent-orders-table";

export default async function DashboardHomePage() {
  return (
    <div className="flex flex-col gap-12 w-full animate-in fade-in duration-500 pb-20">
      {/* Header Area */}
      <HeroPanel />

      {/* Horizontal Actions Strip */}
      <ActionCards />

      {/* Executive Metrics Overview */}
      <ExecutiveMetrics />

      {/* Main Grid Row 1: Analytics & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8">
          <RevenueChart />
        </div>
        <div className="lg:col-span-4">
          <ActivityFeed />
        </div>
      </div>

      {/* Main Grid Row 2: Performance & Health */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8">
          <ProductPerformance />
        </div>
        <div className="lg:col-span-4">
          <OperationalHealth />
        </div>
      </div>

      {/* Main Grid Row 3: Inventory */}
      <InventoryHealth />

      {/* Main Grid Row 4: Orders */}
      <RecentOrdersTable />
    </div>
  );
}
