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
    <div className="enterprise-card w-full flex flex-col overflow-hidden">
      <div className="p-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-primary">Recent Orders</h2>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              className="pl-9 w-[200px] h-9 bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <Filter className="h-4 w-4" /> Filter
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-border sticky top-0">
            <tr>
              <th className="px-6 py-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider">
                Order ID
              </th>
              <th className="px-6 py-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider">
                Customer
              </th>
              <th className="px-6 py-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-xs font-semibold text-secondary-foreground uppercase tracking-wider text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((order, idx) => (
              <tr
                key={idx}
                className="hover:bg-slate-50 transition-colors group"
              >
                <td className="px-6 py-4 text-sm font-medium text-primary">
                  {order.id}
                </td>
                <td className="px-6 py-4 text-sm text-secondary-foreground">
                  {order.customer}
                </td>
                <td className="px-6 py-4 text-sm text-secondary-foreground">
                  {order.product}
                </td>
                <td className="px-6 py-4 text-sm font-medium text-primary">
                  {order.amount}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusStyles(order.status)}`}
                  >
                    {order.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-secondary-foreground">
                  {order.date}
                </td>
                <td className="px-6 py-4 text-sm text-right">
                  <button className="p-1 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-slate-200 opacity-0 group-hover:opacity-100 focus:opacity-100">
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground bg-slate-50">
        <span>Showing 1 to 5 of 124 results</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
          <Button variant="outline" size="sm">
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
