"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
          <h1>🏷 Coupons</h1>
          <p>Create and manage storefront discount codes</p>
        </div>
        {canManage && (
          <button
            className="dash-btn dash-btn-primary shrink-0"
            onClick={() => openEditor()}
          >
            ＋ New Coupon
          </button>
        )}
      </header>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div className="dash-search-bar" style={{ width: 260 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.5, flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search coupons…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">
            Coupons
            <span
              style={{
                fontWeight: 400,
                fontSize: 12,
                marginLeft: 8,
                opacity: 0.6,
              }}
            >
              {filtered.length} {filtered.length === 1 ? "coupon" : "coupons"}
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏷</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              {search ? "No coupons match your search" : "No coupons yet"}
            </div>
            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>
              {search
                ? "Try a different search term"
                : "Create your first discount code for the storefront"}
            </div>
            {!search && canManage && (
              <button
                className="dash-btn dash-btn-primary"
                onClick={() => openEditor()}
              >
                ＋ New Coupon
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
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          fontFamily: "var(--font-dash-mono), monospace",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {c.code}
                      </div>
                      {c.description && (
                        <div
                          style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}
                        >
                          {c.description}
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>
                      {formatDiscount(c)}
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
                    <td className="text-muted" style={{ fontSize: 12 }}>
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
                          <DropdownMenuTrigger className="dash-btn dash-btn-ghost dash-btn-sm">
                            Actions
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="min-w-[160px] border-[rgba(255,255,255,0.08)] bg-[#1a1f2e] text-[#e8ecf4] shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
                          >
                            <DropdownMenuItem
                              className="cursor-pointer text-[#e8ecf4] focus:bg-[#252b3d] focus:text-white"
                              onClick={() => openEditor(c)}
                            >
                              ✏️ Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.08)]" />
                            <DropdownMenuItem
                              className="cursor-pointer text-[#ef4444] focus:bg-[rgba(239,68,68,0.12)] focus:text-[#ef4444]"
                              onClick={() => setDeleteTarget(c)}
                            >
                              🗑 Delete
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
        <DialogContent className="border-[rgba(255,255,255,0.08)] bg-[#141720] text-[#e8ecf4] shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-[#e8ecf4]">Delete Coupon</DialogTitle>
            <DialogDescription className="text-[#8b93a8]">
              Delete &ldquo;{deleteTarget?.code}&rdquo;? Shoppers will no longer
              be able to apply this code. This can&rsquo;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isPending}
              className="border-[rgba(255,255,255,0.08)] bg-transparent text-[#e8ecf4] hover:bg-[#1a1f2e]"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting…" : "Delete"}
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
