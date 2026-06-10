import { HeroPanel } from "./components/hero-panel";
import { ExecutiveMetrics } from "./components/executive-metrics";
import { ActivityFeed } from "./components/activity-feed";
import { RevenueChart } from "./components/revenue-chart";
import { TopCategories } from "./components/top-categories";
import { RecentOrdersTable } from "./components/recent-orders-table";
import { BlogApprovals } from "./components/blog-approvals";
import { getViewerAccess } from "./lib/access";

export default async function DashboardHomePage() {
  const access = await getViewerAccess();
  const showBlogApprovals = access?.can("blogs", "view") ?? false;

  return (
    <div className="dash-page-enter flex flex-col gap-5">
      <HeroPanel />
      <ExecutiveMetrics />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        <RevenueChart />
        <div className="flex flex-col gap-5">
          {showBlogApprovals && <BlogApprovals />}
          <TopCategories />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <RecentOrdersTable />
        <ActivityFeed />
      </div>
    </div>
  );
}
