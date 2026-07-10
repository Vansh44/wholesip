"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ProductEditorForm } from "./product-editor-form";
import type {
  Product,
  CategoryOption,
  CardColorOption,
  TaxClassOption,
} from "./page";

// Full-page product editor (Shopify-style): back arrow + product title +
// status chip up top, the shared editor form below. Saving stays on the page
// (toast + refresh); Cancel returns to the list.
export function ProductEditPanel({
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
  const published = product.status === "published";
  return (
    <div>
      <header className="mb-5 flex items-center gap-3">
        <Link
          href="/dashboard/products"
          aria-label="Back to products"
          className="dash-btn dash-btn-ghost dash-btn-sm shrink-0"
          style={{ paddingInline: 8 }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h1
              className="truncate text-xl font-semibold"
              style={{ color: "var(--dash-text)" }}
            >
              {product.name || "Edit product"}
            </h1>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={
                published
                  ? {
                      background: "rgba(34, 197, 94, 0.14)",
                      color: "#15803d",
                    }
                  : {
                      background: "var(--dash-surface-2, rgba(0,0,0,0.06))",
                      color: "var(--dash-text-3)",
                    }
              }
            >
              {published ? "Published" : "Draft"}
            </span>
          </div>
          <p className="mt-0.5 text-sm" style={{ color: "var(--dash-text-3)" }}>
            Changes save as you submit — drafts stay hidden from the storefront.
          </p>
        </div>
        {published && (
          <a
            href={`/shop/${product.slug}`}
            target="_blank"
            rel="noreferrer"
            className="dash-btn dash-btn-ghost dash-btn-sm shrink-0"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View in store
          </a>
        )}
      </header>
      <ProductEditorForm
        product={product}
        categories={categories}
        colors={colors}
        taxClasses={taxClasses}
        onClose={() => router.push("/dashboard/products")}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
