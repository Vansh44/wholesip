import { HeroPanel } from "./components/hero-panel";
import { ExecutiveMetrics } from "./components/executive-metrics";
import { ActivityFeed } from "./components/activity-feed";
import { RevenueChart } from "./components/revenue-chart-lazy";
import { EnquiriesChart } from "./components/enquiries-chart-lazy";
import { TopCategories } from "./components/top-categories";
import { RecentOrdersTable } from "./components/recent-orders-table";
import { BlogApprovals } from "./components/blog-approvals";
import { RealtimeRefresher } from "./components/realtime-refresher";
import { getViewerAccess } from "./lib/access";
import { createAdminClient } from "@/lib/supabase/admin";

const ENQUIRY_CHART_DAYS = 14;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Per-day enquiry counts for the last ENQUIRY_CHART_DAYS days, read through the
 * service-role admin client (RLS on enquiries is own-row only). Returns null if
 * the table isn't migrated yet so the dashboard home still renders.
 */
async function getEnquiryChartData(): Promise<{
  data: { label: string; count: number }[];
  total: number;
} | null> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (ENQUIRY_CHART_DAYS - 1));

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("enquiries")
    .select("created_at")
    .gte("created_at", start.toISOString());

  if (error) return null;

  const buckets = new Map<string, number>();
  const labels = new Map<string, string>();
  for (let i = 0; i < ENQUIRY_CHART_DAYS; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    buckets.set(key, 0);
    labels.set(key, dayLabel(d));
  }

  for (const row of data ?? []) {
    const key = dayKey(new Date(row.created_at as string));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const points = Array.from(buckets.entries()).map(([key, count]) => ({
    label: labels.get(key) ?? key,
    count,
  }));
  const total = points.reduce((sum, p) => sum + p.count, 0);
  return { data: points, total };
}

export default async function DashboardHomePage() {
  const access = await getViewerAccess();
  const showBlogApprovals = access?.can("blogs", "view") ?? false;
  const showEnquiries = access?.can("enquiries", "view") ?? false;

  const enquiryChart = showEnquiries ? await getEnquiryChartData() : null;

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
      {enquiryChart && (
        <EnquiriesChart data={enquiryChart.data} total={enquiryChart.total} />
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <RecentOrdersTable />
        <ActivityFeed />
      </div>
    </div>
  );
}
