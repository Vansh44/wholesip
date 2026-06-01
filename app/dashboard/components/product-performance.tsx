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
    <div className="enterprise-card p-6 w-full overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-primary">
          Top Selling Products
        </h2>
        <button className="text-sm font-medium text-accent hover:underline">
          View all products
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-3 text-sm font-semibold text-secondary-foreground uppercase tracking-wider">
                Product Name
              </th>
              <th className="pb-3 text-sm font-semibold text-secondary-foreground uppercase tracking-wider">
                Revenue
              </th>
              <th className="pb-3 text-sm font-semibold text-secondary-foreground uppercase tracking-wider">
                Units Sold
              </th>
              <th className="pb-3 text-sm font-semibold text-secondary-foreground uppercase tracking-wider text-right">
                Conversion Rate
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product, idx) => (
              <tr
                key={idx}
                className="border-b border-border/50 last:border-0 hover:bg-slate-50 transition-colors"
              >
                <td className="py-4 font-medium text-primary">
                  {product.name}
                </td>
                <td className="py-4 text-primary font-semibold">
                  {product.revenue}
                </td>
                <td className="py-4 text-secondary-foreground">
                  {product.units}
                </td>
                <td className="py-4 text-right">
                  <span className="bg-slate-100 text-secondary-foreground px-2 py-1 rounded font-medium text-sm">
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
