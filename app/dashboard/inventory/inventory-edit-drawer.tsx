"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImageIcon, History, Minus, Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import type { SkuRow } from "@/app/actions/inventory-actions";

// Quick, right-side inventory editor. Opened by clicking a product row — set the
// stock level (or nudge it with the ± buttons) and save, or jump to the full
// movement history. Optimistic save + close is handled by the parent's onSave.
export function InventoryEditDrawer({
  open,
  onOpenChange,
  sku,
  onSave,
  onViewHistory,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sku: SkuRow | null;
  onSave: (sku: SkuRow, newStock: number, reason: string) => void;
  onViewHistory: (sku: SkuRow) => void;
  isPending: boolean;
}) {
  const router = useRouter();
  // The parent remounts this drawer for each opened SKU, so seeding the input
  // from the current stock at mount is enough — no syncing effect needed.
  const [value, setValue] = useState(sku?.stock ?? 0);

  if (!sku) return null;

  const tracked = sku.trackInventory;
  const changed = value !== sku.stock;
  const nudge = (delta: number) => setValue((v) => Math.max(0, v + delta));

  const statusBadge = !tracked ? (
    <span className="dash-badge dash-badge-grey">Untracked</span>
  ) : sku.status === "in" ? (
    <span className="dash-badge dash-badge-green">In stock</span>
  ) : sku.status === "low" ? (
    <span className="dash-badge dash-badge-amber">Low stock</span>
  ) : (
    <span className="dash-badge dash-badge-red bg-red-100 text-red-600 dark:bg-red-900/30">
      Out of stock
    </span>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-5">
          <SheetTitle>Manage stock</SheetTitle>
          <SheetDescription>
            Set the stock level or adjust it, then save.
          </SheetDescription>
        </SheetHeader>

        {/* Product summary */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
            {sku.image ? (
              <Image
                src={sku.image}
                alt={sku.name}
                fill
                sizes="56px"
                className="object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageIcon className="h-5 w-5" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">
              {sku.name}
            </div>
            {sku.variantName && (
              <div className="truncate text-xs text-muted-foreground">
                {sku.variantName}
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-2">
              {statusBadge}
              {sku.sku && (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-muted-foreground">
                  {sku.sku}
                </span>
              )}
            </div>
          </div>
        </div>

        {tracked ? (
          <div className="mt-6 space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Stock level
              </label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => nudge(-1)}
                  disabled={value <= 0}
                  aria-label="Decrease by 1"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <NumberField
                  value={value}
                  onValueChange={setValue}
                  allowDecimal={false}
                  className="w-full text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => nudge(1)}
                  aria-label="Increase by 1"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {/* Quick nudges */}
              <div className="mt-2 flex flex-wrap gap-2">
                {[-10, -5, +5, +10, +50].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => nudge(d)}
                    className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
                  >
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
              {changed && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Current: <span className="font-semibold">{sku.stock}</span> →
                  new: <span className="font-semibold">{value}</span>
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => onSave(sku, value, "Set stock manually")}
                disabled={isPending || !changed}
              >
                {isPending ? "Saving…" : "Save stock"}
              </Button>
              <Button
                variant="outline"
                onClick={() => onViewHistory(sku)}
                disabled={isPending}
              >
                <History className="mr-1.5 h-4 w-4" />
                History
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center">
              <p className="text-sm font-medium text-foreground">
                Inventory isn&apos;t tracked for this product.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Turn on &ldquo;Track inventory&rdquo; in the product editor to
                set stock levels.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() =>
                  router.push(`/dashboard/products/${sku.productId}`)
                }
              >
                Open product editor
              </Button>
              <Button variant="outline" onClick={() => onViewHistory(sku)}>
                <History className="mr-1.5 h-4 w-4" />
                History
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
