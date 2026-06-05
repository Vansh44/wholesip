"use client";

import { usePathname } from "next/navigation";

const breadcrumbMap: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/admins": "Admins",
};

export function ActiveBreadcrumb() {
  const pathname = usePathname();
  const label = breadcrumbMap[pathname] ?? "Dashboard";
  return <span className="text-sm text-muted-foreground">{label}</span>;
}
