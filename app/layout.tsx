import "./globals.css";
import Header from "./components/header/Header";
import Footer from "./components/footer/Footer";
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
  title: "soakd | The Original Ragda",
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
        <Footer />
      </body>
    </html>
  );
}
