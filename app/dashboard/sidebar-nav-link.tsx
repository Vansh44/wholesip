"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Archive,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  LineChart,
  Megaphone,
  Package,
  Settings,
  Shield,
  ShoppingCart,
  Tag,
  Users,
} from "lucide-react";
import { SidebarMenuButton } from "@/components/ui/sidebar";

const iconMap = {
  dashboard: LayoutDashboard,
  orders: ShoppingCart,
  products: Package,
  customers: Users,
  inventory: Archive,
  analytics: LineChart,
  blogs: FileText,
  marketing: Megaphone,
  promotions: Tag,
  users: Users,
  media: ImageIcon,
  roles: Shield,
  activity: Activity,
  settings: Settings,
} as const;

export type SidebarIconKey = keyof typeof iconMap;

export function SidebarNavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: SidebarIconKey;
}) {
  const pathname = usePathname();
  const isActive =
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  const Icon = iconMap[icon];

  return (
    <SidebarMenuButton
      isActive={isActive}
      render={<Link href={href} />}
      className="px-3 py-2 text-[13px] font-medium text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827] data-[active=true]:bg-[#F3F4F6] data-[active=true]:text-[#111827]"
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </SidebarMenuButton>
  );
}
