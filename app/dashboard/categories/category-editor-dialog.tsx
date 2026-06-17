/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
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
  createCategory,
  updateCategory,
  type CategoryFormData,
} from "@/app/actions/category-actions";
import type { Category } from "./page";

type Props = {
  open: boolean;
  category: Category | null;
  onClose: () => void;
  onSaved: () => void;
};

const EMPTY: CategoryFormData = {
  name: "",
  slug: "",
  description: "",
  image_url: "",
  sort_order: 0,
  status: "active",
};

const fieldClass =
  "w-full rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-text-3)] focus:border-[var(--dash-accent)]";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--dash-text-2)]";

export function CategoryEditorDialog({
  open,
  category,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<CategoryFormData>(EMPTY);
  const [isPending, startTransition] = useTransition();
  // Once the user edits the slug by hand we stop auto-deriving it from the name.
  const [slugTouched, setSlugTouched] = useState(false);
  const isEditing = !!category;

  useEffect(() => {
    if (!open) return;
    if (category) {
      setForm({
        name: category.name,
        slug: category.slug,
        description: category.description ?? "",
        image_url: category.image_url ?? "",
        sort_order: category.sort_order,
        status: category.status,
      });
      setSlugTouched(true); // keep the existing slug stable while editing
    } else {
      setForm(EMPTY);
      setSlugTouched(false);
    }
  }, [open, category]);

  const set = <K extends keyof CategoryFormData>(
    key: K,
    value: CategoryFormData[K],
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

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    startTransition(async () => {
      const result = isEditing
        ? await updateCategory(category!.id, form)
        : await createCategory(form);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isEditing ? "Category updated" : "Category created");
        onSaved();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit category" : "New category"}
          </DialogTitle>
          <DialogDescription>
            Categories group products on the storefront.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className={labelClass}>Name *</label>
            <input
              className={fieldClass}
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Almond Milk"
            />
          </div>

          <div>
            <label className={labelClass}>Slug</label>
            <input
              className={fieldClass}
              value={form.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="auto-generated from name"
            />
            <p className="mt-1 text-[11px] text-[var(--dash-text-3)]">
              Leave blank to generate from the name.
            </p>
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              className={`${fieldClass} min-h-[72px] resize-y`}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional short description"
            />
          </div>

          <div>
            <label className={labelClass}>Image</label>
            <ImageUpload
              folder="category-images"
              defaultImage={form.image_url || undefined}
              onUploadSuccess={(url) => set("image_url", url)}
            />
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
                  set("status", e.target.value as "active" | "hidden")
                }
              >
                <option value="active">Active</option>
                <option value="hidden">Hidden</option>
              </select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending
              ? "Saving..."
              : isEditing
                ? "Save changes"
                : "Create category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
