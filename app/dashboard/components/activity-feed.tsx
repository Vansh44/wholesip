import {
  ShoppingCart,
  FileText,
  AlertTriangle,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "lucide-react";

type Activity = {
  icon: LucideIcon;
  color: string;
  bg: string;
  text: React.ReactNode;
  time: string;
};

const activities: Activity[] = [
  {
    icon: ShoppingCart,
    color: "var(--dash-green)",
    bg: "var(--dash-green-soft)",
    text: (
      <>
        <strong>New order</strong> placed by Priya Sharma
      </>
    ),
    time: "2 min ago",
  },
  {
    icon: FileText,
    color: "var(--dash-accent)",
    bg: "var(--dash-accent-soft)",
    text: (
      <>
        <strong>Blog post</strong> &quot;Summer Sale Tips&quot; published
      </>
    ),
    time: "18 min ago",
  },
  {
    icon: AlertTriangle,
    color: "var(--dash-amber)",
    bg: "var(--dash-amber-soft)",
    text: (
      <>
        <strong>Low stock</strong> alert: Almond Soak (4 left)
      </>
    ),
    time: "1 hr ago",
  },
  {
    icon: UserPlus,
    color: "var(--dash-violet)",
    bg: "var(--dash-violet-soft)",
    text: (
      <>
        <strong>New customer</strong> Suresh K. registered
      </>
    ),
    time: "3 hr ago",
  },
  {
    icon: XCircle,
    color: "var(--dash-red)",
    bg: "var(--dash-red-soft)",
    text: (
      <>
        <strong>Order cancelled</strong> #ORD-4818 by Vikram Singh
      </>
    ),
    time: "5 hr ago",
  },
];

export function ActivityFeed() {
  return (
    <div className="dash-card h-full">
      <div className="dash-card-header">
        <div>
          <div className="dash-card-title">Recent Activity</div>
          <div className="dash-card-sub">Across your store</div>
        </div>
      </div>
      <div className="px-[22px] py-2">
        {activities.map((item, i) => (
          <div key={i} className="dash-activity-item">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: item.bg, color: item.color }}
            >
              <item.icon className="h-4 w-4" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="dash-activity-text">{item.text}</div>
              <div className="dash-activity-time">{item.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
