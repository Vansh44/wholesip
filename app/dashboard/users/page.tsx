import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteUserDialog } from "./invite-user-dialog";
import { Users, Search } from "lucide-react";

interface Profile {
  id: string;
  email: string;
  role: string;
  force_password_reset: boolean;
  created_at: string;
}

export default async function UsersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive max-w-md shadow-sm">
        <div className="flex items-center gap-2 font-semibold mb-1">
          <span>⚠️</span> Failed to load users
        </div>
        <p className="text-destructive/80 leading-relaxed">
          Make sure you have superadmin access and the profiles table exists in
          your database.
        </p>
      </div>
    );
  }

  const typedProfiles = (profiles ?? []) as Profile[];
  const activeCount = typedProfiles.filter(
    (p) => !p.force_password_reset,
  ).length;
  const pendingCount = typedProfiles.filter(
    (p) => p.force_password_reset,
  ).length;

  return (
    <div className="flex flex-col gap-8 max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            User Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 font-medium">
            Manage dashboard access and roles for your team.
          </p>
        </div>
        <div className="shrink-0">
          <InviteUserDialog />
        </div>
      </div>

      {/* Quick stats mini-cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Total Members
          </p>
          <p className="text-3xl font-black mt-2 text-foreground">
            {typedProfiles.length}
          </p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Active
          </p>
          <p className="text-3xl font-black mt-2 text-emerald-600 dark:text-emerald-400">
            {activeCount}
          </p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Pending Setup
          </p>
          <p className="text-3xl font-black mt-2 text-amber-600 dark:text-amber-400">
            {pendingCount}
          </p>
        </div>
      </div>

      {/* Users table */}
      <Card className="border-border/60 shadow-md overflow-hidden rounded-xl">
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-primary/10 rounded-md">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  Team Directory
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {typedProfiles.length} active directory record
                  {typedProfiles.length !== 1 && "s"}
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-border/40">
                <TableHead className="pl-6 h-11 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  User
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Role
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="pr-6 h-11 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                  Date Added
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedProfiles.map((profile) => (
                <TableRow
                  key={profile.id}
                  className="group hover:bg-muted/40 transition-colors border-border/40"
                >
                  <TableCell className="pl-6 py-4">
                    <div className="flex items-center gap-3.5">
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-sm font-bold text-primary ring-1 ring-primary/10 shrink-0 shadow-sm">
                        {profile.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">
                            {profile.email}
                          </span>
                          {profile.id === user.id && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] uppercase tracking-wider px-1.5 py-0"
                            >
                              You
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge
                      variant={
                        profile.role === "superadmin" ? "default" : "outline"
                      }
                      className={`font-medium ${profile.role !== "superadmin" && "text-muted-foreground"}`}
                    >
                      {profile.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${profile.force_password_reset ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`}
                      />
                      <span
                        className={`text-xs font-medium ${profile.force_password_reset ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}
                      >
                        {profile.force_password_reset
                          ? "Pending Invite"
                          : "Active"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="pr-6 py-4 text-sm text-muted-foreground font-medium text-right">
                    {new Date(profile.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                </TableRow>
              ))}
              {typedProfiles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-16">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                        <Search className="h-6 w-6 opacity-40" />
                      </div>
                      <p className="font-semibold text-foreground">
                        No users found
                      </p>
                      <p className="text-sm mt-1 mb-4 max-w-sm text-center">
                        Your directory is currently empty. Start building your
                        team by inviting your first member.
                      </p>
                      <InviteUserDialog />
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
