import type { Metadata } from "next";
import "../platform/platform.css";

export const metadata: Metadata = {
  title: "Storiq Help Centre",
  description:
    "Guides and answers for setting up and growing your D2C store on Storiq.",
};

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="stq">{children}</div>;
}
