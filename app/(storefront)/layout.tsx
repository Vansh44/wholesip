import Header from "@/app/components/header/Header";
import Footer from "@/app/components/footer/Footer";
import AuthProvider from "@/app/components/auth/AuthProvider";
import AuthModal from "@/app/components/auth/AuthModal";

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <Header />
      {children}
      <Footer />
      <AuthModal />
    </AuthProvider>
  );
}
