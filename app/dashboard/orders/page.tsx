import { getOrders } from "@/app/actions/order-actions";
import { formatPrice } from "@/lib/pricing";
import { Badge } from "@/components/ui/badge";

export default async function OrdersPage() {
  const { orders, error } = await getOrders();

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Error loading orders: {error}
        </div>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Orders</h1>
        <div className="bg-white border rounded-lg p-12 text-center text-gray-500">
          No orders have been placed yet.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-8">Orders</h1>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b text-gray-700">
            <tr>
              <th className="px-6 py-4 font-medium">Order ID</th>
              <th className="px-6 py-4 font-medium">Customer Info</th>
              <th className="px-6 py-4 font-medium">Date</th>
              <th className="px-6 py-4 font-medium text-right">Total</th>
              <th className="px-6 py-4 font-medium text-center">Payment</th>
              <th className="px-6 py-4 font-medium text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y text-gray-600">
            {orders.map((order) => {
              const customerName =
                `${order.shipping_address?.firstName || ""} ${order.shipping_address?.lastName || ""}`.trim();

              return (
                <tr key={order.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4 font-mono text-xs">{order.id}</td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">
                      {customerName || "Unknown"}
                    </div>
                    <div className="text-xs">
                      {order.shipping_address?.city},{" "}
                      {order.shipping_address?.state}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs">
                    {new Date(order.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-gray-900">
                    {formatPrice(order.total)}
                  </td>
                  <td className="px-6 py-4 text-center">
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
                  <td className="px-6 py-4 text-center">
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
