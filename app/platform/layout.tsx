import type { Metadata } from "next";
import { brandOgImageUrl } from "@/lib/seo/og-card";
import "./platform.css";

const DESCRIPTION =
  "The India-first store builder with everything included — storefront, blogs, reviews, coupons and email campaigns. D2C + B2B from ₹399/month. No apps to buy, no transaction fees.";

// Branded share card for the platform itself. metadataBase is PLATFORM_URL
// (set on the root layout), so this relative path resolves to storemink.com.
const OG_IMAGE = brandOgImageUrl({
  title: "StoreMink",
  subtitle: "Launch your store in a day. Keep 100% of every sale.",
  color: "#17130f",
});

export const metadata: Metadata = {
  title: "StoreMink — Launch your store in a day. Keep 100% of every sale.",
  description: DESCRIPTION,
  applicationName: "StoreMink",
  openGraph: {
    title: "StoreMink — Launch your store in a day",
    description: DESCRIPTION,
    url: "/",
    siteName: "StoreMink",
    type: "website",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "StoreMink" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "StoreMink — Launch your store in a day",
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="stq">{children}</div>;
}
