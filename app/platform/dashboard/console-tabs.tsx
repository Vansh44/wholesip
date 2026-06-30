"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Stores" },
  { href: "/dashboard/operators", label: "Operators" },
];

export function ConsoleTabs() {
  const pathname = usePathname();
  return (
    <nav className="con-tabs">
      {TABS.map((t) => {
        const active =
          t.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`con-tab ${active ? "active" : ""}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
