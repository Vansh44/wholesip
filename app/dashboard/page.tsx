import { HeroPanel } from "./components/hero-panel";
import { ExecutiveMetrics } from "./components/executive-metrics";
import { ActivityFeed } from "./components/activity-feed";
import { RevenueChart } from "./components/revenue-chart-lazy";
import { EnquiriesOverview } from "./components/enquiries-overview";
import { TopCategories } from "./components/top-categories";
import { RecentOrdersTable } from "./components/recent-orders-table";
import { BlogApprovals } from "./components/blog-approvals";
import { RealtimeRefresher } from "./components/realtime-refresher";
import { getViewerAccess } from "./lib/access";

export default async function DashboardHomePage() {
  const access = await getViewerAccess();
  const showBlogApprovals = access?.can("blogs", "view") ?? false;
  const showEnquiries = access?.can("enquiries", "view") ?? false;

  return (
    <div className="dash-page-enter flex flex-col gap-5">
      {showBlogApprovals && <RealtimeRefresher tables={["blogs"]} />}
      <HeroPanel />
      <ExecutiveMetrics />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        <RevenueChart />
        <div className="flex flex-col gap-5">
          {showBlogApprovals && <BlogApprovals />}
          <TopCategories />
        </div>
      </div>
      {showEnquiries && <EnquiriesOverview />}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <RecentOrdersTable />
        <ActivityFeed />
      </div>
    </div>
  );
}
