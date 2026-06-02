import { MoreHorizontal, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function RecentOrdersTable() {
  const orders = [
    {
      id: "ORD-4092",
      customer: "Sarah Jenkins",
      product: "Ergonomic Office Chair",
      amount: "$249.00",
      status: "Completed",
      date: "Today, 10:42 AM",
    },
    {
      id: "ORD-4091",
      customer: "Michael Chen",
      product: "Premium Wireless Headphones",
      amount: "$349.99",
      status: "Processing",
      date: "Today, 09:15 AM",
    },
    {
      id: "ORD-4090",
      customer: "Emily Davis",
      product: "Mechanical Keyboard",
      amount: "$129.50",
      status: "Completed",
      date: "Yesterday",
    },
    {
      id: "ORD-4089",
      customer: "Robert Wilson",
      product: "USB-C Hub Multiport",
      amount: "$45.00",
      status: "Refunded",
      date: "Yesterday",
    },
    {
      id: "ORD-4088",
      customer: "Jessica Taylor",
      product: "Laptop Stand Aluminum",
      amount: "$59.99",
      status: "Completed",
      date: "Oct 24, 2023",
    },
  ];

  const getStatusStyles = (status: string) => {
    switch (status) {
      case "Completed":
        return "bg-success/10 text-success border-success/20";
      case "Processing":
        return "bg-accent/10 text-accent border-accent/20";
      case "Refunded":
        return "bg-secondary text-secondary-foreground border-border";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="w-full flex flex-col overflow-hidden">
      <div className="flex flex-col justify-between gap-4 border-b border-border py-4 sm:flex-row sm:items-center">
        <div>
          <span className="dashboard-kicker">Order Stream</span>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-primary">
            Recent Orders
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              className="h-9 w-[220px] border-border/80 bg-background/70 pl-9 text-xs focus-visible:ring-2"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 border-border/80 bg-background/70 px-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
          >
            <Filter className="h-3.5 w-3.5" /> Filter
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="border-b border-border sticky top-0">
            <tr>
              <th className="py-3 pr-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Order ID
              </th>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Customer
              </th>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Product
              </th>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Amount
              </th>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Status
              </th>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Date
              </th>
              <th className="py-3 pl-5 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {orders.map((order, idx) => (
              <tr
                key={idx}
                className="group transition-colors hover:bg-background/65"
              >
                <td className="py-4 pr-5 text-xs font-semibold text-primary">
                  {order.id}
                </td>
                <td className="px-5 py-4 text-xs text-secondary-foreground">
                  {order.customer}
                </td>
                <td className="px-5 py-4 text-xs text-secondary-foreground">
                  {order.product}
                </td>
                <td className="px-5 py-4 text-xs font-semibold text-primary">
                  {order.amount}
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getStatusStyles(order.status)}`}
                  >
                    {order.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-xs text-secondary-foreground">
                  {order.date}
                </td>
                <td className="py-4 pl-5 text-right">
                  <button className="flex h-8 w-8 items-center justify-center border border-transparent text-muted-foreground opacity-0 transition-colors group-hover:opacity-100 hover:border-border hover:bg-background hover:text-primary focus:opacity-100">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border py-4 text-xs text-muted-foreground">
        <span>Showing 1 to 5 of 124 results</span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-border/80 bg-background/70 px-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
            disabled
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-border/80 bg-background/70 px-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
