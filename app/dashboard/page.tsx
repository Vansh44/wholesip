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
    <div className="flex w-full flex-col gap-8 animate-in fade-in duration-500 pb-16">
      <HeroPanel />
      <ActionCards />
      <ExecutiveMetrics />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="dashboard-panel lg:col-span-8 px-5 py-5 sm:px-6 sm:py-6">
          <RevenueChart />
        </div>
        <div className="dashboard-panel lg:col-span-4 px-5 py-5 sm:px-6 sm:py-6">
          <ActivityFeed />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="dashboard-panel lg:col-span-8 px-5 py-5 sm:px-6 sm:py-6">
          <ProductPerformance />
        </div>
        <div className="dashboard-panel lg:col-span-4 px-5 py-5 sm:px-6 sm:py-6">
          <OperationalHealth />
        </div>
      </div>
      <div className="dashboard-panel px-5 py-5 sm:px-6 sm:py-6">
        <InventoryHealth />
      </div>
      <div className="dashboard-panel px-5 py-5 sm:px-6 sm:py-6">
        <RecentOrdersTable />
      </div>
    </div>
  );
}
