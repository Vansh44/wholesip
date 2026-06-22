"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { SidebarNavLink, navIcons, type NavIconKey } from "./sidebar-nav-link";
import { useMobileNav } from "./dashboard-mobile-nav";

type Child = { label: string; href: string; icon?: NavIconKey };
type Item = {
  href: string;
  label: string;
  icon: NavIconKey;
  badge?: string;
  badgeTone?: "accent" | "amber";
  children?: Child[];
};
type Group = { group: string; items: Item[] };

function matches(pathname: string, href: string): boolean {
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`))
  );
}

// Two-pane sidebar:
//  • Primary — the labelled section nav (icon + name), grouped.
//  • Panel — the active section's sub-pages, shown only when it has any.
//    Sections without sub-pages just open directly (no panel).
export function DashboardSidebar({
  groups,
  logoUrl,
}: {
  groups: Group[];
  logoUrl: string;
}) {
  const pathname = usePathname();
  const { open, setOpen } = useMobileNav();
  const allItems = groups.flatMap((g) => g.items);

  const activeSection =
    allItems.find((it) => matches(pathname, it.href)) ??
    allItems.find((it) => it.href === "/dashboard") ??
    allItems[0];

  const showPanel = !!activeSection?.children?.length;

  // Close the mobile drawer whenever the route changes (i.e. the user tapped a
  // nav item). Harmless when already closed / on desktop.
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  return (
    <>
      {/* Backdrop — only visible while the drawer is open on mobile */}
      <div
        className={`dash-sidebar-overlay ${open ? "open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      <aside
        className={`dash-sidebar shrink-0 ${open ? "dash-sidebar--open" : ""}`}
      >
        {/* ── Primary nav (icon + name) ── */}
        <div className="dash-primary">
          <div className="dash-brand-row">
            <Link href="/dashboard" className="dash-brand">
              <Image
                src={logoUrl}
                alt="Soakd Logo"
                width={150}
                height={50}
                priority
                style={{ height: "auto", width: "auto", maxHeight: 32 }}
              />
            </Link>
            <button
              type="button"
              className="dash-drawer-close md:hidden"
              aria-label="Close navigation menu"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="dash-nav-scroll">
            {groups.map((g) => (
              <div key={g.group} className="pt-1">
                <div className="dash-nav-label">{g.group}</div>
                <nav>
                  {g.items.map((item) => (
                    <SidebarNavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      badge={item.badge}
                      badgeTone={item.badgeTone}
                    />
                  ))}
                </nav>
              </div>
            ))}
          </div>
        </div>

        {/* ── Sub-nav panel (only for sections with sub-pages) ── */}
        {showPanel && (
          <div className="dash-subnav">
            <div className="dash-subnav-head">{activeSection.label}</div>
            <div className="dash-subnav-scroll">
              <nav>
                {activeSection.children!.map((c) => {
                  const Icon = navIcons[c.icon ?? activeSection.icon];
                  const active = matches(pathname, c.href);
                  return (
                    <Link
                      key={c.href}
                      href={c.href}
                      className={`dash-nav-item ${active ? "active" : ""}`}
                    >
                      <span className="dash-nav-icon" aria-hidden>
                        <Icon className="h-[17px] w-[17px]" strokeWidth={2} />
                      </span>
                      <span className="truncate">{c.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
