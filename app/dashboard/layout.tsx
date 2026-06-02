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
  { href: "/dashboard", label: "Dashboard", emoji: "⊞" },
  {
    href: "/dashboard/orders",
    label: "Orders",
    emoji: "📦",
    badge: "12",
    badgeTone: "accent",
  },
  { href: "/dashboard/products", label: "Products", emoji: "🛍" },
  { href: "/dashboard/customers", label: "Customers", emoji: "👥" },
  {
    href: "/dashboard/inventory",
    label: "Inventory",
    emoji: "🗄",
    badge: "3",
    badgeTone: "amber",
  },
  { href: "/dashboard/analytics", label: "Analytics", emoji: "📊" },
];

const contentLinks: SidebarNavItem[] = [
  { href: "/dashboard/blogs", label: "Blogs", emoji: "✍️" },
  { href: "/dashboard/marketing", label: "Marketing", emoji: "📢" },
  { href: "/dashboard/promotions", label: "Promotions", emoji: "🎁" },
];

const adminLinks: SidebarNavItem[] = [
  { href: "/dashboard/users", label: "Users", emoji: "🔐" },
  { href: "/dashboard/media", label: "Media Library", emoji: "🖼" },
  { href: "/dashboard/roles", label: "Roles & Permissions", emoji: "🛡" },
  { href: "/dashboard/activity", label: "Activity Logs", emoji: "🕐" },
  { href: "/dashboard/settings", label: "Settings", emoji: "⚙️" },
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
      <div className="flex min-h-screen items-center justify-center bg-[#0d0f14] px-4 text-[#e8ecf4]">
        <div className="max-w-lg space-y-4 rounded-xl border border-white/10 bg-[#141720] p-8 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-lg font-bold text-amber-400">
              ⚠️
            </div>
            <div>
              <h1 className="text-lg font-bold">Profile Not Found</h1>
              <p className="text-sm text-[#8b93a8]">
                Your auth account exists but has no profile row.
              </p>
            </div>
          </div>
          <p className="text-sm text-[#8b93a8]">
            Run the following SQL in your Supabase SQL Editor:
          </p>
          <pre className="overflow-auto rounded-lg border border-white/10 bg-[#1a1f2e] p-3 text-xs">
            {`INSERT INTO profiles (id, email, role, force_password_reset)\nVALUES ('${user.id}', '${user.email}', 'superadmin', false);`}
          </pre>
          <p className="text-xs text-[#4f5768]">
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
      <aside className="hidden h-screen w-[240px] shrink-0 flex-col border-r border-[var(--dash-border)] bg-[var(--dash-surface)] md:flex">
        <div className="mb-2 flex items-center gap-2.5 border-b border-[var(--dash-border)] px-[18px] py-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Image
              src={siteConfig.assets.logoUrl}
              alt="Soakd Logo"
              width={180}
              height={60}
              priority
              style={{ height: "auto" }}
            />
          </Link>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto px-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

        <div className="shrink-0 border-t border-[var(--dash-border)] p-2.5">
          <div className="dash-nav-item cursor-default text-[12px] text-[var(--dash-text-3)] hover:bg-transparent hover:text-[var(--dash-text-3)]">
            <span className="dash-nav-icon">🌐</span>
            <span className="font-mono-dash text-[11px]">localhost:3000</span>
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

      <Toaster
        richColors
        position="top-right"
        toastOptions={{
          classNames: {
            toast: "bg-[#1a1f2e] border-white/10 text-[#e8ecf4] shadow-xl",
          },
        }}
      />
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
