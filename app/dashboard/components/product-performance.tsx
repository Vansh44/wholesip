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
      <div className="mb-8 flex items-end justify-between border-b border-border pb-4">
        <div>
          <span className="dashboard-kicker">Merchandising</span>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-primary">
            Top Selling Products
          </h2>
        </div>
        <button className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
          View all products
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Product Name
              </th>
              <th className="pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Revenue
              </th>
              <th className="pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Units Sold
              </th>
              <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Conversion Rate
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr
                key={product.name}
                className="border-b border-border/45 transition-colors last:border-0 hover:bg-background/65"
              >
                <td className="py-4 text-sm font-semibold text-primary">
                  {product.name}
                </td>
                <td className="py-4 text-sm font-semibold text-primary">
                  {product.revenue}
                </td>
                <td className="py-4 text-sm text-secondary-foreground">
                  {product.units}
                </td>
                <td className="py-4 text-right">
                  <span className="text-sm font-semibold text-secondary-foreground">
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
