"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";
import {
  Eye,
  ImageIcon,
  Lightbulb,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Send,
  Star,
  Trash2,
  Undo2,
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

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "published", label: "Published", count: counts.published },
    { key: "drafts", label: "Drafts", count: counts.drafts },
    { key: "featured", label: "Featured", count: counts.featured },
  ];

  return (
    <div className="dash-page-enter">
      <header className="dash-page-header row">
        <div>
          <h1>Products</h1>
          <p>Add and manage products across your categories</p>
        </div>
        {canManage && (
          <button
            className="dash-btn dash-btn-primary shrink-0"
            onClick={openCreate}
          >
            <Plus className="h-4 w-4" />
            New product
          </button>
        )}
      </header>

      {/* Toolbar: Tabs + Category filter + Search */}
      <div className="dash-toolbar">
        <div className="dash-filter-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`dash-filter-tab${filter === tab.key ? " active" : ""}`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
              <span className="dash-tab-count">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="dash-toolbar-actions">
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

          <label className="dash-search-bar">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
      </div>

      {categories.length === 0 && (
        <div className="dash-card mb-3.5 flex items-center gap-2 px-4 py-3.5 text-[13px]">
          <Lightbulb className="h-4 w-4 shrink-0 text-[var(--dash-amber)]" />
          <span>
            You have no categories yet. Products work without one, but{" "}
            <a
              href="/dashboard/categories"
              className="font-semibold text-[var(--dash-accent)]"
            >
              create a category
            </a>{" "}
            to group them on the storefront.
          </span>
        </div>
      )}

      <div className="dash-card">
        <div className="dash-card-header">
          <div>
            <div className="dash-card-title">Products</div>
            <div className="dash-card-sub">
              {filtered.length} {filtered.length === 1 ? "product" : "products"}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="dash-empty">
            <span className="dash-empty-icon">
              <Package className="h-5 w-5" />
            </span>
            <div className="dash-empty-title">
              {search || filter !== "all" || categoryFilter !== "all"
                ? "No products match your filters"
                : "No products yet"}
            </div>
            <p className="dash-empty-text">
              {search || filter !== "all" || categoryFilter !== "all"
                ? "Try adjusting your filters."
                : "Add your first product to get started."}
            </p>
            {!search &&
              filter === "all" &&
              categoryFilter === "all" &&
              canManage && (
                <button
                  className="dash-btn dash-btn-primary"
                  onClick={openCreate}
                >
                  <Plus className="h-4 w-4" />
                  New product
                </button>
              )}
          </div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th className="w-14">Image</th>
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
                  className={canManage ? "cursor-pointer" : undefined}
                  title={canManage ? "Edit product" : undefined}
                >
                  <td>
                    {p.image_url ? (
                      <div className="dash-thumb">
                        <Image
                          src={p.image_url}
                          alt={p.name}
                          fill
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
                    <div className="dash-cell-title inline-flex items-center gap-1.5">
                      {p.name}
                      {p.featured && (
                        <Star
                          className="h-3.5 w-3.5 fill-[var(--dash-amber)] text-[var(--dash-amber)]"
                          aria-label="Featured"
                        />
                      )}
                    </div>
                    <div className="dash-cell-sub mono">/{p.slug}</div>
                  </td>
                  <td>
                    {p.category ? (
                      <div className="dash-chip-row">
                        <span className="dash-chip">{p.category.name}</span>
                      </div>
                    ) : (
                      <span className="text-dim">Uncategorized</span>
                    )}
                  </td>
                  <td>
                    {(() => {
                      const pricing = effectivePricing(p);
                      return (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {pricing.hasVariants && (
                            <span className="text-dim text-xs">from</span>
                          )}
                          <span className="dash-cell-title mono">
                            {formatPrice(pricing.selling)}
                          </span>
                          {pricing.discount > 0 && (
                            <>
                              <span className="dash-cell-sub mono line-through">
                                {formatPrice(pricing.base)}
                              </span>
                              <span className="dash-badge dash-badge-green">
                                -{pricing.discount}%
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    {p.variants.length > 0 ? (
                      <span className="dash-badge dash-badge-grey">
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
                            onClick={() => openEdit(p)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => handleTogglePublish(p)}
                            disabled={isPending}
                          >
                            {p.status === "published" ? (
                              <>
                                <Undo2 className="mr-2 h-4 w-4" />
                                Unpublish
                              </>
                            ) : (
                              <>
                                <Send className="mr-2 h-4 w-4" />
                                Publish
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() =>
                              window.open(`/shop/${p.slug}`, "_blank")
                            }
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Preview
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            className="cursor-pointer"
                            onClick={() => setDeleteTarget(p)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
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
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete product</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}
              &rdquo;? This also removes its variants and cannot be undone.
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
