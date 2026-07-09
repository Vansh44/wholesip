"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";
import { ImageIcon, History, Search, PackageMinus, Edit2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import {
  bulkAdjust,
  setStock,
  type SkuRow,
  type InventoryFilter,
} from "@/app/actions/inventory-actions";
import { inventoryStatus } from "@/lib/inventory/status";
import { useRowSelection } from "@/app/dashboard/lib/use-row-selection";
import {
  BulkActionBar,
  RowCheckbox,
  SelectAllCheckbox,
} from "@/app/dashboard/components/bulk-actions";
import { ListPagination } from "@/app/dashboard/components/list-pagination";
import { InventoryHistoryDrawer } from "./inventory-history-drawer";

type Props = {
  rows: SkuRow[];
  total: number;
  categories: { id: string; name: string }[];
  canManage?: boolean;
  page: number;
  pageSize: number;
  query: string;
  filter: InventoryFilter;
  categoryFilter: string;
  storeLowStockThreshold: number;
};

export function InventoryManagementView({
  rows: initialRows,
  total,
  categories,
  canManage = true,
  page,
  pageSize,
  query,
  filter,
  categoryFilter,
  storeLowStockThreshold,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [navigating, startNavigation] = useTransition();
  const [search, setSearch] = useState(query);

  // Local optimistic state for rows
  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const [activeHistory, setActiveHistory] = useState<SkuRow | null>(null);

  // Modals state
  const [adjustModal, setAdjustModal] = useState<{
    row: SkuRow | null;
    type: "set" | "restock";
  }>({ row: null, type: "set" });
  const [adjustValue, setAdjustValue] = useState<number>(0);

  const hrefFor = (next: {
    q?: string;
    filter?: InventoryFilter;
    category?: string;
    page?: number;
  }): string => {
    const q = (next.q ?? query).trim();
    const f = next.filter ?? filter;
    const cat = next.category ?? categoryFilter;
    const changedFacet =
      next.q !== undefined ||
      next.filter !== undefined ||
      next.category !== undefined;
    const p = next.page ?? (changedFacet ? 1 : page);

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (f !== "all") params.set("filter", f);
    if (cat !== "all") params.set("category", cat);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const go = (next: Parameters<typeof hrefFor>[0]) =>
    startNavigation(() => router.push(hrefFor(next)));

  useEffect(() => {
    if (search.trim() === query.trim()) return;
    const handle = setTimeout(() => {
      startNavigation(() => router.push(hrefFor({ q: search })));
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Bulk selection
  const visibleIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const selection = useRowSelection(visibleIds);

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkValue, setBulkValue] = useState<number>(0);

  // Optimistic status for a row at a hypothetical stock level — uses the SAME
  // resolver as the server (getInventory) so the optimistic pill matches what a
  // refresh will show, including the store-wide default threshold fallback.
  const optimisticStatus = (r: SkuRow, newStock: number): SkuRow["status"] =>
    inventoryStatus(
      {
        track_inventory: r.trackInventory,
        stock: newStock,
        low_stock_threshold: r.lowStockThreshold,
        allow_backorder: r.allowBackorder,
      },
      storeLowStockThreshold,
    );

  const handleAdjustSubmit = () => {
    const target = adjustModal.row;
    if (!target) return;

    const val = adjustValue;
    const isSet = adjustModal.type === "set";

    startTransition(async () => {
      // Optimistic
      setRows((prev) =>
        prev.map((r) => {
          if (r.id === target.id) {
            const newStock = isSet ? val : r.stock + val;
            return {
              ...r,
              stock: newStock,
              status: optimisticStatus(r, newStock),
            };
          }
          return r;
        }),
      );
      setAdjustModal({ row: null, type: "set" });

      const res = await setStock(
        target.productId,
        target.variantId,
        isSet ? val : target.stock + val,
        isSet ? "Set stock manually" : "Restock",
      );

      if (res.error) {
        toast.error(res.error);
        setRows(initialRows); // revert
      } else {
        toast.success("Stock updated");
        router.refresh();
      }
    });
  };

  const handleBulkSubmit = () => {
    const val = bulkValue;
    const items = rows
      .filter((r) => selection.isSelected(r.id))
      .map((r) => ({
        productId: r.productId,
        variantId: r.variantId || undefined,
        set: val,
      }));

    startTransition(async () => {
      // Optimistic
      setRows((prev) =>
        prev.map((r) => {
          if (selection.isSelected(r.id)) {
            return {
              ...r,
              stock: val,
              status: optimisticStatus(r, val),
            };
          }
          return r;
        }),
      );
      setBulkModalOpen(false);
      selection.clear();

      const res = await bulkAdjust(items);
      if (res.error) {
        toast.error(res.error);
        setRows(initialRows);
      } else {
        toast.success(`Updated ${items.length} items`);
        router.refresh();
      }
    });
  };

  const tabs: { key: InventoryFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "low", label: "Low Stock" },
    { key: "out", label: "Out of Stock" },
  ];

  return (
    <div className="dash-page-enter">
      <header className="dash-page-header row">
        <div>
          <h1>Inventory</h1>
          <p>Track and manage product stock levels</p>
        </div>
      </header>

      <div className="dash-toolbar">
        <div className="dash-filter-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`dash-filter-tab${filter === tab.key ? " active" : ""}`}
              onClick={() => go({ filter: tab.key })}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="dash-toolbar-actions">
          <select
            value={categoryFilter}
            onChange={(e) => go({ category: e.target.value })}
            className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-[7px] text-[13px] text-[var(--dash-text)] outline-none"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <label className="dash-search-bar">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              type="text"
              placeholder="Search SKUs or products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card-header">
          <div>
            <div className="dash-card-title">Stock</div>
            <div className="dash-card-sub">
              {total} {total === 1 ? "item" : "items"}
              {navigating ? " · updating…" : ""}
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="dash-empty">
            <span className="dash-empty-icon">
              <PackageMinus className="h-5 w-5" />
            </span>
            <div className="dash-empty-title">No inventory found</div>
            <p className="dash-empty-text">
              Try adjusting your filters or search query.
            </p>
          </div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                {canManage && (
                  <th className="dash-checkbox-cell">
                    <SelectAllCheckbox
                      checked={selection.allSelected}
                      indeterminate={selection.someSelected}
                      onChange={selection.toggleAll}
                    />
                  </th>
                )}
                <th className="w-14">Image</th>
                <th>Product / Variant</th>
                <th>SKU</th>
                <th>Status</th>
                <th>Stock</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`${selection.isSelected(r.id) ? " is-selected" : ""} ${r.status === "low" ? "bg-amber-50/50 dark:bg-amber-900/10" : ""}`}
                >
                  {canManage && (
                    <td className="dash-checkbox-cell">
                      <RowCheckbox
                        checked={selection.isSelected(r.id)}
                        onToggle={() => selection.toggle(r.id)}
                        label={`Select ${r.name}`}
                      />
                    </td>
                  )}
                  <td>
                    {r.image ? (
                      <div className="dash-thumb">
                        <Image
                          src={r.image}
                          alt={r.name}
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="dash-thumb dash-thumb-empty">
                        <ImageIcon className="h-4 w-4" />
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="dash-cell-title">{r.name}</div>
                    {r.variantName && (
                      <div className="dash-cell-sub">{r.variantName}</div>
                    )}
                  </td>
                  <td>
                    {r.sku ? (
                      <span className="dash-cell-title mono">{r.sku}</span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td>
                    {!r.trackInventory ? (
                      <span className="dash-badge dash-badge-grey">
                        Untracked
                      </span>
                    ) : r.status === "in" ? (
                      <span className="dash-badge dash-badge-green">
                        In stock
                      </span>
                    ) : r.status === "low" ? (
                      <span className="dash-badge dash-badge-amber">
                        Low stock
                      </span>
                    ) : (
                      <span className="dash-badge dash-badge-red text-red-600 bg-red-100 dark:bg-red-900/30">
                        Out of stock
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      {!r.trackInventory ? (
                        <span className="text-2xl text-dim">∞</span>
                      ) : (
                        <span className="dash-cell-title mono">{r.stock}</span>
                      )}
                    </div>
                  </td>
                  {canManage && (
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="dash-btn dash-btn-ghost h-8 px-2 text-xs">
                          <Edit2 className="h-3.5 w-3.5 mr-1" />
                          Update
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={!r.trackInventory}
                            onClick={() => {
                              setAdjustValue(r.stock);
                              setAdjustModal({ row: r, type: "set" });
                            }}
                          >
                            Set stock...
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!r.trackInventory}
                            onClick={() => {
                              setAdjustValue(0);
                              setAdjustModal({ row: r, type: "restock" });
                            }}
                          >
                            Adjust stock...
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setActiveHistory(r)}>
                            <History className="mr-2 h-4 w-4" />
                            View history
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  )}
                </tr>
              ))}
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

      {canManage && (
        <BulkActionBar
          count={selection.count}
          onClear={selection.clear}
          busy={isPending}
        >
          <button
            type="button"
            className="dash-bulk-btn"
            disabled={isPending}
            onClick={() => {
              setBulkValue(0);
              setBulkModalOpen(true);
            }}
          >
            <Edit2 className="h-4 w-4" />
            Set Stock
          </button>
        </BulkActionBar>
      )}

      {/* Adjust Modal */}
      <Dialog
        open={adjustModal.row !== null}
        onOpenChange={(open) =>
          !open && setAdjustModal({ row: null, type: "set" })
        }
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {adjustModal.type === "set" ? "Set stock" : "Adjust stock"} for{" "}
              {adjustModal.row?.name}
              {adjustModal.row?.variantName
                ? ` (${adjustModal.row.variantName})`
                : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {adjustModal.type === "set"
                  ? "New stock level"
                  : "Adjustment amount (+ or -)"}
              </label>
              <NumberField
                value={adjustValue}
                onValueChange={setAdjustValue}
                className="w-full"
              />
            </div>
            {adjustModal.type === "restock" && (
              <p className="text-sm text-dim">
                Current stock: {adjustModal.row?.stock}. New stock will be{" "}
                {Math.max(0, (adjustModal.row?.stock || 0) + adjustValue)}.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAdjustModal({ row: null, type: "set" })}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleAdjustSubmit} disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Modal */}
      <Dialog
        open={bulkModalOpen}
        onOpenChange={(open) => !open && setBulkModalOpen(false)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Set stock for {selection.count} items</DialogTitle>
            <DialogDescription>
              This will overwrite the stock level for all selected tracked
              items.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">New stock level</label>
              <NumberField
                value={bulkValue}
                onValueChange={setBulkValue}
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkModalOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleBulkSubmit} disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeHistory && (
        <InventoryHistoryDrawer
          open={!!activeHistory}
          onOpenChange={(open) => !open && setActiveHistory(null)}
          sku={activeHistory}
        />
      )}
    </div>
  );
}
