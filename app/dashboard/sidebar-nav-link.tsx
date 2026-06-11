"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Package,
  ShoppingBag,
  Tags,
  Palette,
  Users,
  Boxes,
  BarChart3,
  PenLine,
  Megaphone,
  Gift,
  Ticket,
  ShieldCheck,
  Images,
  KeyRound,
  History,
  Settings,
  type LucideIcon,
} from "lucide-react";

export const navIcons = {
  dashboard: LayoutGrid,
  orders: Package,
  products: ShoppingBag,
  categories: Tags,
  colors: Palette,
  customers: Users,
  inventory: Boxes,
  analytics: BarChart3,
  blogs: PenLine,
  marketing: Megaphone,
  promotions: Gift,
  coupons: Ticket,
  users: ShieldCheck,
  media: Images,
  roles: KeyRound,
  activity: History,
  settings: Settings,
} satisfies Record<string, LucideIcon>;

export type NavIconKey = keyof typeof navIcons;

export function SidebarNavLink({
  href,
  label,
  icon,
  badge,
  badgeTone = "accent",
}: {
  href: string;
  label: string;
  icon: NavIconKey;
  badge?: string;
  badgeTone?: "accent" | "amber";
}) {
  const pathname = usePathname();
  const isActive =
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  const Icon = navIcons[icon];

  return (
    <Link href={href} className={`dash-nav-item ${isActive ? "active" : ""}`}>
      <span className="dash-nav-icon" aria-hidden>
        <Icon className="h-[17px] w-[17px]" strokeWidth={2} />
      </span>
      <span className="truncate">{label}</span>
      {badge && <span className={`dash-nav-badge ${badgeTone}`}>{badge}</span>}
    </Link>
  );
}

export type SidebarNavItem = {
  href: string;
  label: string;
  icon: NavIconKey;
  badge?: string;
  badgeTone?: "accent" | "amber";
};
