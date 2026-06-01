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
      <div className="flex items-center justify-between mb-6 border-b border-border pb-3">
        <h2 className="text-lg font-semibold text-primary">
          Business Activity
        </h2>
        <button className="text-xs font-medium text-accent hover:underline">
          View all
        </button>
      </div>

      <div className="relative">
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border/60 z-0"></div>

        <div className="flex flex-col gap-4 relative z-10">
          {activities.map((activity) => (
            <div key={activity.id} className="flex gap-3 group items-start">
              <div
                className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center border-[3px] border-card ${activity.bg}`}
              >
                <activity.icon className={`h-3.5 w-3.5 ${activity.color}`} />
              </div>
              <div className="flex flex-col pt-1">
                <span className="text-sm font-medium text-primary group-hover:text-accent transition-colors">
                  {activity.title}
                </span>
                <span className="text-xs text-secondary-foreground mt-0.5">
                  {activity.description}
                </span>
                <span className="text-[11px] text-muted-foreground mt-1 font-medium">
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
