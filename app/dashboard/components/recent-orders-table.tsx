import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { RecentOrder } from "../analytics/data";

const STATUS_BADGE: Record<string, string> = {
  delivered: "dash-badge-green",
  shipped: "dash-badge-amber",
  processing: "dash-badge-blue",
  pending: "dash-badge-blue",
  cancelled: "dash-badge-red",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function RecentOrdersTable({ orders }: { orders: RecentOrder[] }) {
  return (
    <div className="dash-card h-full overflow-hidden">
      <div className="dash-card-header">
        <div>
          <div className="dash-card-title">Recent orders</div>
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
      {orders.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-[var(--dash-text-3)]">
          No orders yet — new orders will show up here.
        </div>
      ) : (
        <table className="dash-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.ref}>
                <td>
                  <span className="font-mono-dash text-[12.5px] font-medium text-[var(--dash-text)]">
                    {order.ref}
                  </span>
                </td>
                <td className="text-[var(--dash-text-2)]">{order.name}</td>
                <td className="text-[var(--dash-text-3)]">
                  {fmtDate(order.createdAt)}
                </td>
                <td className="font-medium tabular-nums">
                  ₹{order.total.toLocaleString("en-IN")}
                </td>
                <td>
                  <span
                    className={`dash-badge ${STATUS_BADGE[order.status] ?? "dash-badge-blue"}`}
                  >
                    {titleCase(order.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
