const categories = [
  {
    name: "Beverages",
    amount: "₹1,48,200",
    share: 49,
    color: "var(--dash-accent)",
  },
  {
    name: "Merchandise",
    amount: "₹98,400",
    share: 33,
    color: "var(--dash-green)",
  },
  {
    name: "Bundles",
    amount: "₹67,100",
    share: 22,
    color: "var(--dash-amber)",
  },
  {
    name: "Gift Sets",
    amount: "₹34,800",
    share: 12,
    color: "var(--dash-violet)",
  },
];

export function TopCategories() {
  return (
    <div className="dash-card h-full">
      <div className="dash-card-header">
        <div>
          <div className="dash-card-title">Top Categories</div>
          <div className="dash-card-sub">By revenue share</div>
        </div>
      </div>
      <div className="dash-card-body">
        {categories.map((cat) => (
          <div key={cat.name} className="dash-progress-row">
            <div className="dash-progress-label">
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: cat.color }}
                />
                {cat.name}
              </span>
              <span>{cat.amount}</span>
            </div>
            <div className="dash-progress-track">
              <div
                className="dash-progress-fill"
                style={{ width: `${cat.share}%`, background: cat.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
