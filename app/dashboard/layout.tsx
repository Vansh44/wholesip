import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Sora, JetBrains_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { Toaster } from "@/components/ui/sonner";
import { siteConfig } from "@/config/site";
import { DashboardTopbar } from "./dashboard-topbar";
import { SidebarNavLink, type SidebarNavItem } from "./sidebar-nav-link";
import "./dashboard.css";

const dashFont = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-dash",
});

const dashMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dash-mono",
});

export const metadata = {
  title: `${siteConfig.name} — Operations Center`,
};

const workspaceLinks: SidebarNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  {
    href: "/dashboard/orders",
    label: "Orders",
    icon: "orders",
    badge: "12",
    badgeTone: "accent",
  },
  { href: "/dashboard/products", label: "Products", icon: "products" },
  { href: "/dashboard/categories", label: "Categories", icon: "categories" },
  { href: "/dashboard/colors", label: "Colours", icon: "colors" },
  { href: "/dashboard/users", label: "Users", icon: "customers" },
  {
    href: "/dashboard/inventory",
    label: "Inventory",
    icon: "inventory",
    badge: "3",
    badgeTone: "amber",
  },
  { href: "/dashboard/analytics", label: "Analytics", icon: "analytics" },
];

const contentLinks: SidebarNavItem[] = [
  { href: "/dashboard/blogs", label: "Blogs", icon: "blogs" },
  { href: "/dashboard/marketing", label: "Marketing", icon: "marketing" },
  { href: "/dashboard/promotions", label: "Promotions", icon: "promotions" },
];

const adminLinks: SidebarNavItem[] = [
  { href: "/dashboard/admins", label: "Admins", icon: "users" },
  { href: "/dashboard/media", label: "Media Library", icon: "media" },
  { href: "/dashboard/roles", label: "Roles & Permissions", icon: "roles" },
  { href: "/dashboard/activity", label: "Activity Logs", icon: "activity" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email, role, first_name, last_name")
    .eq("id", user.id)
    .single();

  if (!profile || profileError) {
    if (profileError) {
      console.error("Dashboard layout profile fetch error:", profileError);
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7f9] px-4 text-[#111827]">
        <div className="max-w-lg space-y-4 rounded-2xl border border-[rgba(17,24,39,0.08)] bg-white p-8 shadow-[0_12px_32px_-8px_rgba(16,24,40,0.16)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-lg font-bold text-amber-600">
              ⚠️
            </div>
            <div>
              <h1 className="text-lg font-bold">Profile Not Found</h1>
              <p className="text-sm text-[#5b6472]">
                Your auth account exists but has no profile row.
              </p>
            </div>
          </div>
          <p className="text-sm text-[#5b6472]">
            Run the following SQL in your Supabase SQL Editor:
          </p>
          <pre className="overflow-auto rounded-lg border border-[rgba(17,24,39,0.08)] bg-[#f3f4f6] p-3 text-xs text-[#111827]">
            {`INSERT INTO profiles (id, email, role, force_password_reset)\nVALUES ('${user.id}', '${user.email}', 'superadmin', false);`}
          </pre>
          <p className="text-xs text-[#8b93a3]">
            After inserting, refresh this page.
          </p>
        </div>
      </div>
    );
  }

  const isSuperadmin = profile.role === "superadmin";

  return (
    <div
      className={`dashboard-shell ${dashFont.variable} ${dashMono.variable} flex`}
    >
      <aside className="dash-sidebar hidden h-screen shrink-0 flex-col border-r border-[var(--dash-border)] bg-[var(--dash-surface)] md:flex">
        <div className="dash-brand">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Image
              src={siteConfig.assets.logoUrl}
              alt="Soakd Logo"
              width={150}
              height={50}
              priority
              style={{ height: "auto", width: "auto", maxHeight: 36 }}
            />
          </Link>
        </div>

        <div className="dash-nav-scroll flex flex-1 flex-col overflow-y-auto px-[14px]">
          <NavSection label="Workspace">
            {workspaceLinks.map((item) => (
              <SidebarNavLink key={item.href} {...item} />
            ))}
          </NavSection>
          <NavSection label="Content">
            {contentLinks.map((item) => (
              <SidebarNavLink key={item.href} {...item} />
            ))}
          </NavSection>
          {isSuperadmin && (
            <NavSection label="Administration">
              {adminLinks.map((item) => (
                <SidebarNavLink key={item.href} {...item} />
              ))}
            </NavSection>
          )}
        </div>

        <div className="shrink-0 border-t border-[var(--dash-border)] p-[14px]">
          <div className="flex items-center gap-2.5 rounded-[var(--dash-radius-sm)] bg-[var(--dash-surface-2)] px-3 py-2.5">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--dash-green)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--dash-green)]" />
            </span>
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-[var(--dash-text)]">
                All systems operational
              </div>
              <div className="font-mono-dash text-[10.5px] text-[var(--dash-text-3)]">
                v0.1.0 · uptime 99.9%
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="dash-main">
        <DashboardTopbar
          email={profile.email}
          role={profile.role}
          firstName={profile.first_name}
          lastName={profile.last_name}
        />
        <div className="dash-content">{children}</div>
      </div>

      <Toaster richColors position="top-right" />
    </div>
  );
}

function NavSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-1">
      <div className="dash-nav-label">{label}</div>
      <nav>{children}</nav>
    </div>
  );
}
