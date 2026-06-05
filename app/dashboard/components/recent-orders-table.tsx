import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const orders = [
  {
    id: "#ORD-4821",
    customer: "Priya Sharma",
    date: "Jun 5, 2026",
    amount: "₹2,450",
    status: "Delivered",
    badge: "dash-badge-green",
    avatar: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  },
  {
    id: "#ORD-4820",
    customer: "Rahul Gupta",
    date: "Jun 5, 2026",
    amount: "₹890",
    status: "Shipped",
    badge: "dash-badge-amber",
    avatar: "linear-gradient(135deg, #f59e0b, #f97316)",
  },
  {
    id: "#ORD-4819",
    customer: "Anjali Mehta",
    date: "Jun 4, 2026",
    amount: "₹5,200",
    status: "Processing",
    badge: "dash-badge-blue",
    avatar: "linear-gradient(135deg, #0ea5e9, #2563eb)",
  },
  {
    id: "#ORD-4818",
    customer: "Vikram Singh",
    date: "Jun 4, 2026",
    amount: "₹1,100",
    status: "Cancelled",
    badge: "dash-badge-red",
    avatar: "linear-gradient(135deg, #f43f5e, #e11d48)",
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function RecentOrdersTable() {
  return (
    <div className="dash-card h-full overflow-hidden">
      <div className="dash-card-header">
        <div>
          <div className="dash-card-title">Recent Orders</div>
          <div className="dash-card-sub">Latest customer activity</div>
        </div>
        <Link
          href="/dashboard/orders"
          className="dash-btn dash-btn-ghost dash-btn-sm"
        >
          View all
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <table className="dash-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Order</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <div className="dash-flex-row">
                  <div
                    className="dash-user-avatar"
                    style={{ background: order.avatar }}
                  >
                    {initials(order.customer)}
                  </div>
                  <div>
                    <div className="font-medium text-[var(--dash-text)]">
                      {order.customer}
                    </div>
                    <div className="text-dim">{order.date}</div>
                  </div>
                </div>
              </td>
              <td>
                <span className="font-mono-dash text-[12.5px] text-[var(--dash-text-2)]">
                  {order.id}
                </span>
              </td>
              <td className="font-mono-dash font-medium">{order.amount}</td>
              <td>
                <span className={`dash-badge ${order.badge}`}>
                  {order.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
