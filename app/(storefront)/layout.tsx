import Header from "@/app/(storefront)/components/header/Header";
import Footer from "@/app/(storefront)/components/footer/Footer";
import AuthProvider from "@/app/(storefront)/components/auth/AuthProvider";
import CartProvider from "@/app/(storefront)/components/cart/CartProvider";
import CartDrawer from "@/app/(storefront)/components/cart/CartDrawer";
import AuthModal from "@/app/(storefront)/components/auth/AuthModal";
import { Toaster } from "@/components/ui/sonner";
import "./storefront-theme.css";

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <CartProvider>
        <div className="storefront-root">
          <Header />
          {children}
          <Footer />
        </div>
        <AuthModal />
        <CartDrawer />
        <Toaster richColors position="top-right" />
      </CartProvider>
    </AuthProvider>
  );
}
