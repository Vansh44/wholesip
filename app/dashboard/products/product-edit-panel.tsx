"use client";

import { useRouter } from "next/navigation";
import { ProductEditorForm } from "./product-editor-form";
import type { Product, CategoryOption, CardColorOption } from "./page";

// Full-page editor surface (dark panel, matching the editor's theme) for a
// direct visit / shared link to /dashboard/products/[id].
export function ProductEditPanel({
  product,
  categories,
  colors,
}: {
  product: Product;
  categories: CategoryOption[];
  colors: CardColorOption[];
}) {
  const router = useRouter();
  const toList = () => router.push("/dashboard/products");
  return (
    <div>
      <h1
        className="text-xl font-semibold"
        style={{ color: "var(--dash-text)" }}
      >
        Edit Product
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--dash-text-3)" }}>
        Fill in the details below. Drafts stay hidden from the storefront.
      </p>
      <ProductEditorForm
        product={product}
        categories={categories}
        colors={colors}
        onClose={toList}
        onSaved={() => {
          router.push("/dashboard/products");
          router.refresh();
        }}
      />
    </div>
  );
}
