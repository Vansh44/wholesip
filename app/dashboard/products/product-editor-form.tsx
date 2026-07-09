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
  Package,
  Tag,
  Boxes,
  Layers,
  Eye,
  Search,
  type LucideIcon,
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
  // Store default for NEW simple products (inventory.simpleTrackDefault). Only
  // seeds the initial checkbox when creating; ignored when editing an existing
  // product (its own value wins).
  defaultTrackInventory?: boolean;
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
  "w-full rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-[#9ca3af] focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/15";
const labelClass = "mb-1.5 block text-[13px] font-medium text-[#374151]";
const hintClass = "mt-1 text-[11px] leading-relaxed text-[#9ca3af]";
const aiButtonClass =
  "flex shrink-0 items-center gap-1 rounded-md border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-2.5 py-1 text-xs font-medium text-[#4f46e5] hover:from-indigo-100 hover:to-violet-100 disabled:cursor-not-allowed disabled:opacity-50";

// Per-section colour themes — a tinted card + a matching icon badge give each
// group its own identity so the editor reads as a colourful, scannable page
// rather than a wall of white. Kept subtle (light washes) so field text and the
// white inputs stay crisp on top.
type Tint =
  | "indigo"
  | "violet"
  | "emerald"
  | "amber"
  | "sky"
  | "slate"
  | "teal";
const TINTS: Record<Tint, { card: string; badge: string }> = {
  indigo: {
    card: "border-indigo-100 bg-indigo-50/40",
    badge: "bg-indigo-100 text-indigo-600",
  },
  violet: {
    card: "border-violet-100 bg-violet-50/40",
    badge: "bg-violet-100 text-violet-600",
  },
  emerald: {
    card: "border-emerald-100 bg-emerald-50/40",
    badge: "bg-emerald-100 text-emerald-600",
  },
  amber: {
    card: "border-amber-100 bg-amber-50/40",
    badge: "bg-amber-100 text-amber-600",
  },
  sky: {
    card: "border-sky-100 bg-sky-50/40",
    badge: "bg-sky-100 text-sky-600",
  },
  slate: {
    card: "border-slate-200 bg-slate-50",
    badge: "bg-slate-200 text-slate-600",
  },
  teal: {
    card: "border-teal-100 bg-teal-50/40",
    badge: "bg-teal-100 text-teal-600",
  },
};

