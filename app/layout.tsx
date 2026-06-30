import "./globals.css";
import { Outfit, Roboto, Stick_No_Bills } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { PLATFORM_URL } from "@/lib/site";
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
      className={`${outfit.variable} ${roboto.variable} ${stickNoBills.variable}`}
    >
      <body className="antialiased">
        <NextTopLoader
          color="transparent"
          height={0}
          showSpinner={true}
          template='<div class="custom-spinner" role="spinner"><img src="/loader.svg" alt="Loading..." class="w-32 h-auto" /></div><div role="bar" style="display: none;"><div class="peg"></div></div>'
        />
        {children}
      </body>
    </html>
  );
}
