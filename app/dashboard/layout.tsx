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
import { LayoutDashboard, Users } from "lucide-react";
import { SidebarUser } from "./sidebar-user";
import { ActiveBreadcrumb } from "./active-breadcrumb";

export const metadata = {
  title: "Soakd — Dashboard",
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
      <Sidebar>
        <SidebarHeader className="px-4 py-4 border-b">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-black">
                S
              </span>
            </div>
            <span className="text-base font-bold tracking-tight">soakd</span>
          </Link>
          <p className="text-xs text-muted-foreground mt-0.5">
            Admin Dashboard
          </p>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton render={<Link href="/dashboard" />}>
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {isSuperadmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/dashboard/users" />}
                    >
                      <Users className="h-4 w-4" />
                      <span>Users</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarUser email={profile.email} role={profile.role} />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <ActiveBreadcrumb />
        </header>
        <main className="flex-1 p-6 lg:p-8 bg-zinc-50/50 dark:bg-zinc-950/50 min-h-[calc(100vh-3.5rem)]">
          {children}
        </main>
      </SidebarInset>

      <Toaster richColors position="top-right" />
    </SidebarProvider>
  );
}
