"use client";

import { usePathname } from "next/navigation";
import { Bell, Search, ArrowUpRight, Menu } from "lucide-react";
import { TopbarProfile } from "./topbar-profile";
import { useMobileNav } from "./dashboard-mobile-nav";

const routeMeta: Record<string, { title: string; breadcrumb: string }> = {
  "/dashboard": { title: "Dashboard", breadcrumb: "Home / Dashboard" },
  "/dashboard/orders": { title: "Orders", breadcrumb: "Workspace / Orders" },
  "/dashboard/products": {
    title: "Products",
    breadcrumb: "Workspace / Products",
  },
  "/dashboard/users": {
    title: "Users",
    breadcrumb: "Workspace / Users",
  },
  "/dashboard/inventory": {
    title: "Inventory",
    breadcrumb: "Workspace / Inventory",
  },
  "/dashboard/analytics": {
    title: "Analytics",
    breadcrumb: "Workspace / Analytics",
  },
  "/dashboard/blogs": { title: "Blogs", breadcrumb: "Content / Blogs" },
  "/dashboard/blogs/settings": {
    title: "Blog Settings",
    breadcrumb: "Content / Blogs / Settings",
  },
  "/dashboard/marketing": {
    title: "Marketing",
    breadcrumb: "Content / Marketing",
  },
  "/dashboard/promotions": {
    title: "Promotions",
    breadcrumb: "Content / Promotions",
  },
  "/dashboard/admins": {
    title: "Admins",
    breadcrumb: "Administration / Admins",
  },
  "/dashboard/media": {
    title: "Media Library",
    breadcrumb: "Administration / Media Library",
  },
  "/dashboard/roles": {
    title: "Roles & Permissions",
    breadcrumb: "Administration / Roles",
  },
  "/dashboard/activity": {
    title: "Activity Logs",
    breadcrumb: "Administration / Activity Logs",
  },
  "/dashboard/settings": {
    title: "Settings",
    breadcrumb: "Administration / Settings",
  },
};

function resolveMeta(pathname: string) {
  if (routeMeta[pathname]) return routeMeta[pathname];
  const match = Object.keys(routeMeta)
    .filter((k) => k !== "/dashboard")
    .find((k) => pathname.startsWith(k));
  if (match) return routeMeta[match];
  return { title: "Dashboard", breadcrumb: "Home / Dashboard" };
}

export function DashboardTopbar({
  email,
  role,
  firstName,
  lastName,
}: {
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const pathname = usePathname();
  const { title, breadcrumb } = resolveMeta(pathname);
  const { setOpen } = useMobileNav();

  return (
    <header className="dash-topbar">
      <button
        type="button"
        className="dash-icon-btn dash-nav-toggle md:hidden"
        aria-label="Open navigation menu"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="dash-topbar-title">{title}</div>
        <div className="dash-topbar-bc">{breadcrumb}</div>
      </div>

      <div className="dash-search-bar hidden md:flex">
        <Search className="h-4 w-4 shrink-0 text-[var(--dash-text-3)]" />
        <input
          type="search"
          placeholder="Search orders, products, customers…"
        />
        <kbd className="dash-search-kbd shrink-0">⌘K</kbd>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="dash-icon-btn"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-[7px] w-[7px] rounded-full border-[1.5px] border-[var(--dash-surface)] bg-[var(--dash-red)]" />
        </button>
        <button
          type="button"
          className="dash-icon-btn hidden sm:flex"
          aria-label="Messages"
          onClick={() => window.open("/", "_blank")}
        >
          <ArrowUpRight className="h-4 w-4" />
        </button>
        <TopbarProfile
          email={email}
          role={role}
          firstName={firstName}
          lastName={lastName}
        />
      </div>
    </header>
  );
}
