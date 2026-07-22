import {
  ShoppingCart,
  MessageSquare,
  FileText,
  type LucideIcon,
} from "lucide-react";
import type { ActivityItem } from "../analytics/data";

// Monochrome by design: the icon says WHAT happened, the text says the rest.
// Three tinted circles competing down the column made the feed harder to scan,
// not easier.
const KIND_ICON: Record<ActivityItem["kind"], LucideIcon> = {
  order: ShoppingCart,
  enquiry: MessageSquare,
  blog: FileText,
};

// Compact relative time: "just now", "12 min ago", "3 hr ago", "2 days ago".
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div className="dash-card h-full">
      <div className="dash-card-header">
        <div>
          <div className="dash-card-title">Recent activity</div>
          <div className="dash-card-sub">Across your store</div>
        </div>
      </div>
      <div className="px-[22px] py-2">
        {items.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[var(--dash-text-3)]">
            No activity yet.
          </div>
        ) : (
          items.map((item, i) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <div key={i} className="dash-activity-item">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--dash-border-strong)] bg-[var(--dash-surface-2)] text-[var(--dash-text-2)]">
                  <Icon className="h-[13px] w-[13px]" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="dash-activity-text">
                    {item.who && <strong>{item.who}</strong>} {item.detail}
                  </div>
                  <div className="dash-activity-time">
                    {relativeTime(item.createdAt)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
