import { HeroPanel } from "./components/hero-panel";
import { ExecutiveMetrics } from "./components/executive-metrics";
import { ActivityFeed } from "./components/activity-feed";
import { RevenueChart } from "./components/revenue-chart";
import { TopCategories } from "./components/top-categories";
import { RecentOrdersTable } from "./components/recent-orders-table";

export default async function DashboardHomePage() {
  return (
    <div className="dash-page-enter flex flex-col gap-5">
      <HeroPanel />
      <ExecutiveMetrics />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        <RevenueChart />
        <TopCategories />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <RecentOrdersTable />
        <ActivityFeed />
      </div>
    </div>
  );
}
