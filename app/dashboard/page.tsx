import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardHomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, role")
    .eq("id", user?.id ?? "")
    .single();

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Welcome back 👋</CardTitle>
          <CardDescription>
            Signed in as{" "}
            <span className="font-medium text-foreground">
              {profile?.email ?? user?.email ?? "Unknown"}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {profile && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Role:</span>
              <Badge
                variant={
                  profile.role === "superadmin" ? "default" : "secondary"
                }
              >
                {profile.role}
              </Badge>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            This is your Soakd admin dashboard. Use the sidebar to navigate
            between sections. More features like product and blog management are
            coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
