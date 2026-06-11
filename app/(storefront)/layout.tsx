import Header from "@/app/components/header/Header";
import Footer from "@/app/components/footer/Footer";
import AuthProvider from "@/app/components/auth/AuthProvider";
import CartProvider from "@/app/components/cart/CartProvider";
import CartDrawer from "@/app/components/cart/CartDrawer";
import AuthModal from "@/app/components/auth/AuthModal";
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
