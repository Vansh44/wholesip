"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SidebarNavLink({
  href,
  label,
  emoji,
  badge,
  badgeTone = "accent",
}: {
  href: string;
  label: string;
  emoji: string;
  badge?: string;
  badgeTone?: "accent" | "amber";
}) {
  const pathname = usePathname();
  const isActive =
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  return (
    <Link href={href} className={`dash-nav-item ${isActive ? "active" : ""}`}>
      <span className="dash-nav-icon" aria-hidden>
        {emoji}
      </span>
      <span className="truncate">{label}</span>
      {badge && <span className={`dash-nav-badge ${badgeTone}`}>{badge}</span>}
    </Link>
  );
}

export type SidebarNavItem = {
  href: string;
  label: string;
  emoji: string;
  badge?: string;
  badgeTone?: "accent" | "amber";
};
