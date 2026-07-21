import { ExecutiveMetrics } from "../components/executive-metrics";
import { ActivityFeed } from "../components/activity-feed";
import { RevenueChart } from "../components/revenue-chart-lazy";
import { EnquiriesOverview } from "../components/enquiries-overview";
import { TopCategories } from "../components/top-categories";
import { RecentOrdersTable } from "../components/recent-orders-table";
import { BlogApprovals } from "../components/blog-approvals";
import { RealtimeRefresher } from "../components/realtime-refresher";
import { requireSectionAccess } from "../lib/access";

// The store's performance dashboard — metrics, revenue, recent activity. This
// used to be the /dashboard landing page; it moved here when Home became a
// Shopify-style getting-started page. Gated on the `analytics` section.
export default async function AnalyticsPage() {
  const access = await requireSectionAccess("analytics", "view");
  const showBlogApprovals = access.can("blogs", "view");
  const showEnquiries = access.can("enquiries", "view");

  return (
    <div className="dash-page-enter flex flex-col gap-5">
      {showBlogApprovals && <RealtimeRefresher tables={["blogs"]} />}
      <header className="dash-page-header row">
        <div>
          <h1>Analytics</h1>
          <p>Your store&apos;s performance at a glance.</p>
        </div>
      </header>
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
