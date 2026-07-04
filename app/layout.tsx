import "./globals.css";
import {
  Outfit,
  Roboto,
  Stick_No_Bills,
  Inter,
  Fraunces,
  Space_Grotesk,
  Plus_Jakarta_Sans,
} from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { PLATFORM_URL } from "@/lib/site";

// Default WholeSip / platform fonts.
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const roboto = Roboto({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-roboto",
});
const stickNoBills = Stick_No_Bills({
  weight: ["800"],
  subsets: ["latin"],
  variable: "--font-stick-no-bills",
});

// ── Theme font palette ──────────────────────────────────────────────────
// next/font runs at build time, so every family a theme can pick must be
// declared here. A theme's design.fonts references these --font-* variables;
// the (storefront) layout re-points --font-outfit / --font-stick-no-bills to
// the chosen families, re-skinning all storefront typography with no CSS
// find-replace. Weights kept tight to bound the download.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

// Neutral platform-level fallback. The (storefront) layout overrides this per
// store (brand name + canonical origin); the (platform) layout sets its own.
export const metadata = {
  metadataBase: new URL(PLATFORM_URL),
  applicationName: "Storemink",
  title: { default: "Storemink", template: "%s" },
  description: "Launch, grow, and scale your D2C brand online.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${roboto.variable} ${stickNoBills.variable} ${inter.variable} ${fraunces.variable} ${spaceGrotesk.variable} ${jakarta.variable}`}
    >
      <body className="antialiased">
        <NextTopLoader color="#1a1a1a" showSpinner={false} />
        {children}
      </body>
    </html>
  );
}
