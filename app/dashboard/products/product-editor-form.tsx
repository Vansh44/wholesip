"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  X,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { uploadImage } from "@/lib/supabase/storage";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/ui/image-upload";
import { NumberField } from "@/components/ui/number-field";
import { slugify } from "@/lib/slug";
import {
  createProduct,
  updateProduct,
  generateProductDescription,
  generateProductSeo,
  type ProductFormData,
  type VariantFormData,
} from "@/app/actions/product-actions";
import type { Product, CategoryOption, CardColorOption } from "./page";

type Props = {
  product: Product | null;
  categories: CategoryOption[];
  colors: CardColorOption[];
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
  card_color: "",
  seo_title: "",
  seo_description: "",
  variants: [],
  track_inventory: false,
  allow_backorder: false,
  low_stock_threshold: null,
  sku: "",
};

function toForm(product: Product): ProductFormData {
  return {
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
    card_color: product.card_color ?? "",
    seo_title: product.seo_title ?? "",
    seo_description: product.seo_description ?? "",
    track_inventory: product.track_inventory,
    allow_backorder: product.allow_backorder,
    low_stock_threshold: product.low_stock_threshold,
    sku: product.sku ?? "",
    variants: (product.variants ?? []).map((v) => ({
      id: v.id, // preserve DB id for reconcile (stable variant ids)
      name: v.name,
      base_price: v.base_price,
      selling_price: v.selling_price,
      special_price: v.special_price ?? null,
      stock: v.stock,
      sku: v.sku ?? "",
      images: v.images ?? (v.image_url ? [v.image_url] : []),
    })),
  };
}

const fieldClass =
  "w-full rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#9ca3af] focus:border-[#4f46e5]";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#6b7280]";

