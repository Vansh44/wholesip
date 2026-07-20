"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/pricing";
import { ListPagination } from "@/app/dashboard/components/list-pagination";
import type { OrderStatusCounts } from "@/app/actions/order-actions";
import type { OrderRow } from "./page";

type Props = {
  orders: OrderRow[];
  total: number;
  counts: OrderStatusCounts;
  page: number;
  pageSize: number;
  query: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
};

// Order-lifecycle tabs (the primary Shopify-style saved views). "" = All.
const STATUS_TABS: {
  key: string;
  label: string;
  countKey: keyof OrderStatusCounts;
}[] = [
  { key: "", label: "All", countKey: "all" },
  { key: "pending", label: "Pending", countKey: "pending" },
  { key: "processing", label: "Processing", countKey: "processing" },
  { key: "shipped", label: "Shipped", countKey: "shipped" },
  { key: "delivered", label: "Delivered", countKey: "delivered" },
  { key: "cancelled", label: "Cancelled", countKey: "cancelled" },
];

export function OrdersManagementView({
  orders,
  total,
  counts,
  page,
  pageSize,
  query,
  status,
  paymentStatus,
  paymentMethod,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, startNavigation] = useTransition();
  const [search, setSearch] = useState(query);

  // Build a URL with the merged facet state. Changing any facet resets to
  // page 1 (a filtered result set has its own paging).
  const hrefFor = (next: {
    q?: string;
    status?: string;
    payment?: string;
    method?: string;
    page?: number;
  }): string => {
    const q = (next.q ?? query).trim();
    const st = next.status ?? status;
    const pay = next.payment ?? paymentStatus;
    const method = next.method ?? paymentMethod;
    const changedFacet =
      next.q !== undefined ||
      next.status !== undefined ||
      next.payment !== undefined ||
      next.method !== undefined;
    const p = next.page ?? (changedFacet ? 1 : page);

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (st) params.set("status", st);
    if (pay) params.set("payment", pay);
    if (method) params.set("method", method);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const go = (next: Parameters<typeof hrefFor>[0]) =>
    startNavigation(() => router.push(hrefFor(next)));

  // Debounce free-text search into the URL (server re-queries).
  useEffect(() => {
    if (search.trim() === query.trim()) return;
    const handle = setTimeout(() => {
      startNavigation(() => router.push(hrefFor({ q: search })));
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = Boolean(query || status || paymentStatus || paymentMethod);

  return (
    <div className="dash-page-enter">
      <header className="dash-page-header row">
        <div>
          <h1>Orders</h1>
          <p>View and manage all customer orders</p>
        </div>
      </header>

      <div className="dash-card flex flex-col" style={{ flex: "1 1 auto" }}>
        {/* Toolbar: status tabs + payment facets + search */}
        <div className="dash-toolbar px-5 pt-4 pb-2 border-b border-[var(--dash-border)] mb-0 flex flex-col gap-4">
          <div className="dash-filter-tabs">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key || "all"}
                className={`dash-filter-tab${status === tab.key ? " active" : ""}`}
                onClick={() => go({ status: tab.key })}
              >
                {tab.label}
                <span className="dash-tab-count">{counts[tab.countKey]}</span>
              </button>
            ))}
          </div>

          <div className="dash-toolbar-actions w-full flex justify-between">
            <div className="flex items-center gap-2">
              <select
                value={paymentStatus}
                onChange={(e) => go({ payment: e.target.value })}
                className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-[7px] text-[13px] text-[var(--dash-text)] outline-none"
                aria-label="Filter by payment status"
              >
                <option value="">All payments</option>
                <option value="paid">Paid</option>
                <option value="pending">Payment pending</option>
                <option value="failed">Payment failed</option>
              </select>
              <select
                value={paymentMethod}
                onChange={(e) => go({ method: e.target.value })}
                className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-[7px] text-[13px] text-[var(--dash-text)] outline-none"
                aria-label="Filter by payment method"
              >
                <option value="">All methods</option>
                <option value="cash_on_delivery">COD</option>
                <option value="razorpay">Online (Razorpay)</option>
              </select>
            </div>

            <label className="dash-search-bar">
              <Search className="h-4 w-4 shrink-0 opacity-50" />
              <input
                type="text"
                placeholder="Search orders…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="dash-empty">
            <span className="dash-empty-icon">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <div className="dash-empty-title">
              {hasFilters ? "No orders match your filters" : "No orders yet"}
            </div>
            <p className="dash-empty-text">
              {hasFilters
                ? "Try adjusting your filters."
                : "No orders have been placed yet."}
            </p>
          </div>
        ) : (
          <table className="dash-table dash-table-wide">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer Info</th>
                <th>Date</th>
                <th className="text-right">Total</th>
                <th className="text-center">Payment</th>
                <th className="text-center">Status</th>
                <th className="text-right">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const customerName =
                  `${order.shipping_address?.firstName || ""} ${order.shipping_address?.lastName || ""}`.trim();

                return (
                  <tr key={order.id}>
                    <td
                      className="font-mono text-sm font-semibold text-gray-900"
                      title={order.id}
                    >
                      {order.order_ref}
                    </td>
                    <td>
                      <div className="font-medium text-gray-900">
                        {customerName || "Unknown"}
                      </div>
                      <div className="text-xs">
                        {order.shipping_address?.city},{" "}
                        {order.shipping_address?.state}
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {new Date(order.created_at).toLocaleString()}
                    </td>
                    <td className="text-right font-medium text-gray-900">
                      {formatPrice(order.total)}
                    </td>
                    <td className="text-center">
                      <Badge
                        variant={
                          order.payment_status === "paid"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {order.payment_method === "cash_on_delivery"
                          ? "COD"
                          : order.payment_method}
                        ({order.payment_status})
                      </Badge>
                    </td>
                    <td className="text-center">
                      <Badge
                        variant={
                          order.status === "delivered"
                            ? "default"
                            : order.status === "cancelled"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {order.status}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/dashboard/orders/${order.id}/invoice`}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <ListPagination
          page={page}
          total={total}
          pageSize={pageSize}
          busy={navigating}
          onPage={(p) => go({ page: p })}
        />
      </div>
    </div>
  );
}
