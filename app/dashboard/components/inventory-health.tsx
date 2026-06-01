export function InventoryHealth() {
  const inventory = [
    {
      name: "Smart Watch Series 5",
      stock: 8,
      threshold: 20,
      status: "Critical",
    },
    { name: "Wireless Earbuds", stock: 15, threshold: 50, status: "Low Stock" },
    {
      name: "Laptop Stand Aluminum",
      stock: 142,
      threshold: 30,
      status: "Healthy",
    },
    {
      name: "Noise Cancelling Headphones",
      stock: 5,
      threshold: 15,
      status: "Critical",
    },
  ];

  const getStatusStyles = (status: string) => {
    switch (status) {
      case "Critical":
        return "bg-error/10 text-error border-error/20";
      case "Low Stock":
        return "bg-warning/10 text-warning border-warning/20";
      case "Healthy":
      default:
        return "bg-success/10 text-success border-success/20";
    }
  };

  return (
    <div className="w-full overflow-hidden">
      <div className="flex items-end justify-between mb-8 border-b border-border pb-3">
        <h2 className="text-lg font-semibold text-primary">Inventory Health</h2>
        <button className="text-xs font-medium text-accent hover:underline">
          Manage Inventory
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider">
                Product
              </th>
              <th className="pb-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider">
                Current Stock
              </th>
              <th className="pb-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider">
                Threshold
              </th>
              <th className="pb-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider text-right">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((item, idx) => (
              <tr
                key={idx}
                className={`border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors ${item.status === "Critical" ? "bg-error/5 hover:bg-error/10" : ""}`}
              >
                <td className="py-3 text-sm font-medium text-primary flex items-center gap-2">
                  {item.status === "Critical" && (
                    <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
                  )}
                  {item.name}
                </td>
                <td
                  className={`py-3 text-sm font-semibold ${item.status === "Critical" ? "text-error" : "text-primary"}`}
                >
                  {item.stock}
                </td>
                <td className="py-3 text-sm text-secondary-foreground">
                  {item.threshold}
                </td>
                <td className="py-3 text-right">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${getStatusStyles(item.status)}`}
                  >
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
