import { getStoreBrand } from "@/lib/store/brand";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const brand = await getStoreBrand();
  
  return <LoginForm storeName={brand.name} />;
}
