import React from "react";

import { getStoreBrand } from "@/lib/store/brand";

export async function generateMetadata() {
  const brand = await getStoreBrand();
  return {
    title: `${brand.name} — Sign In`,
    icons: brand.logoUrl ? { icon: brand.logoUrl } : undefined,
  };
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-sans">
      <div className="w-full max-w-[360px] px-4">{children}</div>
    </div>
  );
}
