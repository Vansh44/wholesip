"use client";

import { createContext, useContext } from "react";
import type { StoreBrand } from "@/lib/store/brand";

const BrandContext = createContext<StoreBrand | null>(null);

export function BrandProvider({
  brand,
  children,
}: {
  brand: StoreBrand;
  children: React.ReactNode;
}) {
  return (
    <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>
  );
}

// The current store's brand. Falls back to a neutral default if used outside
// the provider (shouldn't happen in the storefront).
export function useBrand(): StoreBrand {
  return (
    useContext(BrandContext) ?? {
      name: "Store",
      logoUrl: null,
      primaryColor: "#17130f",
      tagline: null,
      blurb: null,
      legalName: null,
      creditLine: null,
      email: null,
      phone: null,
      hours: null,
      social: { instagram: null, youtube: null, whatsapp: null },
      badges: [],
      domain: "storemink.com",
    }
  );
}
