import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Toaster } from "@/components/ui/sonner";
import { siteConfig } from "@/config/site";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Search, Bell, HelpCircle } from "lucide-react";
import { SidebarUser } from "./sidebar-user";
import { ActiveBreadcrumb } from "./active-breadcrumb";
import { Input } from "@/components/ui/input";
import { SidebarNavLink, type SidebarIconKey } from "./sidebar-nav-link";

export const metadata = {
  title: "Soakd — Operations Center",
};

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
    .select("email, role")
    .eq("id", user.id)
    .single();

  if (!profile || profileError) {
    if (profileError) {
      console.error("Dashboard layout profile fetch error:", profileError);
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="max-w-lg rounded-xl border bg-card p-8 text-card-foreground shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600 text-lg font-bold shrink-0">
              ⚠️
            </div>
            <div>
              <h1 className="text-lg font-bold">Profile Not Found</h1>
              <p className="text-sm text-muted-foreground">
                Your auth account exists but has no profile row.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Run the following SQL in your Supabase SQL Editor:
          </p>
          <pre className="bg-muted rounded-lg p-3 text-xs overflow-auto border">
            {`INSERT INTO profiles (id, email, role, force_password_reset)\nVALUES ('${user.id}', '${user.email}', 'superadmin', false);`}
          </pre>
          <p className="text-xs text-muted-foreground">
            After inserting, refresh this page.
          </p>
        </div>
      </div>
    );
  }

  const isSuperadmin = profile.role === "superadmin";
  const workspaceLinks: {
    href: string;
    label: string;
    icon: SidebarIconKey;
  }[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/dashboard/orders", label: "Orders", icon: "orders" },
    { href: "/dashboard/products", label: "Products", icon: "products" },
    { href: "/dashboard/customers", label: "Customers", icon: "customers" },
    { href: "/dashboard/inventory", label: "Inventory", icon: "inventory" },
    { href: "/dashboard/analytics", label: "Analytics", icon: "analytics" },
  ];

  const contentLinks: { href: string; label: string; icon: SidebarIconKey }[] =
    [
      { href: "/dashboard/blogs", label: "Blogs", icon: "blogs" },
      { href: "/dashboard/marketing", label: "Marketing", icon: "marketing" },
      {
        href: "/dashboard/promotions",
        label: "Promotions",
        icon: "promotions",
      },
    ];

  const adminLinks: { href: string; label: string; icon: SidebarIconKey }[] = [
    { href: "/dashboard/users", label: "Users", icon: "users" },
    { href: "/dashboard/media", label: "Media Library", icon: "media" },
    { href: "/dashboard/roles", label: "Roles & Permissions", icon: "roles" },
    { href: "/dashboard/activity", label: "Activity Logs", icon: "activity" },
    { href: "/dashboard/settings", label: "Settings", icon: "settings" },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#FAFAFA] text-[#111827]">
        <aside className="hidden h-screen w-[260px] shrink-0 flex-col border-r border-[#E5E7EB] bg-white md:flex">
          <div className="flex h-[4.5rem] flex-col justify-center border-b border-[#E5E7EB] px-6 py-0 shrink-0">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <div className="relative h-9 w-32 shrink-0 items-center">
                <Image
                  src={siteConfig.assets.logoUrl}
                  alt={`${siteConfig.name} Logo`}
                  fill
                  className="object-contain object-left"
                  priority
                  sizes="180px"
                />
              </div>
            </Link>
          </div>

          <div className="flex-1 px-4 py-6 flex flex-col gap-6">
            <div>
              <h4 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]/70">
                Workspace
              </h4>
              <nav className="flex flex-col space-y-0.5">
                {workspaceLinks.map((item) => (
                  <SidebarNavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                  />
                ))}
              </nav>
            </div>

            <div>
              <h4 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]/70">
                Content
              </h4>
              <nav className="flex flex-col space-y-0.5">
                {contentLinks.map((item) => (
                  <SidebarNavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                  />
                ))}
              </nav>
            </div>

            {isSuperadmin && (
              <div>
                <h4 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]/70">
                  Administration
                </h4>
                <nav className="flex flex-col space-y-0.5">
                  {adminLinks.map((item) => (
                    <SidebarNavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                    />
                  ))}
                </nav>
              </div>
            )}
          </div>

          <div className="mt-auto border-t border-[#E5E7EB] p-4 shrink-0">
            <SidebarUser email={profile.email} role={profile.role} />
          </div>
        </aside>

        <main className="flex min-h-screen min-w-0 flex-1 flex-col bg-[#FAFAFA]">
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white px-5 sm:px-8">
            <div className="flex items-center gap-4">
              <ActiveBreadcrumb />
            </div>

            <div className="mx-6 hidden max-w-md flex-1 md:block">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280]" />
                <Input
                  placeholder="Search..."
                  className="h-9 w-full border-[#E5E7EB] bg-[#FAFAFA] pl-9 pr-16 text-[14px] shadow-sm transition-all duration-200 focus-visible:ring-[#0F172A] rounded-md"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 border border-[#E5E7EB] bg-white px-1.5 font-mono text-[10px] font-medium text-[#6B7280] rounded">
                    <span className="text-xs">⌘</span>K
                  </kbd>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button className="flex h-9 w-9 items-center justify-center text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] rounded-md">
                <Bell className="h-5 w-5" />
              </button>
              <button className="flex h-9 w-9 items-center justify-center text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] rounded-md">
                <HelpCircle className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="flex-1 w-full overflow-x-hidden px-6 py-8 lg:px-8">
            {children}
          </div>
        </main>

        <Toaster richColors position="top-right" />
      </div>
    </SidebarProvider>
  );
}
