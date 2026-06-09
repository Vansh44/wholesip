import Header from "@/app/components/header/Header";
import Footer from "@/app/components/footer/Footer";
import AuthProvider from "@/app/components/auth/AuthProvider";
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
      <div className="storefront-root">
        <Header />
        {children}
        <Footer />
      </div>
      <AuthModal />
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}
