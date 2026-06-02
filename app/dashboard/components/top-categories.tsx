export function TopCategories() {
  const categories = [
    {
      name: "Beverages",
      amount: "₹1,48,200",
      width: "72%",
      color: "var(--dash-accent)",
    },
    {
      name: "Merchandise",
      amount: "₹98,400",
      width: "48%",
      color: "var(--dash-green)",
    },
    {
      name: "Bundles",
      amount: "₹67,100",
      width: "33%",
      color: "var(--dash-amber)",
    },
    {
      name: "Gift Sets",
      amount: "₹34,800",
      width: "17%",
      color: "var(--dash-accent-2)",
    },
  ];

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
              <span>{cat.name}</span>
              <span>{cat.amount}</span>
            </div>
            <div className="dash-progress-track">
              <div
                className="dash-progress-fill"
                style={{ width: cat.width, background: cat.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
