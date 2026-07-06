"use client";

import { toast } from "sonner";
import { useCart } from "./cart/CartProvider";
import { effectivePricing } from "@/lib/pricing";
import type { ShopCardProduct } from "./shop-card";

// The "+ Add" button on product cards (theme layout.card = "quick_add").
// Rendered by every ShopCard but hidden by CSS unless the storefront root has
// .sm-card-quickadd, so classic themes pay no visual cost.
//
// Products WITHOUT variants add straight to the cart. Products WITH variants
// need a size choice, so the click falls through to the card link (no
// preventDefault) and opens the product page.
export function QuickAddButton({ product }: { product: ShopCardProduct }) {
  const { addItem } = useCart();
  const pr = effectivePricing(product);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (pr.hasVariants) return; // bubble to the card link → detail page
    e.preventDefault();
    e.stopPropagation();
    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      variantId: null,
      variantName: null,
      price: pr.selling,
      basePrice: pr.base,
      image: product.image_url,
      category: product.category ?? null,
    });
    toast.success(`${product.name} added to cart`);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="shop-card-add flex items-center justify-center cursor-pointer"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      }}
      aria-label={
        pr.hasVariants
          ? `Choose options for ${product.name}`
          : `Add ${product.name} to cart`
      }
    >
      + Add
    </div>
  );
}
