import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Header from "@/app/(storefront)/components/header/Header";
import Footer from "@/app/(storefront)/components/footer/Footer";
import AuthProvider from "@/app/(storefront)/components/auth/AuthProvider";
import CartProvider from "@/app/(storefront)/components/cart/CartProvider";
import CartDrawer from "@/app/(storefront)/components/cart/CartDrawer";
import AuthModal from "@/app/(storefront)/components/auth/AuthModal";
import { BrandProvider } from "@/app/(storefront)/components/brand-provider";
import { getStoreBrand } from "@/lib/store/brand";
import { Toaster } from "@/components/ui/sonner";
import "./storefront-theme.css";

// Per-store default title/template. Individual pages may still set their own
// title; this is the fallback and the "%s | Brand" suffix for those that don't.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getStoreBrand();
  return {
    title: { default: brand.name, template: `%s | ${brand.name}` },
    description: brand.tagline ?? undefined,
  };
}

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brand = await getStoreBrand();

  return (
    <AuthProvider>
      <CartProvider>
        <BrandProvider brand={brand}>
          <div
            className="storefront-root"
            style={{ "--brand-primary": brand.primaryColor } as CSSProperties}
          >
            <Header />
            {children}
            <Footer />
          </div>
        </BrandProvider>
        <AuthModal />
        <CartDrawer />
        <Toaster richColors position="top-right" />
      </CartProvider>
    </AuthProvider>
  );
}
