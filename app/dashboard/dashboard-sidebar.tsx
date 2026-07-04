/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
  openInNewTab?: boolean;
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
  storeName,
}: {
  groups: Group[];
  logoUrl: string | null;
  storeName: string;
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
        {/* Single drill-down column. By default it shows the grouped top-level
            nav. Inside a section that has sub-(pages), the top-level nav is
            replaced by a "Back" link + that section's sub-pages. */}
        <div className="dash-primary">
          <div className="dash-brand-row" style={{ justifyContent: "center" }}>
            <Link
              href="/dashboard"
              className="dash-brand"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                textDecoration: "none",
                padding: "2px 0",
              }}
            >
              {logoUrl && (
                <div
                  style={{
                    height: "32px",
                    width: "32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "6px",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={logoUrl}
                    alt={`${storeName} logo`}
                    style={{
                      height: "100%",
                      width: "100%",
                      objectFit: "contain",
                    }}
                  />
                </div>
              )}
              <span
                className="truncate"
                style={{
                  fontWeight: 700,
                  fontSize: 20,
                  color: "#0f172a",
                  letterSpacing: "-0.01em",
                  lineHeight: "1.3",
                  paddingBottom: "2px",
                }}
              >
                {storeName}
              </span>
            </Link>
          </div>

          {showPanel ? (
            (() => {
              const activeChildHref = activeSection
                .children!.filter((c) => matches(pathname, c.href))
                .sort((a, b) => b.href.length - a.href.length)[0]?.href;
              return (
                <div className="dash-nav-scroll">
                  <Link
                    href="/dashboard"
                    className="dash-nav-item dash-subnav-back"
                  >
                    <span className="dash-nav-icon" aria-hidden>
                      <ArrowLeft
                        className="h-[17px] w-[17px]"
                        strokeWidth={2}
                      />
                    </span>
                    <span className="truncate">Back</span>
                  </Link>
                  <div className="pt-1">
                    <div className="dash-nav-label">{activeSection.label}</div>
                    <nav>
                      {activeSection.children!.map((c) => {
                        const Icon = navIcons[c.icon ?? activeSection.icon];
                        const active = c.href === activeChildHref;
                        return (
                          <Link
                            key={c.href}
                            href={c.href}
                            className={`dash-nav-item ${active ? "active" : ""}`}
                          >
                            <span className="dash-nav-icon" aria-hidden>
                              <Icon
                                className="h-[17px] w-[17px]"
                                strokeWidth={2}
                              />
                            </span>
                            <span className="truncate">{c.label}</span>
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                </div>
              );
            })()
          ) : (
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
                        openInNewTab={item.openInNewTab}
                      />
                    ))}
                  </nav>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
