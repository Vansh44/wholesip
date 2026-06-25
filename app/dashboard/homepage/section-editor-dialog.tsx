/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, X, Plus } from "lucide-react";
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
import { createSection, updateSection } from "@/app/actions/homepage-actions";
import {
  EMPTY_CONFIG,
  SECTION_TYPE_META,
  type AnySectionConfig,
  type FeaturedProductsConfig,
  type HomepageSection,
  type HomepageSectionType,
  type LatestBlogsConfig,
  type PromoBannerConfig,
  type ShopByCategoryConfig,
} from "@/lib/homepage/section-types";
import type { BlogOption, CategoryOption, ProductOption } from "./page";

const fieldClass =
  "border-input bg-background focus:border-primary placeholder:text-muted-foreground w-full rounded-md border px-3 py-2 text-sm outline-none";
const labelClass =
  "text-muted-foreground mb-1.5 block text-xs font-medium uppercase tracking-wide";

type Props = {
  open: boolean;
  section: HomepageSection | null; // edit mode
  createType: HomepageSectionType | null; // create mode
  products: ProductOption[];
  categories: CategoryOption[];
  blogs: BlogOption[];
  onClose: () => void;
  onSaved: () => void;
};

// ---------------------------------------------------------------------------
// Small reusable: an ordered list of chosen ids with up/down/remove + an
// "add" dropdown of the remaining options. Used for manual products and
// selected categories.
// ---------------------------------------------------------------------------
function OrderedPicker({
  selectedIds,
  options,
  onChange,
  addLabel,
}: {
  selectedIds: string[];
  options: { id: string; name: string }[];
  onChange: (ids: string[]) => void;
  addLabel: string;
}) {
  const byId = new Map(options.map((o) => [o.id, o]));
  const remaining = options.filter((o) => !selectedIds.includes(o.id));

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {selectedIds.length > 0 && (
        <div className="space-y-1.5">
          {selectedIds.map((id, i) => (
            <div
              key={id}
              className="bg-background flex items-center gap-2 rounded-md border px-2 py-1.5"
            >
              <span className="flex-1 truncate text-sm">
                {byId.get(id)?.name ?? (
                  <span className="text-[var(--dash-red)]">
                    (missing — {id.slice(0, 8)}...)
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                title="Move up"
                className="text-muted-foreground hover:bg-muted flex h-7 w-6 items-center justify-center rounded disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === selectedIds.length - 1}
                title="Move down"
                className="text-muted-foreground hover:bg-muted flex h-7 w-6 items-center justify-center rounded disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onChange(selectedIds.filter((x) => x !== id))}
                title="Remove"
                className="text-muted-foreground hover:text-[var(--dash-red)] flex h-7 w-6 items-center justify-center rounded hover:bg-[var(--dash-red-soft)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {remaining.length > 0 && (
        <div className="flex items-center gap-2">
          <Plus className="text-muted-foreground h-3.5 w-3.5" />
          <select
            className={fieldClass}
            value=""
            onChange={(e) => {
              if (e.target.value) onChange([...selectedIds, e.target.value]);
            }}
          >
            <option value="">{addLabel}</option>
            {remaining.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export function SectionEditorDialog({
  open,
  section,
  createType,
  products,
  categories,
  blogs,
  onClose,
  onSaved,
}: Props) {
  const isEditing = !!section;
  const type: HomepageSectionType | null = section?.type ?? createType;

  const [config, setConfig] = useState<AnySectionConfig | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !type) return;
    if (section) {
      setConfig(section.config);
    } else {
      // structuredClone keeps the EMPTY_CONFIG template pristine.
      setConfig(structuredClone(EMPTY_CONFIG[type]));
    }
  }, [open, section, type]);

  if (!type || !config) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-[560px]" />
      </Dialog>
    );
  }

  const meta = SECTION_TYPE_META[type];

  const handleSave = () => {
    startTransition(async () => {
      const result = isEditing
        ? await updateSection(section!.id, config)
        : await createSection(type, config);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isEditing ? "Section updated" : "Section added");
        onSaved();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit" : "New"} · {meta.label}
          </DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {type === "featured_products" && (
            <FeaturedFields
              config={config as FeaturedProductsConfig}
              setConfig={setConfig}
              products={products}
              categories={categories}
            />
          )}
          {type === "shop_by_category" && (
            <CategoryFields
              config={config as ShopByCategoryConfig}
              setConfig={setConfig}
              categories={categories}
            />
          )}
          {type === "promo_banner" && (
            <BannerFields
              config={config as PromoBannerConfig}
              setConfig={setConfig}
            />
          )}
          {type === "latest_blogs" && (
            <BlogFields
              config={config as LatestBlogsConfig}
              setConfig={setConfig}
              blogs={blogs}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending
              ? "Saving..."
              : isEditing
                ? "Save Changes"
                : "Add Section"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Per-type field groups. Each takes its typed config + a setter.
// ---------------------------------------------------------------------------

function FeaturedFields({
  config,
  setConfig,
  products,
  categories,
}: {
  config: FeaturedProductsConfig;
  setConfig: (c: AnySectionConfig) => void;
  products: ProductOption[];
  categories: CategoryOption[];
}) {
  const set = <K extends keyof FeaturedProductsConfig>(
    key: K,
    value: FeaturedProductsConfig[K],
  ) => setConfig({ ...config, [key]: value });

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Heading</label>
          <input
            className={fieldClass}
            value={config.heading}
            onChange={(e) => set("heading", e.target.value)}
            placeholder="Bestsellers"
          />
        </div>
        <div>
          <label className={labelClass}>Subheading</label>
          <input
            className={fieldClass}
            value={config.subheading}
            onChange={(e) => set("subheading", e.target.value)}
            placeholder="(optional)"
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Which products?</label>
        <select
          className={fieldClass}
          value={config.source}
          onChange={(e) =>
            set("source", e.target.value as FeaturedProductsConfig["source"])
          }
        >
          <option value="featured">Featured products (auto)</option>
          <option value="manual">Hand-picked</option>
          <option value="category">All from a category</option>
        </select>
      </div>

      {config.source === "manual" && (
        <div>
          <label className={labelClass}>Products (in display order)</label>
          <OrderedPicker
            selectedIds={config.product_ids}
            options={products.map((p) => ({ id: p.id, name: p.name }))}
            onChange={(ids) => set("product_ids", ids)}
            addLabel="Add a product..."
          />
        </div>
      )}

      {config.source === "category" && (
        <div>
          <label className={labelClass}>Category</label>
          <select
            className={fieldClass}
            value={config.category_id ?? ""}
            onChange={(e) => set("category_id", e.target.value || null)}
          >
            <option value="">Select a category...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {config.source !== "manual" && (
        <div className="max-w-[160px]">
          <label className={labelClass}>Max products</label>
          <NumberField
            className={fieldClass}
            value={config.limit}
            onValueChange={(n) => set("limit", n)}
            allowDecimal={false}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">1–12.</p>
        </div>
      )}
    </>
  );
}

function CategoryFields({
  config,
  setConfig,
  categories,
}: {
  config: ShopByCategoryConfig;
  setConfig: (c: AnySectionConfig) => void;
  categories: CategoryOption[];
}) {
  const set = <K extends keyof ShopByCategoryConfig>(
    key: K,
    value: ShopByCategoryConfig[K],
  ) => setConfig({ ...config, [key]: value });

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Heading</label>
          <input
            className={fieldClass}
            value={config.heading}
            onChange={(e) => set("heading", e.target.value)}
            placeholder="Shop by Category"
          />
        </div>
        <div>
          <label className={labelClass}>Subheading</label>
          <input
            className={fieldClass}
            value={config.subheading}
            onChange={(e) => set("subheading", e.target.value)}
            placeholder="(optional)"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Which categories?</label>
          <select
            className={fieldClass}
            value={config.source}
            onChange={(e) =>
              set("source", e.target.value as ShopByCategoryConfig["source"])
            }
          >
            <option value="all">All active categories</option>
            <option value="selected">Selected only</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Layout</label>
          <select
            className={fieldClass}
            value={config.layout}
            onChange={(e) =>
              set("layout", e.target.value as ShopByCategoryConfig["layout"])
            }
          >
            <option value="grid">Grid</option>
            <option value="scroll">Horizontal scroll</option>
          </select>
        </div>
      </div>

      {config.source === "selected" && (
        <div>
          <label className={labelClass}>Categories (in display order)</label>
          <OrderedPicker
            selectedIds={config.category_ids}
            options={categories.map((c) => ({ id: c.id, name: c.name }))}
            onChange={(ids) => set("category_ids", ids)}
            addLabel="Add a category..."
          />
        </div>
      )}
    </>
  );
}

function BannerFields({
  config,
  setConfig,
}: {
  config: PromoBannerConfig;
  setConfig: (c: AnySectionConfig) => void;
}) {
  const set = <K extends keyof PromoBannerConfig>(
    key: K,
    value: PromoBannerConfig[K],
  ) => setConfig({ ...config, [key]: value });

  return (
    <>
      <div>
        <label className={labelClass}>Banner image</label>
        <ImageUpload
          folder="homepage"
          defaultImage={config.image_url || undefined}
          onUploadSuccess={(url) => set("image_url", url)}
        />
      </div>

      <div>
        <label className={labelClass}>Heading</label>
        <input
          className={fieldClass}
          value={config.heading}
          onChange={(e) => set("heading", e.target.value)}
          placeholder="Summer Sale"
        />
      </div>

      <div>
        <label className={labelClass}>Subtext</label>
        <textarea
          className={`${fieldClass} min-h-[60px] resize-y`}
          value={config.subtext}
          onChange={(e) => set("subtext", e.target.value)}
          placeholder="(optional)"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Button label</label>
          <input
            className={fieldClass}
            value={config.cta_label}
            onChange={(e) => set("cta_label", e.target.value)}
            placeholder="Shop now"
          />
        </div>
        <div>
          <label className={labelClass}>Button link</label>
          <input
            className={fieldClass}
            value={config.cta_href}
            onChange={(e) => set("cta_href", e.target.value)}
            placeholder="/shop"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Text alignment</label>
          <select
            className={fieldClass}
            value={config.alignment}
            onChange={(e) =>
              set("alignment", e.target.value as PromoBannerConfig["alignment"])
            }
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Text theme</label>
          <select
            className={fieldClass}
            value={config.theme}
            onChange={(e) =>
              set("theme", e.target.value as PromoBannerConfig["theme"])
            }
          >
            <option value="light">Light (dark image)</option>
            <option value="dark">Dark (light image)</option>
          </select>
        </div>
      </div>
    </>
  );
}

function BlogFields({
  config,
  setConfig,
  blogs,
}: {
  config: LatestBlogsConfig;
  setConfig: (c: AnySectionConfig) => void;
  blogs: BlogOption[];
}) {
  const set = <K extends keyof LatestBlogsConfig>(
    key: K,
    value: LatestBlogsConfig[K],
  ) => setConfig({ ...config, [key]: value });

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Heading</label>
          <input
            className={fieldClass}
            value={config.heading}
            onChange={(e) => set("heading", e.target.value)}
            placeholder="From the Journal"
          />
        </div>
        <div>
          <label className={labelClass}>Subheading</label>
          <input
            className={fieldClass}
            value={config.subheading}
            onChange={(e) => set("subheading", e.target.value)}
            placeholder="(optional)"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Which posts?</label>
          <select
            className={fieldClass}
            value={config.source}
            onChange={(e) =>
              set("source", e.target.value as LatestBlogsConfig["source"])
            }
          >
            <option value="latest">Latest published (auto)</option>
            <option value="featured">Featured posts (auto)</option>
            <option value="manual">Hand-picked</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Layout</label>
          <select
            className={fieldClass}
            value={config.layout}
            onChange={(e) =>
              set("layout", e.target.value as LatestBlogsConfig["layout"])
            }
          >
            <option value="grid">Grid</option>
            <option value="scroll">Horizontal scroll</option>
          </select>
        </div>
      </div>

      {config.source === "manual" ? (
        <div>
          <label className={labelClass}>Posts (in display order)</label>
          <OrderedPicker
            selectedIds={config.blog_ids}
            options={blogs.map((b) => ({ id: b.id, name: b.name }))}
            onChange={(ids) => set("blog_ids", ids)}
            addLabel="Add a blog post..."
          />
          {blogs.length === 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              No published blogs yet — publish a post first.
            </p>
          )}
        </div>
      ) : (
        <div className="max-w-[160px]">
          <label className={labelClass}>Max posts</label>
          <NumberField
            className={fieldClass}
            value={config.limit}
            onValueChange={(n) => set("limit", n)}
            allowDecimal={false}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">1–12.</p>
        </div>
      )}
    </>
  );
}
