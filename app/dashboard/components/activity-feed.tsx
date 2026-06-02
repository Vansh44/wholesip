const activities = [
  {
    color: "var(--dash-green)",
    text: (
      <>
        <strong>New order</strong> placed by Priya Sharma
      </>
    ),
    time: "2 min ago",
  },
  {
    color: "var(--dash-accent)",
    text: (
      <>
        <strong>Blog post</strong> &quot;Summer Sale Tips&quot; published
      </>
    ),
    time: "18 min ago",
  },
  {
    color: "var(--dash-amber)",
    text: (
      <>
        <strong>Low stock</strong> alert: Almond Soak (4 left)
      </>
    ),
    time: "1 hr ago",
  },
  {
    color: "var(--dash-accent-2)",
    text: (
      <>
        <strong>New customer</strong> Suresh K. registered
      </>
    ),
    time: "3 hr ago",
  },
  {
    color: "var(--dash-red)",
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
        <div className="dash-card-title">Recent Activity</div>
      </div>
      <div className="px-5 py-3">
        {activities.map((item, i) => (
          <div key={i} className="dash-activity-item">
            <div
              className="dash-activity-dot"
              style={{ background: item.color }}
            />
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
