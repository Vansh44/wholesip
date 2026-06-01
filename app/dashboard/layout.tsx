import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Toaster } from "@/components/ui/sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Package,
  Archive,
  LineChart,
  FileText,
  Megaphone,
  Tag,
  Shield,
  Activity,
  Settings,
  Search,
  Bell,
  HelpCircle,
} from "lucide-react";
import { SidebarUser } from "./sidebar-user";
import { ActiveBreadcrumb } from "./active-breadcrumb";
import { Input } from "@/components/ui/input";

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

  return (
    <SidebarProvider>
      <div className="relative flex min-h-screen w-full bg-background text-foreground">
        <Sidebar className="border-r border-border w-[260px] bg-sidebar">
          <SidebarHeader className="px-4 py-4 border-b border-border h-[72px] flex flex-col justify-center">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
                <span className="text-primary-foreground text-xs font-black">
                  S
                </span>
              </div>
              <span className="text-base font-bold tracking-tight text-primary">
                soakd
              </span>
            </Link>
          </SidebarHeader>

          <SidebarContent className="gap-0 py-2">
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Workspace
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/dashboard" />}
                      className="data-[active=true]:bg-accent data-[active=true]:text-accent-foreground data-[active=true]:border-l-2 data-[active=true]:border-primary transition-all duration-200"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      <span>Dashboard</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/dashboard/orders" />}
                      className="hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                    >
                      <ShoppingCart className="h-4 w-4" />
                      <span>Orders</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/dashboard/products" />}
                      className="hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                    >
                      <Package className="h-4 w-4" />
                      <span>Products</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/dashboard/customers" />}
                      className="hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                    >
                      <Users className="h-4 w-4" />
                      <span>Customers</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/dashboard/inventory" />}
                      className="hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                    >
                      <Archive className="h-4 w-4" />
                      <span>Inventory</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/dashboard/analytics" />}
                      className="hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                    >
                      <LineChart className="h-4 w-4" />
                      <span>Analytics</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="mt-4">
              <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Content
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/dashboard/blogs" />}
                      className="hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                    >
                      <FileText className="h-4 w-4" />
                      <span>Blogs</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/dashboard/marketing" />}
                      className="hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                    >
                      <Megaphone className="h-4 w-4" />
                      <span>Marketing</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/dashboard/promotions" />}
                      className="hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                    >
                      <Tag className="h-4 w-4" />
                      <span>Promotions</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {isSuperadmin && (
              <SidebarGroup className="mt-4">
                <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Administration
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        render={<Link href="/dashboard/users" />}
                        className="hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                      >
                        <Users className="h-4 w-4" />
                        <span>Users</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        render={<Link href="/dashboard/roles" />}
                        className="hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                      >
                        <Shield className="h-4 w-4" />
                        <span>Roles & Permissions</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        render={<Link href="/dashboard/activity" />}
                        className="hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                      >
                        <Activity className="h-4 w-4" />
                        <span>Activity Logs</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        render={<Link href="/dashboard/settings" />}
                        className="hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                      >
                        <Settings className="h-4 w-4" />
                        <span>Settings</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>

          <div className="mt-auto p-4 border-t border-border">
            <SidebarUser email={profile.email} role={profile.role} />
          </div>
        </Sidebar>

        <SidebarInset className="bg-background relative z-10 w-full flex flex-col">
          <header className="flex h-[72px] items-center justify-between border-b border-border px-6 bg-card sticky top-0 z-20 shrink-0">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="-ml-2" />
              <Separator orientation="vertical" className="h-6 bg-border" />
              <ActiveBreadcrumb />
            </div>

            <div className="flex-1 max-w-md mx-6">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  className="w-full pl-9 bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 group-hover:bg-muted"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    <span className="text-xs">⌘</span>K
                  </kbd>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <Bell className="h-5 w-5" />
              </button>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <HelpCircle className="h-5 w-5" />
              </button>
            </div>
          </header>

          <main className="flex-1 w-full max-w-[1440px] mx-auto p-8">
            {children}
          </main>
        </SidebarInset>

        <Toaster richColors position="top-right" />
      </div>
    </SidebarProvider>
  );
}
