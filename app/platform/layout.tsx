import type { Metadata } from "next";
import "./platform.css";

export const metadata: Metadata = {
  title: "StoreMink — Launch your store in a day. Keep 100% of every sale.",
  description:
    "The India-first store builder with everything included — storefront, blogs, reviews, coupons and email campaigns. D2C + B2B from ₹399/month. No apps to buy, no transaction fees.",
};

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="stq">{children}</div>;
}
