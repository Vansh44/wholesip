"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";
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
import { deleteCategory } from "@/app/actions/category-actions";
import { CategoryEditorDialog } from "./category-editor-dialog";
import type { Category } from "./page";

type Props = {
  categories: Category[];
  canManage?: boolean;
};

export function CategoriesManagementView({
  categories,
  canManage = true,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q),
    );
  }, [categories, search]);

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteCategory(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Category deleted");
        setDeleteTarget(null);
        router.refresh();
      }
    });
  };

  const openEditor = (category?: Category) => {
    setEditing(category ?? null);
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
          <h1>🗂 Categories</h1>
          <p>Organize your storefront catalog into categories</p>
        </div>
        {canManage && (
          <button
            className="dash-btn dash-btn-primary shrink-0"
            onClick={() => openEditor()}
          >
            ＋ New Category
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
            placeholder="Search categories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">
            Categories
            <span
              style={{
                fontWeight: 400,
                fontSize: 12,
                marginLeft: 8,
                opacity: 0.6,
              }}
            >
              {filtered.length}{" "}
              {filtered.length === 1 ? "category" : "categories"}
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗂</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              {search ? "No categories match your search" : "No categories yet"}
            </div>
            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>
              {search
                ? "Try a different search term"
                : "Create your first category to start organizing products"}
            </div>
            {!search && canManage && (
              <button
                className="dash-btn dash-btn-primary"
                onClick={() => openEditor()}
              >
                ＋ New Category
              </button>
            )}
          </div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>Image</th>
                <th>Name</th>
                <th>Products</th>
                <th>Order</th>
                <th>Status</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.image_url ? (
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 6,
                          overflow: "hidden",
                          position: "relative",
                          flexShrink: 0,
                        }}
                      >
                        <Image
                          src={c.image_url}
                          alt={c.name}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 6,
                          background: "var(--dash-surface-2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 16,
                          opacity: 0.4,
                        }}
                      >
                        🗂
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {c.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.5,
                        fontFamily: "var(--font-dash-mono), monospace",
                        marginTop: 2,
                      }}
                    >
                      /{c.slug}
                    </div>
                  </td>
                  <td className="text-muted">
                    {c.product_count ?? 0}{" "}
                    {c.product_count === 1 ? "product" : "products"}
                  </td>
                  <td className="text-dim font-mono-dash">{c.sort_order}</td>
                  <td>
                    <span
                      className={`dash-badge ${
                        c.status === "active"
                          ? "dash-badge-green"
                          : "dash-badge-grey"
                      }`}
                    >
                      {c.status === "active" ? "Active" : "Hidden"}
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
            <DialogTitle className="text-[#e8ecf4]">
              Delete Category
            </DialogTitle>
            <DialogDescription className="text-[#8b93a8]">
              Delete &ldquo;{deleteTarget?.name}&rdquo;? Products in this
              category won&rsquo;t be deleted — they&rsquo;ll become
              uncategorized.
            </DialogDescription>
          </DialogHeader>
          {(deleteTarget?.product_count ?? 0) > 0 && (
            <div className="py-2">
              <p className="text-sm text-amber-400">
                ⚠️ {deleteTarget?.product_count} product
                {deleteTarget?.product_count === 1 ? "" : "s"} will become
                uncategorized.
              </p>
            </div>
          )}
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

      <CategoryEditorDialog
        open={editorOpen}
        category={editing}
        onClose={closeEditor}
        onSaved={handleSaved}
      />
    </div>
  );
}
