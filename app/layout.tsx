import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://getsoakd.in"),

  title: "Soakd",
  description: "Healthy • Refreshing • Authentic",

  openGraph: {
    title: "Soakd",
    description: "Healthy • Refreshing • Authentic",
    url: "https://getsoakd.in",
    siteName: "Soakd",
    images: [
      {
        url: "https://getsoakd.in/og.png",
        width: 1200,
        height: 630,
      },
    ],
    type: "website",
  },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
