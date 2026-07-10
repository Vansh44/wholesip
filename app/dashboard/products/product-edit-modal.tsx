"use client";

import { useRouter } from "next/navigation";
import { ProductEditorDialog } from "./product-editor-dialog";
import type {
  Product,
  CategoryOption,
  CardColorOption,
  TaxClassOption,
} from "./page";

// Edit modal for the intercepted /dashboard/products/[id] route. Closing returns
// to the list (router.back); saving returns and refreshes.
export function ProductEditModal({
  product,
  categories,
  colors,
  taxClasses,
}: {
  product: Product;
  categories: CategoryOption[];
  colors: CardColorOption[];
  taxClasses: TaxClassOption[];
}) {
  const router = useRouter();
  return (
    <ProductEditorDialog
      open
      product={product}
      categories={categories}
      colors={colors}
      taxClasses={taxClasses}
      onClose={() => router.back()}
      onSaved={() => {
        router.push("/dashboard/products");
        router.refresh();
      }}
    />
  );
}
