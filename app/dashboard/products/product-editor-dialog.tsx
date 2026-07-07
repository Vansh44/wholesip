"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProductEditorForm } from "./product-editor-form";
import type { Product, CategoryOption, CardColorOption } from "./page";

type Props = {
  open: boolean;
  product: Product | null;
  categories: CategoryOption[];
  colors: CardColorOption[];
  onClose: () => void;
  onSaved: () => void;
  defaultTrackInventory?: boolean;
};

// Thin Dialog wrapper around the shared ProductEditorForm. Used for the "New
// Product" modal in the list, and reused by the intercepted edit route.
export function ProductEditorDialog({
  open,
  product,
  categories,
  colors,
  onClose,
  onSaved,
  defaultTrackInventory = false,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{product ? "Edit Product" : "New Product"}</DialogTitle>
          <DialogDescription>
            Fill in the details below. Drafts stay hidden from the storefront.
          </DialogDescription>
        </DialogHeader>
        <ProductEditorForm
          product={product}
          categories={categories}
          colors={colors}
          onClose={onClose}
          onSaved={onSaved}
          defaultTrackInventory={defaultTrackInventory}
        />
      </DialogContent>
    </Dialog>
  );
}
