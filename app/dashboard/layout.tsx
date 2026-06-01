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

  // If profile doesn't exist, show setup instructions instead of redirecting
  // This prevents a redirect loop when the profiles table hasn't been created yet
  if (!profile || profileError) {
    if (profileError) {
      console.error("Dashboard layout profile fetch error:", profileError);
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="max-w-lg rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
          <h1 className="text-xl font-bold mb-2">⚠️ Profile Not Found</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Your user account exists in Supabase Auth, but no matching row was
            found in the <code className="bg-muted px-1 rounded">profiles</code>{" "}
            table.
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Please run the SQL schema in your Supabase SQL Editor to create the
            profiles table, then insert your profile row:
          </p>
          <pre className="bg-muted rounded-lg p-3 text-xs overflow-auto mb-4">
            {`INSERT INTO profiles (id, email, role, force_password_reset)
VALUES ('${user.id}', '${user.email}', 'superadmin', false);`}
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
        <SidebarHeader className="px-4 py-4">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight">
            soakd
          </Link>
          <p className="text-xs text-muted-foreground">Admin Dashboard</p>
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
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground">Dashboard</span>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>

      <Toaster richColors position="top-right" />
    </SidebarProvider>
  );
}
