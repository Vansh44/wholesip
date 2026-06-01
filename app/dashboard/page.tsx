import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, ShieldCheck, Clock, ArrowRight } from "lucide-react";

export default async function DashboardHomePage() {
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
  ] = await Promise.all([supabase.auth.getUser()]);

  const [profileRes, statsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("email, role")
      .eq("id", user?.id ?? "")
      .single(),
    supabase
      .from("profiles")
      .select("role, force_password_reset", { count: "exact" }),
  ]);

  const profile = profileRes.data;
  const allProfiles = statsRes.data ?? [];

  const totalUsers = allProfiles.length;
  const superadminCount = allProfiles.filter(
    (p) => p.role === "superadmin",
  ).length;
  const pendingCount = allProfiles.filter((p) => p.force_password_reset).length;

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex flex-col gap-8 max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Welcome header with glass flair */}
      <div className="flex flex-col gap-1.5 pb-4 border-b border-border/40">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          {greeting} 👋
        </h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Signed in as</span>
          <span className="font-semibold text-foreground bg-muted/50 px-2 py-0.5 rounded-md">
            {profile?.email ?? user?.email ?? "Unknown"}
          </span>
          {profile && (
            <Badge
              variant={profile.role === "superadmin" ? "default" : "secondary"}
              className="shadow-sm"
            >
              {profile.role}
            </Badge>
          )}
        </div>
      </div>

      {/* Stats grid */}
      {profile?.role === "superadmin" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Card className="border-border/50 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 bg-gradient-to-br from-card to-muted/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Users
              </CardTitle>
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">
                {totalUsers}
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                Active dashboard members
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 bg-gradient-to-br from-card to-muted/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Superadmins
              </CardTitle>
              <div className="p-2 bg-violet-500/10 rounded-lg">
                <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">
                {superadminCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                Full access accounts
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 bg-gradient-to-br from-card to-muted/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Reset
              </CardTitle>
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">
                {pendingCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                Awaiting password setup
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Info card */}
      <Card className="border-border/50 shadow-sm bg-gradient-to-r from-primary/5 via-card to-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Getting Started{" "}
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground/80">
            What&apos;s available in this workspace
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3 leading-relaxed">
          <p>
            Use the sidebar to navigate between sections. More features like
            product and blog management are coming soon.
          </p>
          {profile?.role === "superadmin" && (
            <div className="p-3 bg-background rounded-md border border-border/50 shadow-sm">
              As a superadmin, you have access to{" "}
              <span className="font-semibold text-foreground">
                User Management
              </span>{" "}
              — invite team members and seamlessly manage their roles.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
