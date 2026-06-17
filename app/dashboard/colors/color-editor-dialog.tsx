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
import { NumberField } from "@/components/ui/number-field";
import {
  createCardColor,
  updateCardColor,
  type CardColorFormData,
} from "@/app/actions/color-actions";
import type { CardColor } from "./page";

type Props = {
  open: boolean;
  color: CardColor | null;
  onClose: () => void;
  onSaved: () => void;
};

const EMPTY: CardColorFormData = {
  name: "",
  hex: "#f4dfe0",
  sort_order: 0,
};

const fieldClass =
  "w-full rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#9ca3af] focus:border-[#4f46e5]";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#6b7280]";

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function ColorEditorDialog({ open, color, onClose, onSaved }: Props) {
  const [form, setForm] = useState<CardColorFormData>(EMPTY);
  const [isPending, startTransition] = useTransition();
  const isEditing = !!color;

  useEffect(() => {
    if (!open) return;
    if (color) {
      setForm({
        name: color.name,
        hex: color.hex,
        sort_order: color.sort_order,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, color]);

  const set = <K extends keyof CardColorFormData>(
    key: K,
    value: CardColorFormData[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  const validHex = HEX_RE.test(form.hex.trim());
  // The native colour input needs a full #rrggbb; fall back while typing.
  const swatch = validHex
    ? form.hex.trim().startsWith("#")
      ? form.hex.trim()
      : `#${form.hex.trim()}`
    : "#f4dfe0";

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!validHex) {
      toast.error("Enter a valid hex colour (e.g. #f4dfe0)");
      return;
    }
    startTransition(async () => {
      const result = isEditing
        ? await updateCardColor(color!.id, form)
        : await createCardColor(form);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isEditing ? "Colour updated" : "Colour added");
        onSaved();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit colour" : "New colour"}</DialogTitle>
          <DialogDescription>
            Palette shades available as product card backgrounds on the
            storefront.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className={labelClass}>Shade name *</label>
            <input
              className={fieldClass}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Blush Rose"
            />
          </div>

          <div>
            <label className={labelClass}>Hex colour *</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                aria-label="Pick colour"
                value={swatch}
                onChange={(e) => set("hex", e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-md border border-[#e5e7eb] bg-white p-1"
              />
              <input
                className={`${fieldClass} flex-1 font-mono`}
                value={form.hex}
                onChange={(e) => set("hex", e.target.value)}
                placeholder="#f4dfe0"
              />
            </div>
            {!validHex && form.hex.trim() !== "" && (
              <p className="mt-1 text-[11px] text-amber-400">
                Not a valid hex (use #rgb or #rrggbb).
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Preview</label>
            <div
              className="flex h-16 items-center justify-center rounded-lg border border-[#e5e7eb]"
              style={{ background: swatch }}
            >
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: "#17130f", color: "#fff" }}
              >
                {form.name || "Aa"} · {swatch}
              </span>
            </div>
          </div>

          <div className="w-1/2">
            <label className={labelClass}>Sort order</label>
            <NumberField
              className={fieldClass}
              value={form.sort_order}
              onValueChange={(n) => set("sort_order", n)}
              allowDecimal={false}
            />
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
                : "Add colour"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