// Per-variant gallery: a strip of 44px thumbnails plus an "add" tile.
function VariantGallery({
  images,
  onChange,
}: {
  images: string[];
  onChange: (imgs: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        uploaded.push(await uploadImage(file, { folder: "product-images" }));
      }
      onChange([...images, ...uploaded]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {images.map((url) => (
        <div
          key={url}
          className="relative h-11 w-11 overflow-hidden rounded-md border border-[#e5e7eb]"
        >
          <Image src={url} alt="" fill className="object-cover" />
          <button
            type="button"
            onClick={() => onChange(images.filter((u) => u !== url))}
            title="Remove image"
            className="absolute right-0 top-0 z-10 rounded-bl bg-black/70 p-0.5 text-white hover:bg-red-500"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <input
        type="file"
        multiple
        ref={inputRef}
        accept="image/png, image/jpeg, image/webp"
        onChange={handleFiles}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title="Add image(s) for this variant"
        className="flex h-11 w-11 items-center justify-center rounded-md border border-dashed border-[#d1d5db] bg-[#f9fafb] text-[#9ca3af] hover:border-[#4f46e5] hover:text-[#4f46e5]"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImageIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

/**
 * The product editor form body, sans Dialog chrome — reused by the editor modal
 * (product-editor-dialog.tsx) and the full-page edit route (product-edit-panel).
 * Mounts fresh each time it's shown, so form state is initialised lazily from
 * `product` (no open/reset effect needed).
 */
export function ProductEditorForm({
  product,
  categories,
  colors,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<ProductFormData>(() =>
    product ? toForm(product) : EMPTY,
  );
  const [isPending, startTransition] = useTransition();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  // Once the user edits the slug by hand we stop auto-deriving it from the name.
  const [slugTouched, setSlugTouched] = useState(!!product);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const isEditing = !!product;

  // Grow the description textarea to fit its content.
  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  const setDescriptionRef = (el: HTMLTextAreaElement | null) => {
    descriptionRef.current = el;
    if (el) requestAnimationFrame(() => autosize(el));
  };
  useEffect(() => {
    requestAnimationFrame(() => autosize(descriptionRef.current));
  }, [form.description]);

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
        {
          name: "",
          base_price: 0,
          selling_price: 0,
          special_price: null,
          stock: 0,
          sku: "",
          images: [],
        },
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
  // Move a variant up/down. Row order = sort_order on save, and the storefront
  // selects the first (top) variant by default — so this also sets the default.
  const moveVariant = (index: number, dir: -1 | 1) =>
    setForm((f) => {
      const target = index + dir;
      if (target < 0 || target >= f.variants.length) return f;
      const variants = [...f.variants];
      [variants[index], variants[target]] = [variants[target], variants[index]];
      return { ...f, variants };
    });

  // brand/brand.md (soul) + the current form fields → Gemini → description.
  const handleGenerate = async () => {
    if (!form.name.trim()) {
      toast.error("Add a product name first");
      return;
    }
    setIsGenerating(true);
    const categoryName =
      categories.find((c) => c.id === form.category_id)?.name ?? null;
    const result = await generateProductDescription({
      name: form.name,
      categoryName,
      base_price: form.base_price,
      selling_price: form.selling_price,
      variants: form.variants.map((v) => v.name).filter((n) => n.trim()),
      notes: form.description.trim() || undefined,
    });
    setIsGenerating(false);
    if (result.error) {
      toast.error(result.error);
    } else if (result.description) {
      set("description", result.description);
      toast.success("Description generated");
    }
  };

  // Same pipeline, SEO flavour: fills both SEO fields at once.
  const handleGenerateSeo = async () => {
    if (!form.name.trim()) {
      toast.error("Add a product name first");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Fill in the product description before generating SEO");
      return;
    }
    setIsGeneratingSeo(true);
    const categoryName =
      categories.find((c) => c.id === form.category_id)?.name ?? null;
    const result = await generateProductSeo({
      name: form.name,
      categoryName,
      base_price: form.base_price,
      selling_price: form.selling_price,
      variants: form.variants.map((v) => v.name).filter((n) => n.trim()),
      description: form.description.trim() || undefined,
    });
    setIsGeneratingSeo(false);
    if (result.error) {
      toast.error(result.error);
    } else if (result.seo_title && result.seo_description) {
      set("seo_title", result.seo_title);
      set("seo_description", result.seo_description);
      toast.success("SEO fields generated");
    }
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!form.category_id) {
      toast.error("Category is required");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Description is required");
      return;
    }
    if (!form.seo_title.trim() || !form.seo_description.trim()) {
      toast.error("SEO title and description are required");
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
    const badSpecial = form.variants.find(
      (v) =>
        v.special_price != null &&
        v.special_price > 0 &&
        v.base_price > 0 &&
        v.special_price > v.base_price,
    );
    if (badSpecial) {
      toast.error(
        `Variant "${badSpecial.name}" has a sale price above its base price`,
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
    <>
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
            <label className={labelClass}>Category *</label>
            <select
              className={fieldClass}
              value={form.category_id ?? ""}
              onChange={(e) => set("category_id", e.target.value || null)}
            >
              <option value="">Select a category…</option>
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
          <div className="mb-1.5 flex items-center justify-between">
            <label className={`${labelClass} mb-0`}>Description *</label>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || isPending}
              title="Generate from your brand guide with AI"
              className="flex items-center gap-1 rounded-md border border-[#c7d2fe] px-2 py-1 text-xs text-[#4f46e5] hover:bg-[#eef2ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isGenerating ? "Generating…" : "Generate with AI"}
            </button>
          </div>
          <textarea
            ref={setDescriptionRef}
            className={`${fieldClass} min-h-[88px] resize-none overflow-hidden`}
            value={form.description}
            onChange={(e) => {
              set("description", e.target.value);
              autosize(e.target);
            }}
            placeholder="Describe the product… or type rough notes and click Generate with AI"
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
            <p className="mt-1 text-[11px] text-[#9ca3af]">
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

        <label className="flex cursor-pointer items-center gap-2 text-sm text-[#1f2937]">
          <input
            type="checkbox"
            checked={form.featured}
            onChange={(e) => set("featured", e.target.checked)}
            className="h-4 w-4 accent-[#4f46e5]"
          />
          Feature this product
        </label>

        {/* Storefront card colour — pick a shade from the Colours palette */}
        <div>
          <label className={labelClass}>Card colour (storefront)</label>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-9 w-9 shrink-0 rounded-md border border-[#e5e7eb]"
              style={{ background: form.card_color || "transparent" }}
            />
            <select
              className={`${fieldClass} flex-1`}
              value={form.card_color}
              onChange={(e) => set("card_color", e.target.value)}
            >
              <option value="">Default (no colour)</option>
              {colors.map((c) => (
                <option key={c.id} value={c.hex}>
                  {c.name} — {c.hex}
                </option>
              ))}
              {/* Preserve a custom/legacy hex not in the palette */}
              {form.card_color &&
                !colors.some((c) => c.hex === form.card_color) && (
                  <option value={form.card_color}>
                    Custom — {form.card_color}
                  </option>
                )}
            </select>
          </div>
          <p className="mt-1.5 text-xs text-[#9ca3af]">
            Shades come from{" "}
            <Link href="/dashboard/colors" className="underline">
              Colours
            </Link>
            . Name &amp; price stay near-black for contrast; blank uses the
            storefront default.
          </p>
        </div>

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
                  className="relative h-16 w-16 overflow-hidden rounded-md border border-[#e5e7eb]"
                >
                  <Image
                    src={url}
                    alt="Gallery image"
                    fill
                    className="object-cover"
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

        {/* Simple Product Inventory (only shown if no variants) */}
        {form.variants.length === 0 && (
          <div className="rounded-md border border-[#e5e7eb] p-3 space-y-4 bg-gray-50/50">
            <h3 className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">
              Inventory
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>SKU</label>
                <input
                  className={fieldClass}
                  value={form.sku ?? ""}
                  onChange={(e) => set("sku", e.target.value)}
                  placeholder="e.g. ALM-500"
                />
              </div>
              <div>
                <label className={labelClass}>Stock (Simple Product)</label>
                <div className="flex items-center gap-2 text-sm">
                  {product ? (
                    <>
                      <span className="font-semibold">{product.stock}</span>
                      <span className="text-dim">in stock</span>
                      <Link
                        href={`/dashboard/inventory?q=${encodeURIComponent(product.name)}`}
                        className="ml-auto text-xs text-indigo-600 hover:underline"
                        target="_blank"
                      >
                        Manage in Inventory &rarr;
                      </Link>
                    </>
                  ) : (
                    <span className="text-dim italic">
                      Save product first to set stock.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[#1f2937]">
                <input
                  type="checkbox"
                  checked={form.track_inventory}
                  onChange={(e) => set("track_inventory", e.target.checked)}
                  className="h-4 w-4 accent-[#4f46e5]"
                />
                Track inventory
              </label>

              {form.track_inventory && (
                <div className="ml-6 space-y-3 pl-3 border-l-2 border-indigo-100">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[#1f2937]">
                    <input
                      type="checkbox"
                      checked={form.allow_backorder}
                      onChange={(e) => set("allow_backorder", e.target.checked)}
                      className="h-4 w-4 accent-[#4f46e5]"
                    />
                    Allow backorders (sell when out of stock)
                  </label>
                  <div>
                    <label className={labelClass}>
                      Low stock alert threshold
                    </label>
                    <NumberField
                      className={`${fieldClass} max-w-[120px]`}
                      value={form.low_stock_threshold ?? 0}
                      onValueChange={(n) =>
                        set("low_stock_threshold", n > 0 ? n : null)
                      }
                    />
                    <p className="mt-1 text-[11px] text-[#9ca3af]">
                      Leave 0 to use store default.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Variants */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className={`${labelClass} mb-0`}>Variants</label>
            <button
              type="button"
              onClick={addVariant}
              className="flex items-center gap-1 rounded-md border border-[#e5e7eb] px-2 py-1 text-xs text-[#374151] hover:bg-[#f3f4f6]"
            >
              <Plus className="h-3.5 w-3.5" /> Add variant
            </button>
          </div>
          <p className="mb-2 text-[11px] text-[#9ca3af]">
            Optional — e.g. sizes or flavors, each with its own price and stock.
            Leave empty for a single-price product. The top variant is selected
            by default on the product page — use the arrows to reorder.
          </p>

          {form.variants.length > 0 && (
            <div className="overflow-x-auto sm:overflow-visible">
              <div className="min-w-[500px] space-y-2 sm:min-w-0">
                <div className="grid grid-cols-[1fr_72px_72px_60px_84px_72px] gap-2 px-1 text-[10px] uppercase tracking-wide text-[#9ca3af]">
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
                    className="space-y-2 border-b border-[#f3f4f6] pb-2 last:border-b-0"
                  >
                    <div className="grid grid-cols-[1fr_72px_72px_60px_84px_72px] items-center gap-2">
                      <input
                        className={fieldClass}
                        value={v.name}
                        onChange={(e) =>
                          updateVariant(i, "name", e.target.value)
                        }
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
                        onChange={(e) =>
                          updateVariant(i, "sku", e.target.value)
                        }
                        placeholder="SKU"
                      />
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveVariant(i, -1)}
                          disabled={i === 0}
                          title={i === 0 ? "Default variant" : "Move up"}
                          className="flex h-8 w-6 items-center justify-center rounded-md text-[#6b7280] hover:bg-[#f3f4f6] disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveVariant(i, 1)}
                          disabled={i === form.variants.length - 1}
                          title="Move down"
                          className="flex h-8 w-6 items-center justify-center rounded-md text-[#6b7280] hover:bg-[#f3f4f6] disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeVariant(i)}
                          title="Remove variant"
                          className="flex h-8 w-6 items-center justify-center rounded-md text-[#6b7280] hover:bg-[rgba(239,68,68,0.12)] hover:text-[#ef4444]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-10 shrink-0 text-[10px] uppercase tracking-wide text-[#9ca3af]">
                        Imgs
                      </span>
                      <VariantGallery
                        images={v.images}
                        onChange={(imgs) => updateVariant(i, "images", imgs)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-10 shrink-0 text-[10px] uppercase tracking-wide text-[#9ca3af]"
                        title="Optional sale price for this variant"
                      >
                        Sale
                      </span>
                      <NumberField
                        className={`${fieldClass} w-24`}
                        value={v.special_price ?? 0}
                        onValueChange={(n) =>
                          updateVariant(i, "special_price", n > 0 ? n : null)
                        }
                      />
                      <span className="text-[11px] text-[#9ca3af]">
                        ₹ — leave 0 for no sale. Shows a yellow tag on the
                        variant chip when set.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* SEO — required */}
        <details open className="rounded-md border border-[#e5e7eb] p-3">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-[#6b7280]">
            SEO *
          </summary>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-[#9ca3af]">
                {form.description.trim()
                  ? "Generated from the product description above."
                  : "Fill in the description first to generate SEO."}
              </p>
              <button
                type="button"
                onClick={handleGenerateSeo}
                disabled={
                  isGeneratingSeo || isPending || !form.description.trim()
                }
                title={
                  form.description.trim()
                    ? "Generate SEO title & description from your brand guide with AI"
                    : "Add a product description first"
                }
                className="flex shrink-0 items-center gap-1 rounded-md border border-[#c7d2fe] px-2 py-1 text-xs text-[#4f46e5] hover:bg-[#eef2ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isGeneratingSeo ? "Generating…" : "Generate with AI"}
              </button>
            </div>
            <div>
              <label className={labelClass}>SEO title *</label>
              <input
                className={fieldClass}
                value={form.seo_title}
                onChange={(e) => set("seo_title", e.target.value)}
              />
              <p className="mt-1 text-[11px] text-[#9ca3af]">
                {form.seo_title.length}/60 characters
              </p>
            </div>
            <div>
              <label className={labelClass}>SEO description *</label>
              <textarea
                className={`${fieldClass} min-h-[60px] resize-y`}
                value={form.seo_description}
                onChange={(e) => set("seo_description", e.target.value)}
              />
              <p className="mt-1 text-[11px] text-[#9ca3af]">
                {form.seo_description.length}/160 characters
              </p>
            </div>
          </div>
        </details>
      </div>

      <div className="mt-1 flex justify-end gap-2 border-t border-[#e5e7eb] pt-4">
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isPending}>
          {isPending
            ? "Saving…"
            : isEditing
              ? "Save Changes"
              : "Create Product"}
        </Button>
      </div>
    </>
  );
}
