"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getMovements,
  type SkuRow,
  type StockMovementRow,
} from "@/app/actions/inventory-actions";
import { Loader2 } from "lucide-react";

export function InventoryHistoryDrawer({
  open,
  onOpenChange,
  sku,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sku: SkuRow;
}) {
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let mounted = true;

    async function fetchMovements() {
      setLoading(true);
      setError(null);
      const res = await getMovements(sku.productId, sku.variantId, 1);
      if (!mounted) return;
      setLoading(false);
      if (res.error) {
        setError(res.error);
      } else {
        setMovements(res.movements);
      }
    }

    fetchMovements();

    return () => {
      mounted = false;
    };
  }, [open, sku.productId, sku.variantId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Stock History</SheetTitle>
          <SheetDescription>
            {sku.name} {sku.variantName ? `(${sku.variantName})` : ""}
            <br />
            <span className="mono mt-1 inline-block">
              {sku.sku || "No SKU"}
            </span>
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-dim" />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-red-600 bg-red-50 rounded-md">
            {error}
          </div>
        ) : movements.length === 0 ? (
          <div className="text-center p-8 text-sm text-dim">
            No stock movements found.
          </div>
        ) : (
          <div className="space-y-4">
            {movements.map((m) => (
              <div
                key={m.id}
                className="text-sm border-b pb-4 last:border-0 border-[var(--dash-border)]"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold">{m.reason}</span>
                  <span
                    className={`mono font-medium ${m.delta > 0 ? "text-green-600" : m.delta < 0 ? "text-red-600" : ""}`}
                  >
                    {m.delta > 0 ? "+" : ""}
                    {m.delta}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-dim">
                  <span>
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(m.created_at))}
                  </span>
                  <span>Balance: {m.balance_after}</span>
                </div>
                {m.order_id && (
                  <div className="mt-1 text-xs text-dim">
                    Order ID:{" "}
                    <span className="mono">{m.order_id.slice(0, 8)}...</span>
                  </div>
                )}
                {m.note && (
                  <div className="mt-1 text-xs text-[var(--dash-text)] italic">
                    &quot;{m.note}&quot;
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
