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
import {
  deleteProduct,
  toggleProductPublish,
} from "@/app/actions/product-actions";
import { ProductEditorDialog } from "./product-editor-dialog";
import { effectivePricing, formatPrice } from "@/lib/pricing";
import type { Product, CategoryOption, CardColorOption } from "./page";

type FilterTab = "all" | "published" | "drafts" | "featured";

type Props = {
  products: Product[];
  categories: CategoryOption[];
  colors: CardColorOption[];
  canManage?: boolean;
};

export function ProductsManagementView({
  products,
  categories,
  colors,
  canManage = true,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const filtered = useMemo(() => {
    let result = [...products];

    switch (filter) {
      case "published":
        result = result.filter((p) => p.status === "published");
        break;
      case "drafts":
        result = result.filter((p) => p.status === "draft");
        break;
      case "featured":
        result = result.filter((p) => p.featured);
        break;
    }

    if (categoryFilter !== "all") {
      result =
        categoryFilter === "uncategorized"
          ? result.filter((p) => !p.category_id)
          : result.filter((p) => p.category_id === categoryFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.category?.name.toLowerCase().includes(q) ?? false),
      );
    }

    return result;
  }, [products, filter, categoryFilter, search]);

  const counts = useMemo(
    () => ({
      all: products.length,
      published: products.filter((p) => p.status === "published").length,
      drafts: products.filter((p) => p.status === "draft").length,
      featured: products.filter((p) => p.featured).length,
    }),
    [products],
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteProduct(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Product deleted");
        setDeleteTarget(null);
        router.refresh();
      }
    });
  };

  const handleTogglePublish = (product: Product) => {
    startTransition(async () => {
      const publish = product.status !== "published";
      const result = await toggleProductPublish(product.id, publish);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(publish ? "Product published" : "Product unpublished");
        router.refresh();
      }
    });
  };

  // Create stays an in-list modal; editing is a shareable route
  // (/dashboard/products/[id]) so a teammate can be sent a direct link.
  const openCreate = () => setEditorOpen(true);
  const closeEditor = () => setEditorOpen(false);
  const handleSaved = () => {
    closeEditor();
    router.refresh();
  };
  const openEdit = (product: Product) =>
    router.push(`/dashboard/products/${product.id}`);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "published", label: `Published (${counts.published})` },
    { key: "drafts", label: `Drafts (${counts.drafts})` },
    { key: "featured", label: `Featured (${counts.featured})` },
  ];

  return (
    <div className="dash-page-enter">
      <header className="dash-page-header row">
        <div>
          <h1>🛍 Products</h1>
          <p>Add and manage products across your categories</p>
        </div>
        {canManage && (
          <button
            className="dash-btn dash-btn-primary shrink-0"
            onClick={openCreate}
          >
            ＋ New Product
          </button>
        )}
      </header>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div className="dash-filter-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`dash-filter-tab${filter === tab.key ? " active" : ""}`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-[7px] text-[13px] text-[var(--dash-text)] outline-none"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="uncategorized">Uncategorized</option>
          </select>

          <div className="dash-search-bar" style={{ width: 240 }}>
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
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {categories.length === 0 && (
        <div
          className="dash-card"
          style={{ padding: "14px 16px", marginBottom: 14, fontSize: 13 }}
        >
          💡 You have no categories yet. Products work without one, but{" "}
          <a
            href="/dashboard/categories"
            style={{ color: "var(--dash-accent)", fontWeight: 600 }}
          >
            create a category
          </a>{" "}
          to group them on the storefront.
        </div>
      )}

      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">
            Products
            <span
              style={{
                fontWeight: 400,
                fontSize: 12,
                marginLeft: 8,
                opacity: 0.6,
              }}
            >
              {filtered.length} {filtered.length === 1 ? "product" : "products"}
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              {search || filter !== "all" || categoryFilter !== "all"
                ? "No products match your filters"
                : "No products yet"}
            </div>
            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>
              {search || filter !== "all" || categoryFilter !== "all"
                ? "Try adjusting your filters"
                : "Add your first product to get started"}
            </div>
            {!search &&
              filter === "all" &&
              categoryFilter === "all" &&
              canManage && (
                <button
                  className="dash-btn dash-btn-primary"
                  onClick={openCreate}
                >
                  ＋ New Product
                </button>
              )}
          </div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>Image</th>
                <th>Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Variants</th>
                <th>Status</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={canManage ? () => openEdit(p) : undefined}
                  style={canManage ? { cursor: "pointer" } : undefined}
                  title={canManage ? "Edit product" : undefined}
                >
                  <td>
                    {p.image_url ? (
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
                          src={p.image_url}
                          alt={p.name}
                          fill
                          className="object-cover"
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
                        📦
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {p.name}
                      {p.featured && (
                        <span
                          title="Featured"
                          style={{ marginLeft: 6, fontSize: 12 }}
                        >
                          ⭐
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.5,
                        fontFamily: "var(--font-dash-mono), monospace",
                        marginTop: 2,
                      }}
                    >
                      /{p.slug}
                    </div>
                  </td>
                  <td className="text-muted">
                    {p.category ? (
                      <span
                        style={{
                          padding: "2px 8px",
                          background: "rgba(0,0,0,0.04)",
                          borderRadius: 4,
                          fontSize: 11,
                        }}
                      >
                        {p.category.name}
                      </span>
                    ) : (
                      <span style={{ opacity: 0.5 }}>Uncategorized</span>
                    )}
                  </td>
                  <td className="font-mono-dash" style={{ fontSize: 12 }}>
                    {(() => {
                      const pricing = effectivePricing(p);
                      return (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          {pricing.hasVariants && (
                            <span style={{ opacity: 0.6 }}>from</span>
                          )}
                          <span style={{ fontWeight: 600 }}>
                            {formatPrice(pricing.selling)}
                          </span>
                          {pricing.discount > 0 && (
                            <>
                              <span
                                style={{
                                  textDecoration: "line-through",
                                  opacity: 0.5,
                                }}
                              >
                                {formatPrice(pricing.base)}
                              </span>
                              <span
                                className="dash-badge dash-badge-green"
                                style={{ fontSize: 10, padding: "1px 6px" }}
                              >
                                -{pricing.discount}%
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="text-muted">
                    {p.variants.length > 0 ? (
                      <span
                        className="dash-badge dash-badge-grey"
                        style={{ fontSize: 10, padding: "2px 7px" }}
                      >
                        {p.variants.length}{" "}
                        {p.variants.length === 1 ? "variant" : "variants"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span
                      className={`dash-badge ${
                        p.status === "published"
                          ? "dash-badge-green"
                          : "dash-badge-amber"
                      }`}
                    >
                      {p.status === "published" ? "Published" : "Draft"}
                    </span>
                  </td>
                  {canManage && (
                    <td onClick={(ev) => ev.stopPropagation()}>
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
                            onClick={() => openEdit(p)}
                          >
                            ✏️ Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer text-[#e8ecf4] focus:bg-[#252b3d] focus:text-white"
                            onClick={() => handleTogglePublish(p)}
                            disabled={isPending}
                          >
                            {p.status === "published"
                              ? "📥 Unpublish"
                              : "🚀 Publish"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer text-[#e8ecf4] focus:bg-[#252b3d] focus:text-white"
                            onClick={() =>
                              window.open(`/pages/shop/${p.slug}`, "_blank")
                            }
                          >
                            👁 Preview
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.08)]" />
                          <DropdownMenuItem
                            className="cursor-pointer text-[#ef4444] focus:bg-[rgba(239,68,68,0.12)] focus:text-[#ef4444]"
                            onClick={() => setDeleteTarget(p)}
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
            <DialogTitle className="text-[#e8ecf4]">Delete Product</DialogTitle>
            <DialogDescription className="text-[#8b93a8]">
              Are you sure you want to delete &ldquo;{deleteTarget?.name}
              &rdquo;? This also removes its variants and cannot be undone.
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

      {editorOpen && (
        <ProductEditorDialog
          open
          product={null}
          categories={categories}
          colors={colors}
          onClose={closeEditor}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