// A titled, described, colour-tinted panel — the building block of the editor.
function Section({
  title,
  description,
  icon: Icon,
  tint,
  aside,
  children,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  tint: Tint;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = TINTS[tint];
  return (
    <section className={`rounded-xl border ${t.card} p-4 shadow-sm sm:p-5`}>
      <div className="mb-4 flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.badge}`}
          aria-hidden
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[#111827]">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-[#6b7280]">
              {description}
            </p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

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
  defaultTrackInventory = false,
}: Props) {
  const [form, setForm] = useState<ProductFormData>(() =>
    product
      ? toForm(product)
      : { ...EMPTY, track_inventory: defaultTrackInventory },
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

  const selectedCategory = categories.find((c) => c.id === form.category_id);
  const discountPct =
    form.base_price > 0 &&
    form.selling_price > 0 &&
    form.selling_price < form.base_price
      ? Math.round(
          ((form.base_price - form.selling_price) / form.base_price) * 100,
        )
      : 0;

  return (
    <>
      <div className="space-y-4 py-2">
        {/* Product details */}
        <Section
          title="Product details"
          description="The name, description, and storefront link your customers see."
          icon={Package}
          tint="indigo"
        >
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Name *</label>
              <input
                className={fieldClass}
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Almond Milk 500ml"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>URL handle (slug)</label>
                <input
                  className={fieldClass}
                  value={form.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="auto from name"
                />
                <p className={hintClass}>
                  Lives at{" "}
                  <span className="font-mono">/shop/{form.slug || "…"}</span>
                </p>
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
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className={`${labelClass} mb-0`}>Description *</label>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating || isPending}
                  title="Generate from your brand guide with AI"
                  className={aiButtonClass}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isGenerating ? "Generating…" : "Generate with AI"}
                </button>
              </div>
              <textarea
                ref={setDescriptionRef}
                className={`${fieldClass} min-h-[96px] resize-none overflow-hidden`}
                value={form.description}
                onChange={(e) => {
                  set("description", e.target.value);
                  autosize(e.target);
                }}
                placeholder="Describe the product… or type rough notes and click Generate with AI"
              />
              <p className={hintClass}>
                Written in your brand voice. Shown on the product page.
              </p>
            </div>
          </div>
        </Section>

        {/* Media */}
        <Section
          title="Media"
          description="Add photos so customers can see what they are buying. The primary image is the storefront thumbnail."
          icon={ImageIcon}
          tint="violet"
        >
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Primary image</label>
              <ImageUpload
                folder="product-images"
                defaultImage={form.image_url || undefined}
                onUploadSuccess={(url) => set("image_url", url)}
              />
            </div>

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
          </div>
        </Section>

        {/* Pricing */}
        <Section
          title="Pricing"
          description="Set the list price (MRP) and what customers actually pay."
          icon={Tag}
          tint="emerald"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <p className={hintClass}>
                Leave 0 to sell at base price. Must be ≤ base price.
                {discountPct > 0 ? (
                  <span className="ml-1 font-medium text-[#15a34a]">
                    {discountPct}% off
                  </span>
                ) : null}
              </p>
            </div>
          </div>
        </Section>

        {/* Inventory — simple product (only shown when there are no variants) */}
        {form.variants.length === 0 && (
          <Section
            title="Inventory"
            description="Track stock levels and manage the auto-generated SKU."
            icon={Boxes}
            tint="amber"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>SKU</label>
                  <input
                    className={`${fieldClass} cursor-not-allowed bg-[#f3f4f6] font-mono text-[#6b7280]`}
                    value={form.sku || "Auto-generated on save"}
                    readOnly
                    title="SKUs are generated automatically and cannot be edited"
                  />
                  <p className={hintClass}>Auto-generated &amp; locked.</p>
                </div>
                <div>
                  <label className={labelClass}>Stock</label>
                  <div className="flex min-h-[38px] items-center gap-2 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 text-sm">
                    {product ? (
                      <>
                        <span className="font-semibold text-[#111827]">
                          {product.stock}
                        </span>
                        <span className="text-[#6b7280]">in stock</span>
                        <Link
                          href={`/dashboard/inventory?q=${encodeURIComponent(product.name)}`}
                          className="ml-auto text-xs font-medium text-[#4f46e5] hover:underline"
                          target="_blank"
                        >
                          Manage →
                        </Link>
                      </>
                    ) : (
                      <span className="italic text-[#9ca3af]">
                        Save product first to set stock.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-[#1f2937]">
                <input
                  type="checkbox"
                  checked={form.track_inventory}
                  onChange={(e) => set("track_inventory", e.target.checked)}
                  className="h-4 w-4 accent-[#4f46e5]"
                />
                Track quantity for this product
              </label>

              {form.track_inventory && (
                <div className="ml-6 space-y-3 border-l-2 border-[#e0e7ff] pl-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[#1f2937]">
                    <input
                      type="checkbox"
                      checked={form.allow_backorder}
                      onChange={(e) => set("allow_backorder", e.target.checked)}
                      className="h-4 w-4 accent-[#4f46e5]"
                    />
                    Continue selling when out of stock (backorder)
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
                    <p className={hintClass}>
                      Warn when stock drops to this level. Leave 0 to use the
                      store default.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Variants */}
        <Section
          title="Variants"
          description="Options like size or flavour — each with its own price, stock, and auto-generated SKU. Leave empty for a single-price product."
          icon={Layers}
          tint="sky"
          aside={
            <button
              type="button"
              onClick={addVariant}
              className="flex items-center gap-1 rounded-md border border-[#d1d5db] bg-white px-2.5 py-1 text-xs font-medium text-[#374151] hover:bg-[#f3f4f6]"
            >
              <Plus className="h-3.5 w-3.5" /> Add variant
            </button>
          }
        >
          {form.variants.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#d1d5db] bg-[#f9fafb] px-4 py-6 text-center text-xs text-[#9ca3af]">
              No variants yet. This is a single-price product — add variants
              only if it comes in multiple options.
            </p>
          ) : (
            <div className="overflow-x-auto sm:overflow-visible">
              <div className="min-w-[500px] space-y-2 sm:min-w-0">
                <div className="grid grid-cols-[1fr_72px_72px_60px_110px_72px] gap-2 px-1 text-[10px] uppercase tracking-wide text-[#9ca3af]">
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
                    className="space-y-2 rounded-lg border border-[#f3f4f6] bg-[#fafafa] p-2"
                  >
                    <div className="grid grid-cols-[1fr_72px_72px_60px_110px_72px] items-center gap-2">
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
                        className={`${fieldClass} cursor-not-allowed bg-[#f3f4f6] font-mono text-[11px] text-[#6b7280]`}
                        value={v.sku || "on save"}
                        readOnly
                        title="Auto-generated on save"
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
                <p className={hintClass}>
                  The top variant is selected by default on the product page —
                  use the arrows to reorder.
                </p>
              </div>
            </div>
          )}
        </Section>

        {/* Organization & visibility */}
        <Section
          title="Organization & visibility"
          description="Publishing state, storefront placement, and card styling."
          icon={Eye}
          tint="slate"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Status</label>
                <select
                  className={fieldClass}
                  value={form.status}
                  onChange={(e) =>
                    set("status", e.target.value as "draft" | "published")
                  }
                >
                  <option value="draft">Draft — hidden from storefront</option>
                  <option value="published">Published — live</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Sort order</label>
                <NumberField
                  className={fieldClass}
                  value={form.sort_order}
                  onValueChange={(n) => set("sort_order", n)}
                  allowDecimal={false}
                />
                <p className={hintClass}>Lower numbers appear first.</p>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#1f2937]">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => set("featured", e.target.checked)}
                className="h-4 w-4 accent-[#4f46e5]"
              />
              Feature this product on the homepage
            </label>

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
              <p className={hintClass}>
                Shades come from{" "}
                <Link href="/dashboard/colors" className="underline">
                  Colours
                </Link>
                . Name &amp; price stay near-black for contrast; blank uses the
                storefront default.
              </p>
            </div>
          </div>
        </Section>

        {/* Search engine listing (SEO) */}
        <Section
          title="Search engine listing"
          description="Control how this product appears in Google and when shared."
          icon={Search}
          tint="teal"
          aside={
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
              className={aiButtonClass}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isGeneratingSeo ? "Generating…" : "Generate with AI"}
            </button>
          }
        >
          <div className="space-y-4">
            {/* Live Google-style preview */}
            <div className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3.5">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[#9ca3af]">
                Search preview
              </p>
              <div className="truncate text-[15px] leading-snug text-[#1a0dab]">
                {form.seo_title || form.name || "Product title"}
              </div>
              <div className="mt-0.5 truncate text-xs text-[#006621]">
                yourstore.com › shop › {form.slug || "product"}
              </div>
              <div className="mt-1 line-clamp-2 text-[13px] leading-snug text-[#4d5156]">
                {form.seo_description ||
                  "Your meta description appears here — a compelling summary encourages clicks from search results."}
              </div>
            </div>

            <div>
              <label className={labelClass}>SEO title *</label>
              <input
                className={fieldClass}
                value={form.seo_title}
                onChange={(e) => set("seo_title", e.target.value)}
                placeholder={form.name || "Product title | Store"}
              />
              <p className={hintClass}>
                {form.seo_title.length}/60 characters ·{" "}
                {form.description.trim()
                  ? "Tip: lead with the product name."
                  : "Fill in the description above to generate this with AI."}
              </p>
            </div>
            <div>
              <label className={labelClass}>SEO description *</label>
              <textarea
                className={`${fieldClass} min-h-[64px] resize-y`}
                value={form.seo_description}
                onChange={(e) => set("seo_description", e.target.value)}
                placeholder="One or two calm sentences describing the product."
              />
              <p className={hintClass}>
                {form.seo_description.length}/160 characters
              </p>
            </div>
          </div>
        </Section>
      </div>

      <div className="sticky bottom-0 -mx-1 mt-2 flex items-center justify-between gap-2 border-t border-[#e5e7eb] bg-white px-1 py-3">
        <span className="hidden text-xs text-[#9ca3af] sm:inline">
          {selectedCategory
            ? `In ${selectedCategory.name}`
            : "Pick a category to publish"}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending
              ? "Saving…"
              : isEditing
                ? "Save changes"
                : "Create product"}
          </Button>
        </div>
      </div>
    </>
  );
}
