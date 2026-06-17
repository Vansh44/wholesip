"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Ticket,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { deleteCoupon } from "@/app/actions/coupon-actions";
import { CouponEditorDialog } from "./coupon-editor-dialog";
import type { Coupon } from "./page";

type Props = {
  coupons: Coupon[];
  canManage?: boolean;
};

function formatDiscount(c: Coupon): string {
  return c.discount_type === "percentage"
    ? `${c.discount_value}% off`
    : `₹${c.discount_value.toLocaleString("en-IN")} off`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// A coupon is effectively unusable when disabled, past its end date, or capped.
function isExpired(c: Coupon): boolean {
  if (c.valid_until && new Date(c.valid_until).getTime() < Date.now())
    return true;
  if (c.max_uses > 0 && c.used_count >= c.max_uses) return true;
  return false;
}

export function CouponsManagementView({ coupons, canManage = true }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return coupons;
    const q = search.toLowerCase();
    return coupons.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q),
    );
  }, [coupons, search]);

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteCoupon(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Coupon deleted");
        setDeleteTarget(null);
        router.refresh();
      }
    });
  };

  const openEditor = (coupon?: Coupon) => {
    setEditing(coupon ?? null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditing(null);
  };

  const handleSaved = () => {
    closeEditor();
    router.refresh();
  };

  return (
    <div className="dash-page-enter">
      <header className="dash-page-header row">
        <div>
          <h1>Coupons</h1>
          <p>Create and manage storefront discount codes</p>
        </div>
        {canManage && (
          <button
            className="dash-btn dash-btn-primary shrink-0"
            onClick={() => openEditor()}
          >
            <Plus className="h-4 w-4" />
            New coupon
          </button>
        )}
      </header>

      <div className="dash-toolbar">
        <div className="dash-toolbar-actions ml-auto">
          <label className="dash-search-bar">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              type="text"
              placeholder="Search coupons..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card-header">
          <div>
            <div className="dash-card-title">Coupons</div>
            <div className="dash-card-sub">
              {filtered.length} {filtered.length === 1 ? "coupon" : "coupons"}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="dash-empty">
            <span className="dash-empty-icon">
              <Ticket className="h-5 w-5" />
            </span>
            <div className="dash-empty-title">
              {search ? "No coupons match your search" : "No coupons yet"}
            </div>
            <p className="dash-empty-text">
              {search
                ? "Try a different search term."
                : "Create your first discount code for the storefront."}
            </p>
            {!search && canManage && (
              <button
                className="dash-btn dash-btn-primary"
                onClick={() => openEditor()}
              >
                <Plus className="h-4 w-4" />
                New coupon
              </button>
            )}
          </div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Min order</th>
                <th>Usage</th>
                <th>Validity</th>
                <th>Status</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const expired = isExpired(c);
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="dash-cell-title mono">{c.code}</div>
                      {c.description && (
                        <div className="dash-cell-sub">{c.description}</div>
                      )}
                    </td>
                    <td>
                      <div className="dash-cell-title">{formatDiscount(c)}</div>
                    </td>
                    <td className="text-muted">
                      {c.min_order_amount > 0
                        ? `₹${c.min_order_amount.toLocaleString("en-IN")}`
                        : "—"}
                    </td>
                    <td className="text-dim font-mono-dash">
                      {c.used_count}
                      {c.max_uses > 0 ? ` / ${c.max_uses}` : " / ∞"}
                    </td>
                    <td className="text-muted">
                      {c.valid_from || c.valid_until
                        ? `${formatDate(c.valid_from)} → ${formatDate(c.valid_until)}`
                        : "Always"}
                    </td>
                    <td>
                      <span
                        className={`dash-badge ${
                          c.status === "active" && !expired
                            ? "dash-badge-green"
                            : c.status === "active" && expired
                              ? "dash-badge-amber"
                              : "dash-badge-grey"
                        }`}
                      >
                        {c.status !== "active"
                          ? "Disabled"
                          : expired
                            ? "Expired"
                            : "Active"}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="dash-row-menu">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="min-w-[180px]"
                          >
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => openEditor(c)}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              className="cursor-pointer"
                              onClick={() => setDeleteTarget(c)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete Confirmation */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete coupon</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{deleteTarget?.code}&rdquo;? Shoppers will no longer
              be able to apply this code. This can&rsquo;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CouponEditorDialog
        open={editorOpen}
        coupon={editing}
        onClose={closeEditor}
        onSaved={handleSaved}
      />
    </div>
  );
}
