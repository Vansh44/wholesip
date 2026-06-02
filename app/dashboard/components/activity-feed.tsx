import {
  ShoppingBag,
  Edit,
  UserPlus,
  RefreshCcw,
  FileText,
} from "lucide-react";

const activities = [
  {
    id: 1,
    type: "order",
    title: "New order placed",
    description: "Order #4092 for $249.00 by Sarah Jenkins.",
    time: "10 mins ago",
    icon: ShoppingBag,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    id: 2,
    type: "product",
    title: "Product updated",
    description: "Pricing updated for 'Premium Wireless Headphones'.",
    time: "1 hour ago",
    icon: Edit,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
  },
  {
    id: 3,
    type: "customer",
    title: "New customer registered",
    description: "Michael Chen joined via organic search.",
    time: "2 hours ago",
    icon: UserPlus,
    color: "text-success",
    bg: "bg-success/10",
  },
  {
    id: 4,
    type: "refund",
    title: "Refund processed",
    description: "Refund of $45.00 processed for Order #4088.",
    time: "4 hours ago",
    icon: RefreshCcw,
    color: "text-warning",
    bg: "bg-warning/10",
  },
  {
    id: 5,
    type: "blog",
    title: "Blog published",
    description: "'10 Tips for Better Audio' is now live.",
    time: "Yesterday",
    icon: FileText,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
];

export function ActivityFeed() {
  return (
    <div className="h-full">
      <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
        <div>
          <span className="dashboard-kicker">Signals</span>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-primary">
            Business Activity
          </h2>
        </div>
        <button className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
          View all
        </button>
      </div>

      <div className="relative">
        <div className="absolute bottom-2 left-[15px] top-2 z-0 w-px bg-border/60"></div>

        <div className="relative z-10 flex flex-col gap-5">
          {activities.map((activity) => (
            <div key={activity.id} className="group flex gap-3 items-start">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center border border-border/80 bg-card ${activity.bg}`}
              >
                <activity.icon className={`h-3.5 w-3.5 ${activity.color}`} />
              </div>
              <div className="flex flex-col pt-0.5">
                <span className="text-sm font-semibold text-primary transition-colors group-hover:text-accent">
                  {activity.title}
                </span>
                <span className="mt-1 text-xs leading-5 text-secondary-foreground">
                  {activity.description}
                </span>
                <span className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {activity.time}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
