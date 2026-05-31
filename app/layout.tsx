// import type { Metadata } from "next";
// import { Geist, Geist_Mono } from "next/font/google";
// import "./globals.css";

// export const metadata: Metadata = {
//   metadataBase: new URL("https://getsoakd.in"),

//   title: "Soakd",
//   description: "Healthy • Refreshing • Authentic",

//   openGraph: {
//     title: "Soakd",
//     description: "Healthy • Refreshing • Authentic",
//     url: "https://getsoakd.in",
//     siteName: "Soakd",
//     images: [
//       {
//         url: "https://getsoakd.in/og.jpeg",
//         width: 1200,
//         height: 630,
//       },
//     ],
//     type: "website",
//   },
// };

// const geistSans = Geist({
//   variable: "--font-geist-sans",
//   subsets: ["latin"],
// });

// const geistMono = Geist_Mono({
//   variable: "--font-geist-mono",
//   subsets: ["latin"],
// });

// export default function RootLayout({
//   children,
// }: Readonly<{
//   children: React.ReactNode;
// }>) {
//   return (
//     <html
//       lang="en"
//       className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
//     >
//       <body className="min-h-full flex flex-col">{children}</body>
//     </html>
//   );
// }

import "./globals.css";
import Header from "./components/header/Header";
import { Outfit, Roboto, Stick_No_Bills } from "next/font/google";

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

export const metadata = {
  title: "Soakd | The Original Ragda",
  description: "Zero preservatives. 100% real ingredients.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${outfit.variable} ${roboto.variable} ${stickNoBills.variable}`}
      >
        <Header />
        {children}
      </body>
    </html>
  );
}
