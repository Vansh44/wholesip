import CartClient from "./cart-client";
import { getStorefrontLayout } from "@/lib/store/storefront-layout";
import "./cart.css";

// Layout templates the title as "%s | {brand}", so keep it brand-neutral.
export const metadata = {
  title: "Cart",
};

export default async function Cart() {
  const layout = await getStorefrontLayout();
  return <CartClient grocery={layout.storefront === "grocery"} />;
}
