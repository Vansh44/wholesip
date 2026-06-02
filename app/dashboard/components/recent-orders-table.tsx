import Link from "next/link";

const orders = [
  {
    id: "#ORD-4821",
    customer: "Priya Sharma",
    amount: "₹2,450",
    status: "Delivered",
    badge: "dash-badge-green",
  },
  {
    id: "#ORD-4820",
    customer: "Rahul Gupta",
    amount: "₹890",
    status: "Shipped",
    badge: "dash-badge-amber",
  },
  {
    id: "#ORD-4819",
    customer: "Anjali Mehta",
    amount: "₹5,200",
    status: "Processing",
    badge: "dash-badge-blue",
  },
  {
    id: "#ORD-4818",
    customer: "Vikram Singh",
    amount: "₹1,100",
    status: "Cancelled",
    badge: "dash-badge-red",
  },
];

export function RecentOrdersTable() {
  return (
    <div className="dash-card overflow-hidden">
      <div className="dash-card-header">
        <div className="dash-card-title">Recent Orders</div>
        <Link
          href="/dashboard/orders"
          className="dash-btn dash-btn-ghost dash-btn-sm"
        >
          View all
        </Link>
      </div>
      <table className="dash-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <span className="font-mono-dash text-[12px]">{order.id}</span>
              </td>
              <td>{order.customer}</td>
              <td className="font-medium">{order.amount}</td>
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
