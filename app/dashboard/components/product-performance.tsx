export function ProductPerformance() {
  const products = [
    {
      name: "Premium Wireless Headphones",
      revenue: "$12,450",
      units: 415,
      conversion: "4.2%",
    },
    {
      name: "Ergonomic Office Chair",
      revenue: "$8,900",
      units: 89,
      conversion: "2.8%",
    },
    {
      name: "Mechanical Keyboard",
      revenue: "$6,240",
      units: 208,
      conversion: "5.1%",
    },
    {
      name: "USB-C Hub Multiport",
      revenue: "$4,120",
      units: 515,
      conversion: "8.4%",
    },
  ];

  return (
    <div className="w-full overflow-hidden">
      <div className="flex items-end justify-between mb-8 border-b border-border pb-3">
        <h2 className="text-lg font-semibold text-primary">
          Top Selling Products
        </h2>
        <button className="text-xs font-medium text-accent hover:underline">
          View all products
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider">
                Product Name
              </th>
              <th className="pb-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider">
                Revenue
              </th>
              <th className="pb-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider">
                Units Sold
              </th>
              <th className="pb-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider text-right">
                Conversion Rate
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product, idx) => (
              <tr
                key={idx}
                className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors"
              >
                <td className="py-3 text-sm font-medium text-primary">
                  {product.name}
                </td>
                <td className="py-3 text-sm text-primary font-semibold">
                  {product.revenue}
                </td>
                <td className="py-3 text-sm text-secondary-foreground">
                  {product.units}
                </td>
                <td className="py-3 text-right">
                  <span className="text-secondary-foreground font-medium text-sm">
                    {product.conversion}
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
