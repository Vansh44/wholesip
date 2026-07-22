import type { TopCategory } from "../analytics/data";

// One hue, weighted by size — rank reads off the bar length, not off a colour
// the reader has to decode. (The old four-tone palette implied a
// category→colour meaning that didn't exist, and only ever covered 4 rows.)
function weightFor(amount: number, max: number): number {
  if (max <= 0 || amount <= 0) return 0.3;
  return 0.4 + 0.6 * (amount / max);
}

export function TopCategories({ items }: { items: TopCategory[] }) {
  const max = items.reduce((m, c) => Math.max(m, c.amount), 0);
  const earning = items.filter((c) => c.amount > 0).length;

  return (
    <div className="dash-card h-full">
      <div className="dash-card-header">
        <div>
          <div className="dash-card-title">Sales by category</div>
          <div className="dash-card-sub">
            {items.length === 0
              ? "By revenue share"
              : `${earning} of ${items.length} earning`}
          </div>
        </div>
      </div>
      <div className="dash-card-body">
        {items.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-[var(--dash-text-3)]">
            No categories yet — add some to see where revenue comes from.
          </div>
        ) : (
          // Every category is listed, so the list scrolls inside the card
          // rather than stretching the whole dashboard row.
          <div className="dash-cat-list">
            {items.map((cat) => (
              <div key={cat.name} className="dash-progress-row">
                <div className="dash-progress-label">
                  <span className="truncate">{cat.name}</span>
                  <span
                    className={`tabular-nums ${cat.amount > 0 ? "text-[var(--dash-text-2)]" : "text-[var(--dash-text-3)]"}`}
                  >
                    ₹{cat.amount.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="dash-progress-track">
                  <div
                    className="dash-progress-fill"
                    style={{
                      width: `${cat.share}%`,
                      background: "var(--dash-accent)",
                      opacity: weightFor(cat.amount, max),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
