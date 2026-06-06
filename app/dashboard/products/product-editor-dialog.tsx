/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { X, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/ui/image-upload";
import { NumberField } from "@/components/ui/number-field";
import { slugify } from "@/lib/slug";
import {
  createProduct,
  updateProduct,
  type ProductFormData,
  type VariantFormData,
} from "@/app/actions/product-actions";
import type { Product, CategoryOption } from "./page";

type Props = {
  open: boolean;
  product: Product | null;
  categories: CategoryOption[];
  onClose: () => void;
  onSaved: () => void;
};

const EMPTY: ProductFormData = {
  name: "",
  slug: "",
  description: "",
  category_id: null,
  base_price: 0,
  selling_price: 0,
  image_url: "",
  images: [],
  status: "draft",
  featured: false,
  sort_order: 0,
  seo_title: "",
  seo_description: "",
  variants: [],
};

const fieldClass =
  "w-full rounded-md border border-[rgba(255,255,255,0.1)] bg-[#0e1118] px-3 py-2 text-sm text-[#e8ecf4] outline-none placeholder:text-[#5b6478] focus:border-[#6366f1]";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#8b93a8]";

export function ProductEditorDialog({
  open,
  product,
  categories,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<ProductFormData>(EMPTY);
  const [isPending, startTransition] = useTransition();
  // Once the user edits the slug by hand we stop auto-deriving it from the name.
  const [slugTouched, setSlugTouched] = useState(false);
  const isEditing = !!product;

  useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        name: product.name,
        slug: product.slug,
        description: product.description ?? "",
        category_id: product.category_id,
        base_price: product.base_price,
        selling_price: product.selling_price,
        image_url: product.image_url ?? "",
        images: product.images ?? [],
        status: product.status,
        featured: product.featured,
        sort_order: product.sort_order,
        seo_title: product.seo_title ?? "",
        seo_description: product.seo_description ?? "",
        variants: (product.variants ?? []).map((v) => ({
          name: v.name,
          base_price: v.base_price,
          selling_price: v.selling_price,
          stock: v.stock,
          sku: v.sku ?? "",
        })),
      });
      setSlugTouched(true); // keep the existing slug stable while editing
    } else {
      setForm(EMPTY);
      setSlugTouched(false);
    }
  }, [open, product]);

  const set = <K extends keyof ProductFormData>(
    key: K,
    value: ProductFormData[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  // Typing the name fills the slug live until the user overrides it.
  const handleNameChange = (value: string) =>
    setForm((f) => ({
      ...f,
      name: value,
      slug: slugTouched ? f.slug : slugify(value),
    }));

  const handleSlugChange = (value: string) => {
    setSlugTouched(value.trim() !== "");
    set("slug", value);
  };

  // ── Gallery helpers ────────────────────────────────────────
  const addGalleryImage = (url: string) => {
    if (!url) return;
    setForm((f) =>
      f.images.includes(url) ? f : { ...f, images: [...f.images, url] },
    );
  };
  const removeGalleryImage = (url: string) =>
    setForm((f) => ({ ...f, images: f.images.filter((u) => u !== url) }));

  // ── Variant helpers ────────────────────────────────────────
  const addVariant = () =>
    setForm((f) => ({
      ...f,
      variants: [
        ...f.variants,
        { name: "", base_price: 0, selling_price: 0, stock: 0, sku: "" },
      ],
    }));
  const updateVariant = <K extends keyof VariantFormData>(
    index: number,
    key: K,
    value: VariantFormData[K],
  ) =>
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, i) =>
        i === index ? { ...v, [key]: value } : v,
      ),
    }));
  const removeVariant = (index: number) =>
    setForm((f) => ({
      ...f,
      variants: f.variants.filter((_, i) => i !== index),
    }));

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const badVariant = form.variants.find((v) => !v.name.trim());
    if (badVariant) {
      toast.error("Each variant needs a name (or remove the empty row)");
      return;
    }
    if (form.selling_price > 0 && form.selling_price > form.base_price) {
      toast.error("Selling price can't be higher than the base price");
      return;
    }
    const badPrice = form.variants.find(
      (v) => v.selling_price > 0 && v.selling_price > v.base_price,
    );
    if (badPrice) {
      toast.error(
        `Variant "${badPrice.name}" has a selling price above its base price`,
      );
      return;
    }
    startTransition(async () => {
      const result = isEditing
        ? await updateProduct(product!.id, form)
        : await createProduct(form);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isEditing ? "Product updated" : "Product created");
        onSaved();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-[rgba(255,255,255,0.08)] bg-[#141720] text-[#e8ecf4] shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-[#e8ecf4]">
            {isEditing ? "Edit Product" : "New Product"}
          </DialogTitle>
          <DialogDescription className="text-[#8b93a8]">
            Fill in the details below. Drafts stay hidden from the storefront.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Basics */}
          <div>
            <label className={labelClass}>Name *</label>
            <input
              className={fieldClass}
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Almond Milk 500ml"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Slug</label>
              <input
                className={fieldClass}
                value={form.slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="auto from name"
              />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <select
                className={fieldClass}
                value={form.category_id ?? ""}
                onChange={(e) => set("category_id", e.target.value || null)}
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.status === "hidden" ? " (hidden)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              className={`${fieldClass} min-h-[88px] resize-y`}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Describe the product…"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Base price ₹ (MRP)</label>
              <NumberField
                className={fieldClass}
                value={form.base_price}
                onValueChange={(n) => set("base_price", n)}
              />
            </div>
            <div>
              <label className={labelClass}>Selling price ₹</label>
              <NumberField
                className={fieldClass}
                value={form.selling_price}
                onValueChange={(n) => set("selling_price", n)}
              />
              <p className="mt-1 text-[11px] text-[#5b6478]">
                Leave 0 to sell at base price. Must be ≤ base price.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Sort order</label>
              <NumberField
                className={fieldClass}
                value={form.sort_order}
                onValueChange={(n) => set("sort_order", n)}
                allowDecimal={false}
              />
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                className={fieldClass}
                value={form.status}
                onChange={(e) =>
                  set("status", e.target.value as "draft" | "published")
                }
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#e8ecf4]">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => set("featured", e.target.checked)}
              className="h-4 w-4 accent-[#6366f1]"
            />
            Feature this product
          </label>

          {/* Primary image */}
          <div>
            <label className={labelClass}>Primary image</label>
            <ImageUpload
              folder="product-images"
              defaultImage={form.image_url || undefined}
              onUploadSuccess={(url) => set("image_url", url)}
            />
          </div>

          {/* Gallery */}
          <div>
            <label className={labelClass}>Gallery (extra images)</label>
            {form.images.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {form.images.map((url) => (
                  <div
                    key={url}
                    className="relative h-16 w-16 overflow-hidden rounded-md border border-[rgba(255,255,255,0.1)]"
                  >
                    <Image
                      src={url}
                      alt="Gallery image"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={() => removeGalleryImage(url)}
                      className="absolute right-0.5 top-0.5 rounded bg-black/70 p-0.5 text-white hover:bg-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <ImageUpload
              folder="product-images"
              onUploadSuccess={addGalleryImage}
            />
          </div>

          {/* Variants */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className={`${labelClass} mb-0`}>Variants</label>
              <button
                type="button"
                onClick={addVariant}
                className="flex items-center gap-1 rounded-md border border-[rgba(255,255,255,0.12)] px-2 py-1 text-xs text-[#c7cdda] hover:bg-[#1a1f2e]"
              >
                <Plus className="h-3.5 w-3.5" /> Add variant
              </button>
            </div>
            <p className="mb-2 text-[11px] text-[#5b6478]">
              Optional — e.g. sizes or flavors, each with its own price and
              stock. Leave empty for a single-price product.
            </p>

            {form.variants.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_72px_72px_60px_84px_28px] gap-2 px-1 text-[10px] uppercase tracking-wide text-[#5b6478]">
                  <span>Name</span>
                  <span>Base ₹</span>
                  <span>Sell ₹</span>
                  <span>Stock</span>
                  <span>SKU</span>
                  <span />
                </div>
                {form.variants.map((v, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_72px_72px_60px_84px_28px] items-center gap-2"
                  >
                    <input
                      className={fieldClass}
                      value={v.name}
                      onChange={(e) => updateVariant(i, "name", e.target.value)}
                      placeholder="500ml"
                    />
                    <NumberField
                      className={fieldClass}
                      value={v.base_price}
                      onValueChange={(n) => updateVariant(i, "base_price", n)}
                    />
                    <NumberField
                      className={fieldClass}
                      value={v.selling_price}
                      onValueChange={(n) =>
                        updateVariant(i, "selling_price", n)
                      }
                    />
                    <NumberField
                      className={fieldClass}
                      value={v.stock}
                      onValueChange={(n) => updateVariant(i, "stock", n)}
                      allowDecimal={false}
                    />
                    <input
                      className={fieldClass}
                      value={v.sku}
                      onChange={(e) => updateVariant(i, "sku", e.target.value)}
                      placeholder="SKU"
                    />
                    <button
                      type="button"
                      onClick={() => removeVariant(i)}
                      className="flex h-8 w-7 items-center justify-center rounded-md text-[#8b93a8] hover:bg-[rgba(239,68,68,0.12)] hover:text-[#ef4444]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SEO */}
          <details className="rounded-md border border-[rgba(255,255,255,0.08)] p-3">
            <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-[#8b93a8]">
              SEO (optional)
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className={labelClass}>SEO title</label>
                <input
                  className={fieldClass}
                  value={form.seo_title}
                  onChange={(e) => set("seo_title", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>SEO description</label>
                <textarea
                  className={`${fieldClass} min-h-[60px] resize-y`}
                  value={form.seo_description}
                  onChange={(e) => set("seo_description", e.target.value)}
                />
              </div>
            </div>
          </details>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className="border-[rgba(255,255,255,0.08)] bg-transparent text-[#e8ecf4] hover:bg-[#1a1f2e]"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending
              ? "Saving…"
              : isEditing
                ? "Save Changes"
                : "Create Product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
