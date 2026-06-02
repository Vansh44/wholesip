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
      <div className="mb-8 flex items-end justify-between border-b border-border pb-4">
        <div>
          <span className="dashboard-kicker">Stock Control</span>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-primary">
            Inventory Health
          </h2>
        </div>
        <button className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
          Manage Inventory
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Product
              </th>
              <th className="pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Current Stock
              </th>
              <th className="pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Threshold
              </th>
              <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((item) => (
              <tr
                key={item.name}
                className={`border-b border-border/40 transition-colors last:border-0 ${item.status === "Critical" ? "bg-error/5 hover:bg-error/10" : "hover:bg-background/65"}`}
              >
                <td className="flex items-center gap-2 py-4 text-sm font-semibold text-primary">
                  {item.status === "Critical" && (
                    <span className="h-2 w-2 rounded-full bg-error"></span>
                  )}
                  {item.name}
                </td>
                <td
                  className={`py-4 text-sm font-semibold ${item.status === "Critical" ? "text-error" : "text-primary"}`}
                >
                  {item.stock}
                </td>
                <td className="py-4 text-sm text-secondary-foreground">
                  {item.threshold}
                </td>
                <td className="py-4 text-right">
                  <span
                    className={`border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${getStatusStyles(item.status)}`}
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
