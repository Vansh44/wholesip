import type { Metadata } from "next";
import "./platform.css";

export const metadata: Metadata = {
  title: "Storiq — From local business to digital brand",
  description:
    "Storiq is the simplest way for Indian businesses to launch, grow, and scale a direct-to-consumer brand online. Built for India: UPI, COD, GST, WhatsApp.",
};

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="stq">{children}</div>;
}
