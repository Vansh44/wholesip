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
import { deleteCardColor } from "@/app/actions/color-actions";
import { ColorEditorDialog } from "./color-editor-dialog";
import type { CardColor } from "./page";

type Props = {
  colors: CardColor[];
  canManage?: boolean;
};

export function ColorsManagementView({ colors, canManage = true }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CardColor | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CardColor | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return colors;
    const q = search.toLowerCase();
    return colors.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.hex.toLowerCase().includes(q),
    );
  }, [colors, search]);

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteCardColor(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Colour deleted");
        setDeleteTarget(null);
        router.refresh();
      }
    });
  };

  const openEditor = (color?: CardColor) => {
    setEditing(color ?? null);
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
          <h1>🎨 Colours</h1>
          <p>Palette of background shades for storefront product cards</p>
        </div>
        {canManage && (
          <button
            className="dash-btn dash-btn-primary shrink-0"
            onClick={() => openEditor()}
          >
            ＋ New Colour
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
            placeholder="Search colours…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">
            Colours
            <span
              style={{
                fontWeight: 400,
                fontSize: 12,
                marginLeft: 8,
                opacity: 0.6,
              }}
            >
              {filtered.length} {filtered.length === 1 ? "colour" : "colours"}
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎨</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              {search ? "No colours match your search" : "No colours yet"}
            </div>
            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>
              {search
                ? "Try a different search term"
                : "Add your first shade to use as a product card background"}
            </div>
            {!search && canManage && (
              <button
                className="dash-btn dash-btn-primary"
                onClick={() => openEditor()}
              >
                ＋ New Colour
              </button>
            )}
          </div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>Swatch</th>
                <th>Name</th>
                <th>Hex</th>
                <th>Used by</th>
                <th>Order</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        background: c.hex,
                        border: "1px solid rgba(255,255,255,0.12)",
                        flexShrink: 0,
                      }}
                    />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {c.name}
                    </div>
                  </td>
                  <td>
                    <span
                      className="font-mono-dash"
                      style={{ fontSize: 12, opacity: 0.8 }}
                    >
                      {c.hex}
                    </span>
                  </td>
                  <td className="text-muted">
                    {c.product_count ?? 0}{" "}
                    {c.product_count === 1 ? "product" : "products"}
                  </td>
                  <td className="text-dim font-mono-dash">{c.sort_order}</td>
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
              ))}
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
            <DialogTitle className="text-[#e8ecf4]">Delete Colour</DialogTitle>
            <DialogDescription className="text-[#8b93a8]">
              Delete &ldquo;{deleteTarget?.name}&rdquo;? Products already using
              this shade keep their colour — it&rsquo;s just removed from the
              dropdown.
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

      <ColorEditorDialog
        open={editorOpen}
        color={editing}
        onClose={closeEditor}
        onSaved={handleSaved}
      />
    </div>
  );
}
