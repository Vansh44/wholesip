import { HeroPanel } from "./components/hero-panel";
import { ExecutiveMetrics } from "./components/executive-metrics";
import { ActivityFeed } from "./components/activity-feed";
import { QuickActionsPanel } from "./components/quick-actions-panel";
import { RevenueChart } from "./components/revenue-chart";
import { OperationalHealth } from "./components/operational-health";
import { ProductPerformance } from "./components/product-performance";
import { InventoryHealth } from "./components/inventory-health";
import { RecentOrdersTable } from "./components/recent-orders-table";

export default async function DashboardHomePage() {
  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 pb-10">
      {/* Hero Section */}
      <HeroPanel />

      {/* Executive Metrics */}
      <ExecutiveMetrics />

      {/* Main Grid Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <ActivityFeed />
        </div>
        <div className="lg:col-span-4">
          <QuickActionsPanel />
        </div>
      </div>

      {/* Main Grid Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <RevenueChart />
        </div>
        <div className="lg:col-span-4">
          <OperationalHealth />
        </div>
      </div>

      {/* Main Grid Row 3 */}
      <ProductPerformance />

      {/* Main Grid Row 4 */}
      <InventoryHealth />

      {/* Main Grid Row 5 */}
      <RecentOrdersTable />
    </div>
  );
}
